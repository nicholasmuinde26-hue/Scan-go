"""Behavioural fraud scoring for Scan & Go.

The Node backend sends aggregated, privacy-preserving session/basket statistics
(no raw coordinates, no PII) and this module returns a risk score plus the
signals that produced it. It is advisory: the backend decides what to do with
the score (add scrutiny, flag for review, etc.).

Signals are deliberately explainable — every point on the score maps to a
named signal a human reviewer can understand.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class FraudFeatures(BaseModel):
    """Aggregated session/basket statistics supplied by the backend."""
    # Basket event counters (from the unified sales engine ledger)
    removalCount: int = Field(default=0, ge=0)
    manualEntryCount: int = Field(default=0, ge=0)
    unknownBarcodeCount: int = Field(default=0, ge=0)
    totalItems: int = Field(default=0, ge=0)
    # Physical-layer evidence
    weightDeltaGrams: Optional[float] = None
    weightToleranceGrams: float = 250.0
    rfidMismatches: int = Field(default=0, ge=0)
    visionUnmatchedDetections: int = Field(default=0, ge=0)
    # Customer history
    priorConfirmedDiscrepancies: int = Field(default=0, ge=0)
    priorCleanTrips: int = Field(default=0, ge=0)
    # Session context
    basketSwapsDetected: int = Field(default=0, ge=0)
    sessionDurationMinutes: Optional[float] = None
    isGuest: bool = False


class FraudScoreResponse(BaseModel):
    score: int = Field(ge=0, le=100)
    band: str  # LOW | MEDIUM | HIGH | CRITICAL
    signals: list[str] = Field(default_factory=list)
    recommendedAction: str = "NONE"


def score_fraud(f: FraudFeatures) -> FraudScoreResponse:
    score = 0
    signals: list[str] = []

    def add(points: int, signal: str) -> None:
        nonlocal score
        score += points
        signals.append(signal)

    # --- Basket manipulation patterns -------------------------------------
    if f.removalCount >= 5:
        add(20, f"REPEATED_REMOVALS:{f.removalCount} items removed/rescanned during the session")
    elif f.removalCount >= 2:
        add(8, f"ITEM_REMOVALS:{f.removalCount} items removed during the session")

    if f.manualEntryCount >= 3:
        add(12, f"MANUAL_ENTRY_ABUSE:{f.manualEntryCount} barcodes typed manually (scanner avoidance?)")
    elif f.manualEntryCount == 1:
        add(3, "MANUAL_ENTRY:one barcode entered manually")

    if f.unknownBarcodeCount >= 3:
        add(15, f"UNKNOWN_BARCODES:{f.unknownBarcodeCount} unregistered codes scanned")
    elif f.unknownBarcodeCount >= 1:
        add(5, f"UNKNOWN_BARCODE:{f.unknownBarcodeCount} unregistered code(s) scanned")

    # --- Physical-layer contradictions ------------------------------------
    if f.weightDeltaGrams is not None:
        drift = abs(f.weightDeltaGrams)
        if drift > f.weightToleranceGrams * 3:
            add(25, f"WEIGHT_ANOMALY:{drift:.0f}g over expected (>{f.weightToleranceGrams * 3:.0f}g)")
        elif drift > f.weightToleranceGrams:
            add(10, f"WEIGHT_DRIFT:{drift:.0f}g over tolerance")

    if f.rfidMismatches > 0:
        add(min(30, 15 * f.rfidMismatches), f"RFID_MISMATCH:{f.rfidMismatches} tag(s) inconsistent with basket")

    if f.visionUnmatchedDetections >= 3:
        add(15, f"VISION_MISMATCH:{f.visionUnmatchedDetections} confident camera detections unmatched to basket")
    elif f.visionUnmatchedDetections >= 1:
        add(6, f"VISION_UNCERTAIN:{f.visionUnmatchedDetections} unmatched detection(s)")

    # --- Identity & history -----------------------------------------------
    if f.basketSwapsDetected > 0:
        add(30 * f.basketSwapsDetected, f"BASKET_SWAP:{f.basketSwapsDetected} basket rebind(s) mid-session")

    if f.priorConfirmedDiscrepancies > 0:
        add(min(25, 12 * f.priorConfirmedDiscrepancies),
            f"PRIOR_DISCREPANCIES:{f.priorConfirmedDiscrepancies} confirmed case(s) on record")

    # Guests get a small baseline bump: no purchase history to weigh against.
    if f.isGuest and f.priorCleanTrips == 0:
        add(5, "GUEST_NO_HISTORY:new guest with no prior clean trips")

    # Very short sessions with many items can indicate basket scanning without shopping.
    if f.sessionDurationMinutes is not None and f.sessionDurationMinutes < 3 and f.totalItems >= 15:
        add(10, f"RAPID_SCAN:{f.totalItems} items in {f.sessionDurationMinutes:.0f}min")

    score = min(100, score)

    if score >= 70:
        band, action = "CRITICAL", "HOLD_AND_INVESTIGATE"
    elif score >= 45:
        band, action = "HIGH", "FULL_BASKET_CHECK"
    elif score >= 20:
        band, action = "MEDIUM", "SPOT_CHECK"
    else:
        band, action = "LOW", "NONE"

    return FraudScoreResponse(score=score, band=band, signals=signals, recommendedAction=action)
