"""Exit-evidence reconciliation.

Combines the server-authoritative basket/payment state with physical
observations (vision detections, lane scans, basket sensors, RFID) and returns
GREEN / AMBER / RED.

Design rules (from the SCAN & GO 2.0 spec):
- Payment is only "confirmed" when the backend says so — never inferred.
- AI uncertainty produces AMBER (human check), never an accusation.
- RED is reserved for hard contradictions: unpaid sale, basket swap, RFID
  mismatch, or multiple high-confidence unaccounted items.
- A red result is a request for investigation, not a theft label.
"""
from __future__ import annotations

import re
from collections import Counter

from .fraud import FraudFeatures, score_fraud
from .schemas import ObservedEvidence, VerifyExitRequest, VerifyExitResponse

# Below this, a vision detection is treated as noise rather than evidence.
VISION_MIN_CONFIDENCE = 0.45
# Detections at/above this are strong enough to drive AMBER on their own.
VISION_STRONG_CONFIDENCE = 0.70

# Loose label -> expected-item matching. Product names differ between the
# catalogue ("Cooking Oil 1L") and a vision model ("oil bottle"), so we match on
# shared significant tokens rather than exact strings.
STOPWORDS = {
    "the", "and", "for", "with", "pack", "pkt", "x", "of", "a", "an",
    "kg", "g", "ml", "l", "pcs", "pc",
}


