# Supermarket Management & Multi-Tenant Administration System — Technical Blueprint

> Status: PLAN ONLY — no code changes yet.
> Basis: actual codebase audit (backend MERN+TS, frontend React/Vite, mobile-scan-go).
> Guiding rule: **extend what works; do not rebuild.** The tenant/RBAC foundation already exists and is solid.

---

## 0. What already exists (do NOT rebuild)

| Spec requirement | Existing implementation |
|---|---|
| One platform, many supermarket orgs | `Organization` model + `Store.organizationId` + `OrganizationStatus` (ACTIVE/GRACE/INACTIVE/SUSPENDED) |
| Branch = store inside org | `Store` model (code, location, openHours, mpesaConfig, pickupSlots, exitLanes, fraudConfig, presence policy) |
| Role/permission engine | `ROLE_PERMISSIONS` (27 roles, ~120 permissions), `roleScope()`, `requireRoleScope()`, `requirePermission()`, `canAccessStore()`, `canAccessOrganization()`, `scopeToStore()` in `backend/src/middleware/auth.ts` |
| Permission ceiling on overrides | `permissionOverrides` on User + `filterGrantablePermissions()` (scope-based forbidden prefixes) |
| Invite-based onboarding | `modules/invitations` — hashed single-use tokens, 48h expiry, `INVITABLE_BY` hierarchy enforcement, MFA flagging |
| Platform vs org vs branch separation | `isPlatformRole` / `isOrgRole` / `isBranchRole` / `roleScope` |
| Sub-admin maker-checker | `modules/approvals` (PENDING→APPROVED/REJECTED, separation of duties, expiry) |
| MFA for privileged roles | `modules/mfa` (TOTP, backup codes, `requiresMFA()`) |
| Subscription engine (basic) | `modules/subscriptions` — `SubscriptionPlan` (features, limits, fixed KES pricing) + `Subscription` (TRIAL/ACTIVE/PAST_DUE/SUSPENDED/CANCELLED, gracePeriodDays, billingInterval) + `subscriptionGate` middleware |
| Platform finance ledger | `modules/ledger` — ledger entries, payouts, payout routes |
| Support tickets | `modules/support` — ticket model, messages, SLA fields, tiers (currently customer-facing) |
| Live presence/sessions | `modules/presence` (store sessions) + `User.sessions[]` (sessionId, userAgent, ip, lastActiveAt, expiresAt) + `lastLoginAt` |
| Act-as (controlled impersonation) | `modules/act-as` — time-limited, audited, support-lead only |
| Access reviews | `modules/access-review` — quarterly review, revocation, temp grants |
| Audit trail | `AuditLog` used across modules |
| Org catalogue + branch products | `CatalogueProduct` (org-level) + `Product` (per-storeId, own price/stock) — matches spec's "shared catalogue, branch-specific price/inventory" |
| Platform console UI | `frontend/src/portals/SuperAdminPortal` — Overview, Organizations, Stores, Users/Roles, Finance, Support Desk, Compliance, Engineering, Risk/Fraud, Approvals Inbox, Platform Config |
| Org admin UI | `AdminPortal` — OrgAdminDashboard, BranchManagerDashboard, InventoryControllerDashboard, BranchRoleDirectory, LossPreventionAuditorDashboard |

**Conclusion:** Phases 1 and 6 of the roadmap are ~70% done. The real work is: configurable sub-admin permissions, org structure layer (regions/departments/custom roles/assignments), hybrid billing, org-facing support tickets, live-activity feed, and branch-independence cleanup.

---

## 1. Target architecture (mapped to existing code)

