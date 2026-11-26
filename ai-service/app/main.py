"""SCAN & GO — AI Exit Verification Service.

A small FastAPI sidecar that sits next to the Node backend. It receives the
server-authoritative basket + payment state plus physical observations and
returns a GREEN / AMBER / RED exit recommendation.

It is advisory by design: the Node backend's risk engine remains the final
authority. If this service is down, exits continue to work on the existing
rules — the AI layer only ever *adds* scrutiny, never removes it.

Run locally:
    pip install -r requirements.txt
    uvicorn app.main:app --host 0.0.0.0 --port 8090 --reload
"""
from __future__ import annotations

import os

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .forecast import ForecastRequest, forecast_demand
from .fraud import FraudFeatures, score_fraud
from .schemas import VerifyExitRequest, VerifyExitResponse, VisionDetection
from .verification import reconcile
from .vision import analyze_frame, detector, passthrough_detections

API_KEY = os.environ.get("AI_SERVICE_API_KEY", "")

app = FastAPI(
    title="Scan & Go AI Service",
    version="0.1.0",
    description="Computer-vision and sensor evidence reconciliation for exit verification.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("AI_SERVICE_CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    detector.load()


def _check_key(x_api_key: str | None) -> None:
    """Shared-secret guard for service-to-service calls. Disabled when
    AI_SERVICE_API_KEY is unset (local development)."""
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="invalid service key")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "ai-exit-verification",
        "visionEngine": detector.model_name,
        "visionReady": detector.ready,
    }


@app.post("/v1/verify-exit", response_model=VerifyExitResponse)
def verify_exit(
    body: VerifyExitRequest,
    x_api_key: str | None = Header(default=None),
) -> VerifyExitResponse:
    """Reconcile expected basket/payment state against physical evidence.

    The backend calls this during exit verification. `observed` may be empty —
    the service then returns AMBER (insufficient evidence) rather than guessing.
    """
    _check_key(x_api_key)
    return reconcile(body)


@app.post("/v1/fraud/score")
def fraud_score(
    body: FraudFeatures,
    x_api_key: str | None = Header(default=None),
) -> dict:
    """Score aggregated session/basket statistics for suspicious patterns.

    Advisory only — the backend decides the enforcement action. The response
    explains itself: every point on `score` maps to a named signal.
    """
    _check_key(x_api_key)
    return score_fraud(body).model_dump()


@app.post("/v1/forecast/demand", response_model=dict)
def forecast(
    body: ForecastRequest,
    x_api_key: str | None = Header(default=None),
):
    """Demand forecast + recommended order quantity from daily sales history.

    Baseline weighted-moving-average + damped linear trend. Swap in a heavier
    model later without changing this contract.
    """
    _check_key(x_api_key)
    return forecast_demand(body).model_dump()


class AnalyzeRequest(BaseModel):
    imageBase64: str | None = None
    detections: list[VisionDetection] | None = None


@app.post("/v1/vision/analyze")
def vision_analyze(
    body: AnalyzeRequest,
    x_api_key: str | None = Header(default=None),
) -> dict:
    """Frame analysis endpoint.

    - Send `imageBase64` to have this service decode + run its detector.
    - Send `detections` when inference already ran on an edge device.
    """
    _check_key(x_api_key)
    if body.detections is not None:
        return passthrough_detections(body.detections)
    if body.imageBase64:
        return analyze_frame(body.imageBase64)
    raise HTTPException(status_code=400, detail="provide imageBase64 or detections")


@app.post("/v1/vision/analyze-upload")
async def vision_analyze_upload(
    request: Request,
    x_api_key: str | None = Header(default=None),
) -> dict:
    """Raw image upload (multipart not required — body is the image bytes)."""
    _check_key(x_api_key)
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="empty body")
    import base64

    return analyze_frame(base64.b64encode(data).decode())
