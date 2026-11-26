"""Demand forecasting for supermarket inventory.

Pure-Python baseline: weighted moving average + linear trend over the daily
sales history the backend supplies. No external ML deps — swap in Prophet/
statsmodels later if the data justifies it. The output is advisory stock
guidance, not an authoritative inventory write.
"""
from __future__ import annotations

from statistics import mean, pstdev

from pydantic import BaseModel, Field


class DailySales(BaseModel):
    date: str  # ISO date, e.g. "2026-11-20"
    quantity: float = Field(ge=0)


class ForecastRequest(BaseModel):
    productId: str
    storeId: str | None = None
    daily: list[DailySales] = Field(default_factory=list)
    horizonDays: int = Field(default=7, ge=1, le=90)
    leadTimeDays: int = Field(default=1, ge=0)
    currentStock: float = Field(default=0, ge=0)
    serviceLevelZ: float = 1.65  # ~95% service level


class ForecastDay(BaseModel):
    dateOffset: int
    predictedQty: float
    lowerBound: float
    upperBound: float


class ForecastResponse(BaseModel):
    productId: str
    method: str
    dailyForecast: list[ForecastDay]
    recommendedOrderQty: float
    stockoutRiskDays: float | None
    notes: list[str] = Field(default_factory=list)


def forecast_demand(req: ForecastRequest) -> ForecastResponse:
    notes: list[str] = []
    daily = sorted(req.daily, key=lambda d: d.date)
    qtys = [d.quantity for d in daily]

    if len(qtys) < 14:
        notes.append(f"INSUFFICIENT_HISTORY:{len(qtys)} days — forecast confidence is low.")

    # Weighted moving average: recent days count more.
    if qtys:
        weights = [i + 1 for i in range(len(qtys))]
        wma = sum(q * w for q, w in zip(qtys, weights)) / sum(weights)
    else:
        wma = 0.0
        notes.append("NO_HISTORY: no sales data supplied; forecast assumes zero demand.")

    # Linear trend over the last 28 days (slope per day).
    window = qtys[-28:]
    slope = 0.0
    if len(window) >= 7:
        n = len(window)
        xs = list(range(n))
        mx, my = mean(xs), mean(window)
        denom = sum((x - mx) ** 2 for x in xs)
        if denom:
            slope = sum((x - mx) * (y - my) for x, y in zip(xs, window)) / denom
        # Damp extreme trends — a single promo week shouldn't extrapolate forever.
        slope = max(-wma * 0.2, min(wma * 0.2, slope))

    sigma = pstdev(qtys[-28:]) if len(qtys) >= 7 else (wma * 0.5 if wma else 1.0)

    horizon = req.horizonDays
    forecast: list[ForecastDay] = []
    cumulative = 0.0
    for h in range(1, horizon + 1):
        predicted = max(0.0, wma + slope * h)
        lower = max(0.0, predicted - req.serviceLevelZ * sigma)
        upper = predicted + req.serviceLevelZ * sigma
        forecast.append(ForecastDay(
            dateOffset=h, predictedQty=round(predicted, 2),
            lowerBound=round(lower, 2), upperBound=round(upper, 2),
        ))
        cumulative += predicted

    lead_demand = sum(d.predictedQty for d in forecast[: max(1, req.leadTimeDays)])
    safety_stock = req.serviceLevelZ * sigma * (req.leadTimeDays ** 0.5)
    recommended = max(0.0, cumulative + safety_stock - req.currentStock)

    stockout_days = None
    if wma > 0 and req.currentStock > 0:
        burn = max(0.01, wma + slope)
        stockout_days = round(req.currentStock / burn, 1)

    if slope > wma * 0.1:
        notes.append("TREND_UP: demand is trending upward — consider increasing order quantity.")
    elif slope < -wma * 0.1:
        notes.append("TREND_DOWN: demand is declining — avoid over-ordering.")

    return ForecastResponse(
        productId=req.productId,
        method="weighted_moving_average+linear_trend",
        dailyForecast=forecast,
        recommendedOrderQty=round(recommended, 2),
        stockoutRiskDays=stockout_days,
        notes=notes,
    )
