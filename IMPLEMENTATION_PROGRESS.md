# Scan & Go Application - Implementation Progress

## Overview
This document tracks the implementation of comprehensive security and feature enhancements for the Scan & Go retail application.

## Completed Phases

### ✅ Phase 1: Foundations
**Status:** Completed

**Implemented:**
- Input validation with Zod schemas (`backend/src/shared/validation/schemas.ts`)
  - User, Store, Organization, Product, Order, Payment validation schemas
  - Helper functions for request body and query validation
- Tenant context middleware (`backend/src/middleware/tenant.ts`)
  - Resolves organization and store context from authenticated user
  - Validates subscription status (ACTIVE vs SUSPENDED)
  - Handles SYSTEM_ADMIN, ORG_ADMIN, STORE_MANAGER, and CUSTOMER contexts
  - Blocks operations for suspended organizations
- Fixed `scopeToStore` middleware to allow ORG_ADMIN users
- Removed Daraja secrets from SystemConfig model (moved to environment variables only)
- Enhanced environment validation with stricter production checks

**Files Created:**
- `backend/src/shared/validation/schemas.ts`
- `backend/src/middleware/tenant.ts`

**Files Modified:**
- `backend/src/middleware/auth.ts`
- `backend/src/modules/system-config/system-config.model.ts`
- `backend/src/config/environment.ts`

---

### ✅ Phase 2: Data Model Migration
**Status:** Completed

**Implemented:**
- Migration script to migrate existing Stores into Organizations
- Added subscription fields to Organization model
  - Plan (FREE, BASIC, PRO, ENTERPRISE)
  - Status (ACTIVE, GRACE, INACTIVE, SUSPENDED)
  - Current period start/end dates
  - Grace period tracking
- Organization status enum added

**Files Created:**
- `backend/src/scripts/migrate-organizations.ts`

**Files Modified:**
- `backend/src/modules/organizations/organization.model.ts`
- `backend/package.json` (added migration script)

**Migration Command:**
```bash
npm run migrate-organizations
```

---

### ✅ Phase 3: Security Fixes
**Status:** Completed

**Implemented:**
- Fixed `/payments/mpesa/reconcile` to properly validate Authorization header
  - Now actually verifies JWT token validity
- Fixed `getClientIp` to not blindly trust spoofable `X-Forwarded-For` header
  - Prefers direct connection IP
  - Added comment about trusted proxy configuration
- Fixed `PUT /products/:id` to include tenant check
  - STORE_MANAGER can only edit products in their assigned store
- Fixed `GET /stores` to not expose manager phone/email publicly
  - Removed phone and email from public populate
- Fixed CORS configuration
  - No longer uses `origin: true` when ALLOWED_ORIGINS is unset
  - In development, allows localhost; in production, requires explicit origins
- Fixed `stk-push` to verify order belongs to caller
  - Customers can only initiate payment for their own orders

**Files Modified:**
- `backend/src/modules/payments/payment.routes.ts`
- `backend/src/modules/payments/daraja.service.ts`
- `backend/src/modules/products/product.routes.ts`
- `backend/src/modules/stores/store.routes.ts`
- `backend/src/app.ts`

---

### ✅ Phase 4: Real Payments
**Status:** Completed

**Implemented:**
- Implemented actual Daraja STK Push integration
  - Calls real Daraja API endpoint
  - Normalizes phone numbers to 2547... format
  - Converts cents to whole shillings (rounds up)
  - Falls back to simulation mode in development if Daraja not configured
- Added payment idempotency
  - Only one active pending payment per order
  - Returns 409 Conflict if payment already in progress
- Fixed cents vs shillings mismatch
  - Daraja takes whole shillings, app uses cents
  - Stores expected amount in cents for consistency
  - Rounds up when converting to shillings

**Files Modified:**
- `backend/src/modules/payments/payment.routes.ts`

---

### ✅ Phase 5: Permissions System
**Status:** Completed

**Implemented:**
- Added new permissions for advanced features
  - `inventory:write`, `inventory:read`
  - `offers:manage`
  - `wallet:read`, `wallet:write`
  - `payouts:approve`, `payouts:view`
  - `subscriptions:manage`, `subscriptions:view`
  - `org:config`, `org:users:manage`
- Updated ROLE_PERMISSIONS with new permissions
- Added permission overrides to User model
  - `permissionOverrides.granted` - additional permissions
  - `permissionOverrides.revoked` - removed permissions
- Added workspace switcher for SYSTEM_ADMIN
  - `actingAsOrganizationId`
  - `actingAsStoreId`
- Updated authenticate middleware to apply permission overrides
- Created user permissions routes
  - GET `/api/v1/users/me/permissions` - get effective permissions
  - POST `/api/v1/users/:userId/permissions` - set overrides
  - DELETE `/api/v1/users/:userId/permissions` - clear overrides
  - POST `/api/v1/users/me/switch-workspace` - set workspace context
  - DELETE `/api/v1/users/me/switch-workspace` - clear workspace context
- Updated `/auth/me` to return permissions and acting-as context

**Files Created:**
- `backend/src/modules/users/user-permissions.routes.ts`

**Files Modified:**
- `backend/src/middleware/auth.ts`
- `backend/src/modules/users/user.model.ts`
- `backend/src/modules/auth/auth.routes.ts`
- `backend/src/app.ts`

---

### ✅ Phase 6: Ledger and Wallets
**Status:** Completed

**Implemented:**
- Double-entry ledger system
  - LedgerEntry model with append-only entries
  - Unique key per payment for idempotency
  - Debit/Credit accounting with account codes
  - Chart of accounts (Cash, Revenue, Payable, Refunds, Adjustments)
