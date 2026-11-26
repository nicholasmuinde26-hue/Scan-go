"""Request/response schemas for the AI exit-verification service.

The service is deliberately evidence-in / decision-out: the Node backend sends
the server-verified basket and payment state plus whatever physical observations
(cameras, basket sensors, RFID, lane scanners) it has, and receives a
GREEN / AMBER / RED recommendation with reasons. It never touches the database.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class ExpectedItem(BaseModel):
    barcode: str
    name: str
    quantity: int = Field(ge=0)
    unitPriceMinor: int = Field(default=0, ge=0)


class ExpectedBasket(BaseModel):
    """The server-authoritative view of what should be leaving the store."""
    items: list[ExpectedItem] = Field(default_factory=list)
    totalMinor: int = Field(default=0, ge=0)
    totalItems: int = Field(default=0, ge=0)
    paid: bool = False
    paymentStatus: str = "UNPAID"  # UNPAID | PENDING | PAID | PARTIALLY_PAID | REFUNDED


class VisionDetection(BaseModel):
    """One object a camera/edge model believes it saw.

    `label` is a free-form product/category label. `confidence` is 0..1 and MUST
    reflect the model's own uncertainty — the reconciler treats low-confidence
    detections as weak evidence, never as accusations.
    """
    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: Optional[list[float]] = None  # [x, y, w, h] normalised 0..1
    source: str = "camera"  # camera | edge_device | manual


class BarcodeObservation(BaseModel):
    barcode: str
    quantity: int = Field(default=1, ge=0)
    source: str = "lane_scanner"  # lane_scanner | handheld | basket_scanner | rfid


class SensorEvidence(BaseModel):
    """Physical sensor readings attached to the basket/session."""
    weightDeltaGrams: Optional[float] = None       # change vs expected basket weight
    weightToleranceGrams: float = 250.0            # store-configured tolerance
    rfidSerials: list[str] = Field(default_factory=list)
    rfidExpectedPaid: list[str] = Field(default_factory=list)
    basketId: Optional[str] = None
    basketBoundToSession: Optional[bool] = None    # False => possible basket swap


class ObservedEvidence(BaseModel):
    vision: list[VisionDetection] = Field(default_factory=list)
    barcodeScans: list[BarcodeObservation] = Field(default_factory=list)
    sensors: Optional[SensorEvidence] = None


class VerifyExitRequest(BaseModel):
    orderId: Optional[str] = None
    storeId: Optional[str] = None
    sessionId: Optional[str] = None
    exitEventId: Optional[str] = None
    expected: ExpectedBasket
    observed: ObservedEvidence = Field(default_factory=ObservedEvidence)
    context: dict = Field(default_factory=dict)  # free-form: lane, timeOfDay, priorFlags...


Decision = Literal["GREEN", "AMBER", "RED"]


class VerifyExitResponse(BaseModel):
    decision: Decision
    confidence: float = Field(ge=0.0, le=1.0)
    score: int = Field(ge=0, le=100)
    reasons: list[str] = Field(default_factory=list)
    tasks: list[str] = Field(default_factory=list)
    evidence: dict = Field(default_factory=dict)
