# SCAN & GO AI Service

Python sidecar for computer-vision and sensor-evidence reconciliation in the
exit-verification pipeline. It does **not** own any business state — the Node
backend remains authoritative for orders, baskets, payments and sessions.

## What it does

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Liveness + which vision engine is loaded |
| `POST /v1/verify-exit` | Reconcile expected basket/payment vs observed evidence → `GREEN` / `AMBER` / `RED` |
| `POST /v1/vision/analyze` | Analyse one frame (`imageBase64`) or accept edge-computed `detections` |
| `POST /v1/vision/analyze-upload` | Same, with a raw image request body |
| `POST /v1/fraud/score` | Score aggregated basket/session statistics → risk band + explainable signals |
| `POST /v1/forecast/demand` | Demand forecast + recommended order qty from daily sales history |

## Architecture fit

Python is the specialist-intelligence sidecar; **Node/TypeScript stays the
brain** — all business decisions, authorizations and financial records remain
in the MERN backend + MongoDB.

| Concern | Owner |
| --- | --- |
| Auth, sessions, baskets, orders, payments, POS, inventory writes | Node backend |
| Device gateway (HTTPS + MQTT ingestion) | Node backend (`/api/v1/devices`) |
| Exit decision authority | Node risk engine — AI can only escalate |
| Vision inference, fraud scoring, forecasting | This service (advisory) |

`/v1/verify-exit` also accepts `context.fraudFeatures` (basket counters +
customer history, no PII); HIGH/CRITICAL behavioural scores escalate the exit
band and add `FRAUD_REVIEW` tasks.

## Reconciliation rules

- Payment must be confirmed by the backend — never inferred.
- RFID/serialized tags are authoritative: unpaid tags → `RED`, missing paid tags → `AMBER`.
- Weight deltas beyond tolerance contribute score, never an accusation.
- Vision detections are probabilistic: unmatched high-confidence items push
  toward `AMBER`/`RED`; low-confidence output is treated as noise.
- No physical evidence at all → `AMBER` (human review), not `RED`.

A `RED` result means *withhold exit authorization and investigate* — it is not
a theft determination.

## Run

```bash
cd ai-service
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8090 --reload
```

## Configure the backend

```env
AI_SERVICE_URL=http://localhost:8090
AI_SERVICE_TIMEOUT_MS=2500
AI_SERVICE_API_KEY=            # optional shared secret; set the same value on both sides
```

If the service is unreachable or slow, the backend ignores it and continues
with the existing risk engine — exits never depend on this service being up.

## Wiring a real model

`app/vision.py` exposes a `Detector` class. Implement `load()` / `predict()`
(e.g. YOLOv8 ONNX on a Jetson or lane PC) and set `AI_VISION_MODEL_PATH`.
Edge devices can instead run inference locally and POST `detections` to
`/v1/vision/analyze` — no video ever needs to leave the store.