```
PLATFORM LEVEL (you + appointed sub-admins)
  PLATFORM_OWNER ── full authority, cannot self-approve sensitive actions
  PLATFORM_ADMIN ── day-to-day ops
  FINANCE_ADMIN / FINANCE_APPROVER ── platform billing only (what supermarkets owe US)
  SUPPORT_AGENT_TIER1 / SUPPORT_LEAD_TIER2 ── support desk + audited act-as
  RISK_FRAUD_ANALYST / COMPLIANCE_AUDITOR / PLATFORM_ENGINEER / CUSTOMER_SUCCESS
  + NEW: configurable sub-admin grants (permission builder) + org scoping

ORGANIZATION LEVEL (one supermarket business = one Organization workspace)
  ORG_OWNER ── final authority in the org (exactly one, enforced)
  ORG_ADMIN ── org administration
  GENERAL_MANAGER (NEW) ── oversees ops, assigned managers
  FINANCE_OFFICER / CATALOGUE_INVENTORY_MANAGER / MARKETING_MANAGER /
  LOSS_PREVENTION_MANAGER / ORG_AUDITOR
  + NEW: custom org roles (permission builder inside org ceiling)

MANAGEMENT LAYER (optional, org-configured)
  REGION_MANAGER (NEW) ── managedStoreIds[] subset of org branches
  BRANCH_MANAGER ── one or more assigned branches (see §4 decision)
  DEPARTMENT_MANAGER (NEW, optional) ── dept-scoped, reports into org/branch

OPERATIONAL LEVEL (branch staff, one branch each)
  STOCK_CONTROLLER, SUPERVISOR, CASHIER_CUSTOMER_SERVICE, PICKER,
  PACKER_VERIFIER, EXIT_OFFICER, DELIVERY_COLLECTION_HANDOVER

CUSTOMER ── unchanged shopping journeys
```

**Non-negotiable rule (already enforced by code):** every request passes `authenticate → requirePermission → scopeToStore/canAccessStore`. A branch ID in a request is never trusted — it is verified against the user's org/assignments. Keep this.

---

## 2. Gap analysis → work items

### A. Platform sub-admin permission builder (spec §2.1)

**Current:** platform roles are fixed templates; `permissionOverrides.granted/revoked` already lets PLATFORM_OWNER tune them, bounded by `FORBIDDEN_GRANT_PREFIXES.PLATFORM`.

**Gaps:**
1. No generic "sub-admin" role — a finance sub-admin who also needs `platform:orgs:read` requires either role-hopping or ad-hoc overrides with no audit-friendly UI.
2. Cannot restrict a platform sub-admin to *specific supermarkets* (e.g. support agent for orgs X,Y only).
3. No UI for the permission builder.

**Plan:**
- Add `User.managedOrganizationIds: ObjectId[]` (platform scope) — mirrors the planned `managedStoreIds` for REGION_MANAGER.
- Extend `canAccessStore`/`canAccessOrganization`: PLATFORM scope users with non-empty `managedOrganizationIds` are restricted to those orgs (empty = all).
- Introduce role `PLATFORM_SUBADMIN` (scope PLATFORM, minimal base permissions: `platform:overview:read`, `org:read`) whose real power comes entirely from granted overrides — this is the "permission builder" account.
- Platform permission ceiling already exists via `filterGrantablePermissions`; add a `SUBADMIN_GRANTABLE` list for the UI (grouped: orgs, billing, support, monitoring, compliance, settings).
- All grant/revoke changes → `AuditLog` + optional approval via existing `approvals` module for sensitive grants (`platform:admins:*`, `platform:settings:write`).

### B. Organization internal structure (spec §4–6)

**Current:** flat — org roles have `organizationId`, branch roles have `storeId`. No regions, departments, reporting lines, employee IDs, custom roles, or multi-branch assignments.

**New models (all org-scoped):**

```
Region            { organizationId, name, code }                // optional layer
Store.regionId    → Region                                      // nullable
Department        { organizationId, name, code }                // optional layer
StaffAssignment   { userId, organizationId, storeId?,           // NEW — decouples
                    regionScope?: ObjectId[],                   //   person from one role
                    departmentId?, role, reportsTo?,            //   "inventory mgr at A,
                    employeeId, status }                        //    stock ctrl at B"
CustomRole        { organizationId, name, permissions[],        // org-defined roles,
                    scope: 'ORG'|'BRANCH'|'REGION' }            //   bounded by org ceiling
```

**Key design decisions:**
- **Keep `User.role` + `User.storeId` as the "home assignment"** for backward compatibility with all existing routes, JWT, and floor operations. Add `StaffAssignment[]` for additional/differentiated assignments. Effective permissions = union of home role + assignment roles, each still bounded by `roleScope` ceilings. (Full membership-collection refactor deferred — it would touch every route for little gain at this scale.)
- **`REGION_MANAGER`**: `roleScope → 'REGION'`; access = `managedStoreIds[]` (validated ⊆ org stores). Sits between ORG and BRANCH in `scopeToStore`: may pass any `storeId ∈ managedStoreIds`; no storeId → aggregated view across managed stores only.
- **`GENERAL_MANAGER`**: org-scope role with operations permissions but no billing/subscription authority.
- **`DEPARTMENT_MANAGER`** (phase-later): departmentId-scoped; include the model now, wire enforcement when departments are used.
- **Regions are optional**: `Store.regionId` nullable; org may group branches arbitrarily or not at all. Region ≠ permission boundary by itself — REGION_MANAGER is the permission boundary, regions are just a labeling/assignment convenience. (This matches spec: "regional managers are an organizational layer, not necessarily above every manager".)
- **Org structure builder**: org admin creates regions/departments and assigns stores/managers — config UI on top of these models.
- **Staff lifecycle**: extend Invite/User status to `INVITED → PENDING → ACTIVE → SUSPENDED / ON_LEAVE / DEACTIVATED`; deactivation revokes access, preserves history (audit, orders, stock records untouched — already true since everything references userId immutably).
- Invite flow additions: `employeeId`, `departmentId`, `reportsTo`, and for REGION_MANAGER invites a `managedStoreIds` picker.

