# Smart Scan & Go Retail Fraud-Prevention & Supermarket Pickup System

A comprehensive supermarket retail platform built with **MERN + TypeScript** (MongoDB, Express, React, Node.js, and Tailwind CSS), implementing:
1. **Pre-Order & Controlled Pickup (Model A / Model C)**: Shop first digitally, select collection slot, pay via M-Pesa, barcode-verified staff shelf picking, produce scale weighing, substitution management, dual-employee verification & packing, single-use QR/OTP handover, and controlled add-on shopping.
2. **In-Store Smart Scan & Go**: Real-time camera & manual barcode scanning, server-side authoritative pricing (in KES minor cents), behavioral risk logging (manual entries, removals, unknown barcodes, high-theft items), immutable order snapshots, and Safaricom M-Pesa STK Push.
3. **Exit Verification & Anti-Fraud Engine**: Independent physical cart scanning at exit lanes, digital-to-physical basket comparison (detecting excess unrecorded goods, barcode swaps, missing items), risk scoring bands (`GREEN`, `AMBER`, `AMBER_FULL`, `RED`), discrepancy resolution workflows (pay difference via M-Pesa top-up, return extra items to shelf, or supervisor PIN override), and fail-closed atomic single-use HMAC receipt redemption.
4. **Operations & Admin Console**: Loss prevention analytics, shrinkage prevented metrics, configurable fraud thresholds, and immutable audit logging.

---

## Architecture Overview

```
scanAndGoApplication/
├── backend/
│   ├── src/
│   │   ├── config/             # MongoDB connection & Environment variables
│   │   ├── middleware/         # JWT Authentication & RBAC Authorization
│   │   ├── modules/
│   │   │   ├── auth/           # User registration, login, demo persona switcher
│   │   │   ├── stores/         # Branches, pickup slots, exit lanes, fraud policies
│   │   │   ├── products/       # Barcodes, KES prices, weights, high-theft flags
│   │   │   ├── baskets/        # Telemetry events (scans, removals, manual entries)
│   │   │   ├── orders/         # Immutable snapshots, basket hashes, add-ons
│   │   │   ├── payments/       # Safaricom M-Pesa STK Push & amount verification
│   │   │   ├── picking/        # Barcode shelf checks, scales, substitutions, dual packing
│   │   │   ├── exit-verification/ # Risk Engine, physical check, discrepancy resolver
│   │   │   └── audits/         # Tamper-evident logs & loss prevention metrics
│   │   ├── scripts/seed.ts     # Authentic Kenyan grocery seed data
│   │   ├── app.ts              # Express application setup
│   │   └── server.ts           # Server bootstrap (Port 5000)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.tsx
│   │   │   ├── PersonaSelector.tsx
│   │   │   ├── CustomerScanAndGo.tsx
│   │   │   ├── CustomerClickAndCollect.tsx
│   │   │   ├── StaffPickingStation.tsx
│   │   │   ├── StaffExitVerification.tsx
│   │   │   └── AdminDashboard.tsx
│   │   ├── App.tsx
│   │   ├── api.ts
│   │   └── types.ts
│   ├── vite.config.ts          # Vite proxy to backend (Port 3000)
│   └── package.json
└── README.md
```

---

## Quick Start & Running the System

### 1. Backend Server
```bash
cd backend
npm install
npm run seed     # Seeds realistic stores, products, barcodes, and demo accounts
npm run dev      # Runs Express API at http://localhost:5000
```

### 2. Frontend Application
```bash
cd frontend
npm install
npm run dev      # Runs Vite app at http://localhost:3000
```

Open your browser to [http://localhost:3000](http://localhost:3000).

---

## Demo Personas & Testing Guide

You can switch personas at any time using the **Switch User** button in the top navigation bar:

| Persona | Role | Description |
|---|---|---|
| **John Kamau** | `CUSTOMER` (Trusted) | 8 clean shopping trips, zero discrepancies. Low baseline risk score. |
| **Kevin Otieno** | `CUSTOMER` (High-Risk) | 2 previous confirmed discrepancies. Triggers automatic `AMBER` or `RED` scrutiny at exit lanes. |
| **Mary Wanjiku** | `PICKER` | Supermarket employee who picks items from shelves, verifies barcodes, weighs produce, and requests substitutions. |
| **David Kiprop** | `EXIT_STAFF` | Stationed at exit express lanes to scan receipts and independently inspect physical cart goods. |
| **Grace Muthoni** | `SUPERVISOR` | Can authorize discrepancy overrides with supervisor PIN (`1234`), handle customer disputes, and approve returns. |
| **James Mwangi** | `STORE_MANAGER` | Configures loss prevention rules, monitors shrinkage prevented in KES, and views tamper-evident audit trails. |

---

## Fraud Scenarios Included for Demonstration

### Scenario A: +2 Unrecorded Products (Shrinkage Interception)
1. In the **In-Store Scan & Go** tab, scan 2 items and checkout with M-PESA.
2. Note the generated **Signed QR Receipt**.
3. Go to the **Exit Lane Anti-Fraud** tab and verify the receipt.
4. Click **Simulate +2 Unrecorded Oil (+KES 620 Theft)** under the physical cart test cases.
5. Click **Run Digital vs Physical Comparison**.
6. The engine immediately flags `RED: MISMATCH DETECTED` and blocks exit.
7. Open **Resolve Discrepancy** to see the 3 resolution workflows:
   - Pay difference via linked M-PESA top-up order
   - Return extra items to shelf
   - Supervisor PIN override

### Scenario B: Barcode Substitution (Swapping Cheap Barcode for Whiskey)
1. Customer pays for bread (`KES 70.00`).
2. Customer places Johnnie Walker Black Label (`KES 3,850.00`) in their physical cart.
3. At the exit lane, the independent barcode scanner scans the physical product.
4. The system flags the mismatch, blocks departure, and logs the attempted substitution.

### Scenario C: Single-Use Receipt Replay Prevention
1. Clear an authorized exit once.
2. Try scanning the same receipt a second time.
3. The Fraud Engine immediately triggers `RED: ALREADY_USED` and alerts store security of potential duplicate receipt or screenshot reuse.
