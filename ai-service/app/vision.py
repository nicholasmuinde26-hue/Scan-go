"""Computer-vision frame analysis.

Two input modes:

1. `analyze_frame(image_b64)` — decode a JPEG/PNG frame and run whatever
   detector is configured. Today that is a stub that returns an empty
   detection set; drop a YOLO/ONNX model behind `Detector` and it lights up
   without changing the API.

2. Edge devices (Jetson, lane PCs) may run inference locally and POST the
   structured `detections` directly — the service forwards them into the
   reconciler unchanged, because confidence semantics live in the model, not
   here.
"""
from __future__ import annotations

import base64
import binascii
from typing import Optional

from .schemas import VisionDetection


class Detector:
    """Placeholder for a real model (YOLO-family / ONNX / TFLite).

    `load()` is called once at startup. `predict()` returns detections with
    confidence scores. Until a model is wired in, predict() returns [].
    """

    def __init__(self) -> None:
        self.ready = False
        self.model_name = "none"

    def load(self) -> None:
        # TODO: load weights from AI_VISION_MODEL_PATH (e.g. YOLOv8/ONNX).
        self.ready = False
        self.model_name = "stub"

    def predict(self, image_bytes: bytes) -> list[VisionDetection]:
        if not self.ready:
            return []
        # TODO: run inference, map class ids -> product labels, apply NMS.
        return []


detector = Detector()


def analyze_frame(image_b64: str) -> dict:
    """Decode a base64 image and return structured detections."""
    try:
        image_bytes = base64.b64decode(image_b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        return {"ok": False, "error": f"invalid base64 image: {exc}"}

    if not image_bytes:
        return {"ok": False, "error": "empty image payload"}

    detections = detector.predict(image_bytes)
    return {
        "ok": True,
        "engine": detector.model_name,
        "modelReady": detector.ready,
        "detections": [d.model_dump() for d in detections],
    }


def passthrough_detections(detections: list[VisionDetection]) -> dict:
    """Accept detections computed by an edge device / lane controller."""
    return {
        "ok": True,
        "engine": "edge_device",
        "modelReady": True,
        "detections": [d.model_dump() for d in detections],
    }