### C. Branch independence for goods (spec §6 + earlier decision: fully independent goods)

**Current conflicts in `product.routes.ts`:**
1. Product-registration approval **auto-copies the product into every branch** of the org (~lines 156–184).
2. `bulk-import` defaults `organizationWide = true` → pushes to all branches.
3. `CatalogueProduct` is auto-synced from branch products.

**Plan (reconcile with spec — spec actually wants shared catalogue + branch-specific price/stock, which the models already support):**
- `CatalogueProduct` = **master template library** (org-level name/barcode/category/image/default price). Keep auto-population from branch registrations but treat it as reference data.
- Each branch owns its `Product` rows: own `priceMinor`, `stock`, `active`. ✅ already true.
- **Remove auto-push**: registering a product at branch A creates it only at branch A. Org catalogue gets the template entry.
- New endpoint `POST /products/from-catalogue` — branch pulls a catalogue item into its own inventory (own price/stock). This is the "fully independent but not duplicative" flow.
- `bulk-import`: default `organizationWide=false`; chain-wide push requires `org:config`-level permission + maker-checker approval (reuse `approvals` module, type `INVENTORY_CHANGE` already exists).
- Optional later: "push price list to selected branches" as an approved org action.

### D. Configurable hybrid billing (spec §7)

**Current:** `SubscriptionPlan` has fixed `monthlyAmountMinor`/`annualAmountMinor`; `Subscription` tracks status/periods/grace. No invoices, no per-org pricing overrides, no usage components.

**Plan:**
- New `BillingPlan` model (or extend `SubscriptionPlan`):
  ```
  components: [
    { type: 'BASE', amountMinor },
    { type: 'PER_BRANCH', amountMinor, includedBranches },
    { type: 'PER_STAFF', amountMinor, includedSeats },
    { type: 'TRANSACTION', rateBps },          // optional
    { type: 'USAGE', metric, amountMinor }     // optional
  ],
  billingCycle, trialDays, gracePeriodDays, discounts[]
  ```
- `Subscription` gains `customPricing` override + `assignedPlanId` snapshot so plan edits never retro-change live contracts.
- New `Invoice` model: `{ organizationId, subscriptionId, period, lineItems[], totalMinor, status: DRAFT/ISSUED/PAID/PARTIAL/OVERDUE/VOID, mpesaReceipt?, dueDate }` — generated by scheduled job at period end.
- `PlatformPayment` records org→platform payments (separate from supermarket customer M-Pesa — already separate modules; keep it that way).
- Usage metering: staff seats = count of ACTIVE staff users; branches = count of active Stores; transactions = order count in period. Computed at invoice generation.
- Enforcement stays in `subscriptionGate` (already blocks new baskets/orders when suspended; allows settlement) — extend to read invoice status for PAST_DUE grace logic.
- Sensitive billing actions (price overrides, refunds, plan edits) → `approvals` maker-checker (types exist: PAYOUT_REQUEST pattern reusable; add INVOICE_ISSUE, PRICE_OVERRIDE, REFUND_REQUEST already exists).

### E. Platform live activity & monitoring (spec §8.1)

**Current:** `User.sessions[]` (lastActiveAt, userAgent, ip, expiresAt), `User.lastLoginAt`, `failedLoginAttempts`, `lockoutUntil`, presence module for in-store sessions.

**Plan:**
- `GET /platform/activity` — aggregates: active orgs, active branches, staff counts, sessions active in last N min (heartbeat = any authenticated request updates `session.lastActiveAt`; add lightweight `POST /auth/pulse` or update on `authenticate` — already loads user, cheap to touch session), failed logins, suspicious activity (lockouts, act-as sessions, break-glass).
- Never expose passwordHash/mfaSecret — already `select('-passwordHash -mfaSecret -mfaBackupCodes')` in authenticate. ✅
- UI: new "Live Activity" section in `SuperAdminPortal` (session list: name, role, org, branch, last active, device).

