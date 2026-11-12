// Platform roles (super admin split into specialized roles)
export type PlatformRole =
  | 'PLATFORM_OWNER'
  | 'PLATFORM_ADMIN'
  | 'FINANCE_ADMIN'
  | 'FINANCE_APPROVER'
  | 'SUPPORT_AGENT_TIER1'
  | 'SUPPORT_LEAD_TIER2'
  | 'RISK_FRAUD_ANALYST'
  | 'COMPLIANCE_AUDITOR'
  | 'PLATFORM_ENGINEER'
  | 'CUSTOMER_SUCCESS';

// Organization roles (org admin split into specialized roles)
export type OrganizationRole =
  | 'ORG_OWNER'
  | 'ORG_ADMIN'
  | 'FINANCE_OFFICER'
  | 'CATALOGUE_INVENTORY_MANAGER'
  | 'MARKETING_MANAGER'
  | 'LOSS_PREVENTION_MANAGER'
  | 'ORG_AUDITOR';

// Branch roles (store manager and staff split into specialized roles)
export type BranchRole =
  | 'BRANCH_MANAGER'
  | 'STOCK_CONTROLLER'
  | 'SUPERVISOR'
  | 'CASHIER_CUSTOMER_SERVICE'
  | 'PICKER'
  | 'PACKER_VERIFIER'
  | 'EXIT_OFFICER'
  | 'DELIVERY_COLLECTION_HANDOVER'
  | 'CUSTOMER';

// Legacy role aliases for backward compatibility (will be phased out)
export type LegacyRole =
  | 'CUSTOMER'
  | 'PICKER'
  | 'EXIT_STAFF'
  | 'SUPERVISOR'
  | 'STORE_MANAGER'
  | 'ORG_ADMIN'
  | 'SYSTEM_ADMIN';

// Union of all role types
export type UserRole = PlatformRole | OrganizationRole | BranchRole | LegacyRole;

export type BasketStatus = 'OPEN' | 'ABANDONED' | 'CONVERTED';

export type OrderType = 'SCAN_AND_GO' | 'CLICK_AND_COLLECT';

export type OrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'PICKING'
  | 'AWAITING_CUSTOMER_APPROVAL'
  | 'AWAITING_FINAL_PAYMENT'
  | 'READY_FOR_VERIFICATION'
  | 'VERIFIED_AND_PACKED'
  | 'READY_FOR_PICKUP'
  | 'COLLECTED'
  | 'EXITED'
  | 'HELD'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUND_PENDING'
  | 'REFUNDED';

export type RiskBand = 'GREEN' | 'AMBER' | 'AMBER_FULL' | 'RED';

export type PaymentMethod = 'MPESA' | 'CARD' | 'CASH';

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'TIMED_OUT' | 'HELD';

export type DiscrepancyResolution = 'PAID_DIFFERENCE' | 'ITEM_RETURNED' | 'ESCALATED' | 'OVERRIDDEN_BY_SUPERVISOR';