def _tokens(text: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", text.lower()) if t and t not in STOPWORDS}


def _expected_tokens(item_name: str) -> set[str]:
    return _tokens(item_name)


def _detection_matches_expected(label: str, expected_names: list[str]) -> bool:
    label_tokens = _tokens(label)
    if not label_tokens:
        return False
    for name in expected_names:
        exp_tokens = _expected_tokens(name)
        if not exp_tokens:
            continue
        # A detection matches when it shares at least one meaningful token and
        # no strong contradiction. One shared token is weak but acceptable at
        # this stage — the physical-check flow does the precise barcode work.
        if label_tokens & exp_tokens:
            return True
    return False


def reconcile(req: VerifyExitRequest) -> VerifyExitResponse:
    expected = req.expected
    observed: ObservedEvidence = req.observed
    reasons: list[str] = []
    tasks: list[str] = []
    evidence: dict = {"sources": []}

    score = 0
    hard_red = False

    # ------------------------------------------------------------------
    # 1. Payment gate — the single non-negotiable check.
    # ------------------------------------------------------------------
    paid_confirmed = expected.paid and expected.paymentStatus.upper() in {
        "PAID", "CONFIRMED", "SETTLED", "COMPLETED",
    }
    if not paid_confirmed:
        hard_red = True
        score = 100
        reasons.append(
            f"PAYMENT_NOT_CONFIRMED: order paymentStatus={expected.paymentStatus!r}, "
            f"paid={expected.paid}. Exit credentials require a settled payment."
        )
        tasks.append("HOLD_EXIT: verify payment with the payment provider before releasing goods.")
    evidence["paymentConfirmed"] = paid_confirmed

    # ------------------------------------------------------------------
    # 2. Basket identity — a basket bound to a different session is a swap.
    # ------------------------------------------------------------------
    sensors = observed.sensors
    if sensors and sensors.basketBoundToSession is False:
        hard_red = True
        score = max(score, 90)
        reasons.append("BASKET_SWAP_SUSPECTED: physical basket is not bound to this shopping session.")
        tasks.append("VERIFY_BASKET: confirm which basket belongs to this customer session.")
    if sensors and sensors.basketId:
        evidence["basketId"] = sensors.basketId
        evidence["sources"].append("basket_sensor")

    # ------------------------------------------------------------------
    # 3. RFID / serialized tags — authoritative when present.
    # ------------------------------------------------------------------
    if sensors and sensors.rfidSerials:
        evidence["sources"].append("rfid")
        paid_set = set(sensors.rfidExpectedPaid)
        unpaid = [s for s in sensors.rfidSerials if s not in paid_set]
        missing = [s for s in paid_set if s not in sensors.rfidSerials]
        if unpaid:
            hard_red = True
            score = max(score, 95)
            reasons.append(
                f"RFID_UNPAID_TAGS: {len(unpaid)} serialized item(s) read at exit are not paid for this order."
            )
            tasks.append("CHECK_TAGS: scan serialized tags against the receipt before releasing.")
        if missing:
            score = max(score, 60)
            reasons.append(
                f"RFID_MISSING_TAGS: {len(missing)} paid serialized item(s) were not read at exit."
            )
            tasks.append("LOCATE_MISSING_ITEMS: confirm paid tagged items are still with the customer.")

    # ------------------------------------------------------------------
    # 4. Weight evidence — a signal, never a verdict.
    # ------------------------------------------------------------------
    if sensors and sensors.weightDeltaGrams is not None:
        evidence["sources"].append("weight_sensor")
        tolerance = sensors.weightToleranceGrams
        delta = abs(sensors.weightDeltaGrams)
        evidence["weightDeltaGrams"] = sensors.weightDeltaGrams
        if delta > tolerance * 3:
            score = max(score, 55)
            reasons.append(
                f"WEIGHT_ANOMALY: basket weight differs from expected by {delta:.0f}g "
                f"(tolerance {tolerance:.0f}g). Could be removed items or sensor error."
            )
            tasks.append("WEIGH_BASKET: verify physical basket weight at the lane.")
        elif delta > tolerance:
            score = max(score, 30)
            reasons.append(
                f"WEIGHT_DRIFT: basket weight differs by {delta:.0f}g, above the {tolerance:.0f}g tolerance."
            )

    # ------------------------------------------------------------------
    # 5. Lane / basket scanner barcode observations.
    # ------------------------------------------------------------------
    expected_barcodes = {item.barcode for item in expected.items if item.barcode}
    expected_names = [item.name for item in expected.items]
    if observed.barcodeScans:
        evidence["sources"].append("barcode_scan")
        scanned_barcodes = Counter()
        for scan in observed.barcodeScans:
            scanned_barcodes[scan.barcode] += scan.quantity
        unknown_scans = [
            (bc, qty) for bc, qty in scanned_barcodes.items() if bc not in expected_barcodes
        ]
        if unknown_scans:
            score = max(score, 45)
            reasons.append(
                f"UNEXPECTED_SCANS: {len(unknown_scans)} barcode(s) read at exit are not on the paid receipt "
                f"(e.g. {unknown_scans[0][0]})."
            )
            tasks.append("CHECK_SCANNED_ITEMS: confirm items scanned at the lane against the receipt.")

    # ------------------------------------------------------------------
    # 6. Computer-vision observations — probabilistic evidence only.
    # ------------------------------------------------------------------
    strong_detections = [
        d for d in observed.vision if d.confidence >= VISION_MIN_CONFIDENCE
    ]
    if observed.vision:
        evidence["sources"].append("vision")
        evidence["visionDetections"] = len(observed.vision)

    if strong_detections:
        matched = sum(
            1 for d in strong_detections
            if _detection_matches_expected(d.label, expected_names)
        )
        unmatched = [
            d for d in strong_detections
            if not _detection_matches_expected(d.label, expected_names)
        ]
        strong_unmatched = [d for d in unmatched if d.confidence >= VISION_STRONG_CONFIDENCE]
        evidence["visionMatched"] = matched
        evidence["visionUnmatched"] = len(unmatched)

        if strong_unmatched:
            top = max(strong_unmatched, key=lambda d: d.confidence)
            score = max(score, 50 if len(strong_unmatched) <= 2 else 70)
            reasons.append(
                f"VISION_MISMATCH: camera confidently sees '{top.label}' "
                f"({top.confidence:.0%}) which does not match any paid item. "
                f"{len(strong_unmatched)} unmatched detection(s) total."
            )
            tasks.append("VISUAL_CHECK: exit assistant compares carried items with the receipt.")
        elif unmatched:
            score = max(score, 25)
            reasons.append(
                f"VISION_UNCERTAIN: {len(unmatched)} detection(s) could not be matched to paid items "
                "(low/medium confidence — may be packaging variants)."
            )
    elif observed.vision:
        reasons.append("VISION_LOW_CONFIDENCE: camera output was below the evidence threshold.")

    # ------------------------------------------------------------------
    # 6b. Behavioural fraud signals — aggregated basket/session statistics
    #     supplied by the backend in `context.fraudFeatures`. Advisory:
    #     escalates the band, never creates a hard red on its own.
    # ------------------------------------------------------------------
    fraud_ctx = (req.context or {}).get("fraudFeatures")
    if isinstance(fraud_ctx, dict):
        try:
            fs = score_fraud(FraudFeatures(**fraud_ctx))
            evidence["fraudScore"] = fs.score
            evidence["fraudBand"] = fs.band
            evidence["fraudSignals"] = fs.signals
            if fs.band in {"HIGH", "CRITICAL"}:
                score = max(score, min(84, fs.score))
                reasons.append(f"FRAUD_PATTERNS: behavioural score {fs.score}/100 ({fs.band}) — {len(fs.signals)} signal(s).")
                for s in fs.signals[:5]:
                    reasons.append(f"FRAUD_SIGNAL: {s}")
                tasks.append("FRAUD_REVIEW: supervisor reviews session event log before release.")
            elif fs.score >= 20:
                score = max(score, min(score + 10, 40))
        except Exception:
            pass  # malformed features must never break exit verification

    # ------------------------------------------------------------------
    # 7. No physical evidence at all — the AI layer saw nothing.
    #    Absence of evidence is not evidence of absence: AMBER, not RED.
    # ------------------------------------------------------------------
    if not evidence["sources"]:
        score = max(score, 35)
        reasons.append("NO_PHYSICAL_EVIDENCE: no camera, scanner, weight or RFID observations were supplied.")
        tasks.append("MANUAL_REVIEW: lane staff verify the basket against the receipt.")

    # ------------------------------------------------------------------
    # Decision mapping.
    # ------------------------------------------------------------------
    if hard_red or score >= 85:
        decision = "RED"
    elif score >= 30:
        decision = "AMBER"
    else:
        decision = "GREEN"

    # Confidence reflects how much evidence backed the decision.
    n_sources = len(evidence["sources"])
    confidence = round(min(0.95, 0.4 + 0.15 * n_sources + (0.2 if paid_confirmed else 0.0)), 2)
    if decision == "RED":
        confidence = max(confidence, 0.8)

    reasons.insert(0, f"AI_EXIT: decision={decision} score={score} sources={n_sources or 'none'}")

    return VerifyExitResponse(
        decision=decision,
        confidence=confidence,
        score=score,
        reasons=reasons,
        tasks=tasks,
        evidence=evidence,
    )