### F. Org-facing support centre (spec §8.2)

**Current:** `ticket.model.ts` is customer-shaped (`customerPhone`, `customerId`, order-linked, statuses OPEN/IN_PROGRESS/RESOLVED/CLOSED, TIER_1/TIER_2, SLA).

**Plan:**
- Extend `SupportTicket` (don't fork): add `organizationId`, `storeId?`, `raisedByUserId`, `category` (BILLING/TECHNICAL/STAFF/BILLING...), widen status enum to spec flow: `OPEN → ASSIGNED → IN_PROGRESS → WAITING_ON_ORG → RESOLVED → CLOSED` (keep old values mapped).
- Org users raise tickets from AdminPortal; platform support works the same queue; assignment to support agents exists (`assignedTo`).
- Diagnostics bundle endpoint: agent can attach org/branch/store config snapshot (no secrets) to ticket.
- Controlled diagnostic access = existing `act-as` module (time-limited, audited, support-lead only). ✅ Add visible "support access active" banner data via `GET /act-as/active` (exists).

### G. Three-dashboard frontend (spec §11)

**Current portals:** `SuperAdminPortal` (platform), `AdminPortal` (org+branch dashboards already role-switched: OrgAdminDashboard, BranchManagerDashboard, InventoryControllerDashboard, LossPreventionAuditorDashboard, BranchRoleDirectory), `StaffPickerPortal`, `ExitOfficerPortal`, `SupervisorPortal`, `CustomerPortal`.

**Plan:**
- **Platform dashboard**: extend `SuperAdminPortal` — add Sub-admins (permission builder UI), Billing (plans/invoices), Live Activity sections. Most sections already exist as stubs/sections.
- **Org dashboard**: extend `AdminPortal` — add Regions & Structure builder, Staff (with assignments/lifecycle), Branches (per-branch independence view), Reports (branch vs consolidated).
- **Staff dashboard**: Picker/Exit/Supervisor portals exist; add lightweight "My work" view for STOCK_CONTROLLER/CASHIER (tasks, my branch, my shift placeholder).
- `permissions.ts` (16 lines) → full permission→UI mapping per role scope; hide modules by permission not just portal.
- New `REGION_MANAGER` portal view: aggregated dashboard over `managedStoreIds`.

---

## 3. Role catalog (final, ready-made templates)

| Scope | Roles |
|---|---|
| PLATFORM | PLATFORM_OWNER, PLATFORM_ADMIN, PLATFORM_SUBADMIN *(new, permission-built)*, FINANCE_ADMIN, FINANCE_APPROVER, SUPPORT_AGENT_TIER1, SUPPORT_LEAD_TIER2, RISK_FRAUD_ANALYST, COMPLIANCE_AUDITOR, PLATFORM_ENGINEER, CUSTOMER_SUCCESS |
| ORG | ORG_OWNER, ORG_ADMIN, GENERAL_MANAGER *(new)*, FINANCE_OFFICER, CATALOGUE_INVENTORY_MANAGER, MARKETING_MANAGER, LOSS_PREVENTION_MANAGER, ORG_AUDITOR, + org **custom roles** |
| REGION | REGION_MANAGER *(new)* |
| BRANCH | BRANCH_MANAGER, STOCK_CONTROLLER, SUPERVISOR, CASHIER_CUSTOMER_SERVICE, PICKER, PACKER_VERIFIER, EXIT_OFFICER, DELIVERY_COLLECTION_HANDOVER |
| CUSTOMER | CUSTOMER |
| Legacy aliases | SYSTEM_ADMIN→PLATFORM_OWNER, STORE_MANAGER→BRANCH_MANAGER, EXIT_STAFF→EXIT_OFFICER (already mapped) |

Org custom roles: `CustomRole` model with permissions bounded by the org ceiling (`filterGrantablePermissions` extended with ORG-scoped forbidden list — already exists). Job titles stay free-text on StaffAssignment.

---

## 4. Open decisions to confirm before coding

1. **Branch manager scope:** one `BRANCH_MANAGER` per branch, or can one manager hold several branches? (Recommend: `managedStoreIds[]` on BRANCH_MANAGER too — same mechanism as REGION_MANAGER, just smaller ceiling. Zero extra complexity.)
2. **Multi-org users:** can one person work for two supermarket chains? (Recommend: NO for v1 — `User.organizationId` stays single-valued; revisit only if a real customer needs it. Membership collection is a large refactor.)
3. **Catalogue model:** confirm spec direction — shared master catalogue + branch-owned price/stock (current models already fit; we remove auto-push). ✅ consistent with earlier "fully independent" answer since branches own their sellable records.
4. **Billing currency/tax:** KES only, VAT-inclusive pricing? (Recommend yes for Kenya.)
5. **Default branch auto-creation:** every new org gets one default branch on workspace creation. ✅ spec-mandated, trivial.

---

## 5. Implementation phases (revised roadmap, mapped to code)

| Phase | Deliverable | Touches |
|---|---|---|
| **P0 — Cleanup** | Remove/neutralize legacy `tenant.ts` (unused); align seed users to canonical roles | `middleware/tenant.ts`, `scripts/seed.ts` |
| **P1 — Region & structure** | `REGION_MANAGER`, `GENERAL_MANAGER`, `Region`, `Department`, `Store.regionId`, `managedStoreIds`/`managedOrganizationIds` on User+Invite, `roleScope`/`canAccessStore`/`scopeToStore` updates, invite rules | `types`, `user.model`, `invite.*`, `auth.ts`, new `regions`/`departments` modules |
| **P2 — Assignments & lifecycle** | `StaffAssignment`, `CustomRole`, employee IDs, reportsTo, status lifecycle, staff-directory upgrade | `user.model`, new `staff` module, `invite.*`, `store.routes` directory |
| **P3 — Goods independence** | Kill auto-push, `from-catalogue` pull endpoint, bulk-import default single-branch, approved chain-push | `product.routes.ts`, approvals |
| **P4 — Platform sub-admins** | `PLATFORM_SUBADMIN`, `managedOrganizationIds` enforcement, permission-builder API + UI, grant audit/approvals | `auth.ts`, `user.model`, `platform.routes`, SuperAdminPortal |
| **P5 — Billing engine** | BillingPlan components, Invoice, PlatformPayment, usage metering, subscription overrides | `modules/subscriptions`, `modules/ledger`, new `billing`/`invoices` module, subscriptionJob |
| **P6 — Platform ops** | Live activity feed, org-facing tickets, diagnostics bundles | `platform.routes`, `support.*`, presence/`authenticate` touch |
| **P7 — Frontend** | Permission→UI map, Region portal, structure builder UI, staff lifecycle UI, billing UI | `frontend/src/permissions.ts`, portals |
| **P8 — Hardening** | Tenant-isolation tests, permission-escalation tests, billing tests, regression on Scan&Go/Collect flows | tests, seed |

Each phase is independently shippable; P1–P3 are the core of "how supermarkets actually work" and should go first.

---

## 6. What we deliberately do NOT do

- No separate codebase per supermarket size — one org model, regions/departments optional.
- No user-membership collection refactor in v1 (single `organizationId` per user).
- No rebuild of Scan & Go / Shop & Collect / exit-verification — they already carry `storeId`/`organizationId` correctly.
- No silent impersonation — support access stays on audited, time-limited act-as.
- No mixing of platform subscription billing with supermarket customer payments.

---

## 7. Definition of done (per phase)

- [ ] New role cannot access outside its scope (backend-enforced, tested)
- [ ] Cross-tenant ID in request → 403 (tested)
- [ ] Sensitive action → audit log (+ approval where required)
- [ ] Seed data exercises the new flow end-to-end
- [ ] Existing customer journeys (Scan&Go, Collect, exit verify) unaffected
```

---

*Blueprint ends. Next step on approval: implement P0–P3 (foundation + structure + goods independence), then P4–P6.*
```
</file_path>
C:\Users\Admin\Desktop\scanAndGoApplication\SYSTEM_REDESIGN_BLUEPRINT.md>
```

Wait — I passed a malformed file_path (trailing backticks). Let me check whether it was created.

Let me verify.<|close|>think<|sep|><|open|>response<|sep|>



I need to check whether the file was actually written — I may have malformed the path.<|close|>response<|sep|><|open|>tools<|sep|><|open|>call tool="exec" index="1"<|sep|><|open|>argument key="command" type="string"<|sep|>ls -la "C:\Users\Admin\Desktop\scanAndGoApplication\SYSTEM_REDESIGN_BLUEPRINT.md" 2>&1; ls "C:\Users\Admin\Desktop\scanAndGoApplication" | grep -i blueprint