- Ledger service with transaction creation
  - `createLedgerTransaction` - creates balanced debit/credit entries
  - `recordPaymentRevenue` - splits payment into platform fee and store share
  - `recordRefund` - reverses payment entries
  - `getStoreBalance` - calculates store payable balance
  - `getPlatformRevenue` - calculates platform fee income
  - `verifyLedgerIntegrity` - nightly reconciliation check
- Payout system
  - Payout model with status tracking
  - Payout request approval workflow
  - Ledger entries for payouts
  - Balance checking before payout
- Payout routes
  - POST `/api/v1/ledger/payouts` - request payout
  - GET `/api/v1/ledger/payouts` - list payouts
  - POST `/api/v1/ledger/payouts/:payoutId/approve` - approve payout
  - GET `/api/v1/ledger/balance/:storeId` - get store balance
  - GET `/api/v1/ledger/revenue` - get platform revenue
  - GET `/api/v1/ledger/verify` - verify ledger integrity

**Fee Configuration:**
- Default platform fee: 5%
- Default store share: 95%

**Files Created:**
- `backend/src/modules/ledger/ledger.model.ts`
- `backend/src/modules/ledger/ledger.service.ts`
- `backend/src/modules/ledger/payout.model.ts`
- `backend/src/modules/ledger/payout.routes.ts`

**Files Modified:**
- `backend/src/app.ts`

---

### ✅ Phase 7: Subscriptions
**Status:** Completed

**Implemented:**
- Subscription model with plan configuration
  - Plans: FREE, BASIC, PRO, ENTERPRISE
  - Status: ACTIVE, PAST_DUE, CANCELLED
  - Feature flags per plan
  - Store limits per plan
  - Monthly/annual pricing
- Subscription service
  - `getOrCreateSubscription` - get or create org subscription
  - `changeSubscriptionPlan` - upgrade/downgrade plans
  - `processSubscriptionStates` - daily job to move orgs through states
  - `checkSubscriptionGate` - check if operation allowed based on subscription
- Plan configuration with features and pricing
  - FREE: 1 store, basic features
  - BASIC: 3 stores, KES 1,000/month
  - PRO: 10 stores, KES 3,000/month
  - ENTERPRISE: 999 stores, KES 10,000/month
- Organization status enum added
- Subscription state transitions
  - ACTIVE → GRACE (7 days after period end)
  - GRACE → INACTIVE (after grace period)
  - INACTIVE allows staff login/settling but no new orders

**Files Created:**
- `backend/src/modules/subscriptions/subscription.model.ts`
- `backend/src/modules/subscriptions/subscription.service.ts`

**Files Modified:**
- `backend/src/modules/organizations/organization.model.ts`
- `backend/src/modules/platform/platform.routes.ts`

---

## Remaining Phases

### ⏳ Phase 8: Stock Management
**Status:** Pending

**To Implement:**
- Atomic stock decrements with `stock >= qty` guard
- StockMovement log model
- Real restock and adjust endpoints
- Stock availability endpoints (in stock, low, out)
- Exact counts as org setting
- SSE broadcasts for stock changes
- Future: POS sync source of truth

### ⏳ Phase 9: Offers and Trending
**Status:** Pending

**To Implement:**
- Offer model
- Pricing service used by basket and checkout
- Store discount on each order line
- Trending aggregation per store
- Cached trending results

### ⏳ Phase 10: Card Payments
**Status:** Pending

**To Implement:**
- Hosted gateway integration
- Provider interface
- Signed webhooks
- Card numbers never touch server

---

## Environment Variables Required

Add these to your `.env` file:

```bash
# MongoDB
MONGODB_URI=mongodb://127.0.0.1:27017/scan_and_go_db

# Security
JWT_SECRET=your_secure_jwt_secret_here
HMAC_RECEIPT_SECRET=your_hmac_secret_here

# Daraja M-Pesa
MPESA_SHORTCODE=174379
MPESA_PASSKEY=your_daraja_passkey
MPESA_ENVIRONMENT=sandbox
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_CALLBACK_SECRET=your_callback_secret
MPESA_ALLOWED_IPS=196.201.214.200,196.201.214.206

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Application
NODE_ENV=development
PORT=5000
BASE_URL=http://localhost:5000
```

---

## Migration Steps

1. **Backup your database** before running migrations
2. Run the organization migration:
   ```bash
   npm run migrate-organizations
   ```
3. Update environment variables with real values for production
4. Restart the backend server

---

## Testing Recommendations

1. **Security Fixes:**
   - Test `/payments/mpesa/reconcile` with invalid tokens
   - Test product updates from different store managers
   - Verify public store endpoints don't expose sensitive data

2. **Real Payments:**
   - Test STK push with phone number normalization
   - Verify cents-to-shillings rounding
   - Test payment idempotency (duplicate STK push attempts)

3. **Permissions:**
   - Test permission overrides for users
   - Test workspace switcher for SYSTEM_ADMIN
   - Verify `/auth/me` returns correct permissions

4. **Ledger:**
   - Test payment revenue recording
   - Verify ledger balance calculations
   - Test payout request and approval flow
   - Run ledger integrity verification

5. **Subscriptions:**
   - Test plan changes
   - Verify subscription gates block operations
   - Test subscription state processing job

---

## Next Steps

Choose one of the following:

1. **Continue with remaining phases** (8, 9, 10)
2. **Test the implemented features** before continuing
3. **Deploy to staging** for integration testing
4. **Review and adjust** any implemented features

Let me know which direction you'd like to take!
