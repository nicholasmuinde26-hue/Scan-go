import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { ENV } from '../config/environment.js';
import User from '../modules/users/user.model.js';
import { UserRole } from '../shared/types/index.js';

export type Permission =
  // Order permissions
  | 'orders:read:own'
  | 'orders:read:store'
  | 'orders:read:org'
  | 'orders:read:any'
  | 'orders:create'
  | 'orders:update'
  | 'orders:cancel'
  | 'orders:hold'
  | 'orders:release'
  | 'orders:handover'
  | 'orders:refund'
  // Basket permissions
  | 'baskets:manage'
  | 'baskets:read:any'
  // Picking permissions
  | 'picking:read'
  | 'picking:execute'
  | 'picking:verify'
  | 'picking:assign'
  // Exit verification permissions
  | 'exit:scan'
  | 'exit:verify'
  | 'exit:override'
  // Discrepancy management
  | 'discrepancy:resolve'
  | 'discrepancy:view'
  // Supervisor permissions
  | 'supervisor:override'
  | 'supervisor:approve'
  // Pricing permissions
  | 'pricing:read'
  | 'pricing:write'
  | 'pricing:approve'
  // Inventory management
  | 'inventory:read'
  | 'inventory:write'
  | 'inventory:adjust'
  | 'inventory:approve'
  // Offers and marketing
  | 'offers:read'
  | 'offers:manage'
  | 'offers:approve'
  // Fraud and risk
  | 'fraud:view'
  | 'fraud:config'
  | 'fraud:block'
  | 'fraud:unblock'
  | 'fraud:review'
  // Staff management
  | 'staff:read'
  | 'staff:manage'
  | 'staff:assign'
  | 'staff:terminate'
  // Store/branch management
  | 'stores:read'
  | 'stores:manage'
  | 'stores:create'
  | 'stores:suspend'
  // Organization management
  | 'org:read'
  | 'org:config'
  | 'org:users:manage'
  | 'org:subscription:view'
  | 'org:subscription:manage'
  // Platform management
  | 'platform:overview:read'
  | 'platform:orgs:create'
  | 'platform:orgs:suspend'
  | 'platform:orgs:read'
  | 'platform:settings:read'
  | 'platform:settings:write'
  | 'platform:admins:create'
  | 'platform:admins:approve'
  // Wallet and payouts
  | 'wallet:read'
  | 'wallet:write'
  | 'payouts:view'
  | 'payouts:request'
  | 'payouts:approve'
  | 'payouts:reject'
  // Financial operations
  | 'finance:ledger:read'
  | 'finance:invoices:read'
  | 'finance:invoices:create'
  | 'finance:reconcile'
  | 'finance:export'
  // Reports and exports
  | 'reports:read'
  | 'reports:export'
  | 'reports:export:sensitive'
  // Support operations
  | 'support:search'
  | 'support:view:any'
  | 'support:actas'
  | 'support:reset_password'
  | 'support:resend_receipt'
  | 'support:retry_payment'
  // Audit and compliance
  | 'audit:read'
  | 'audit:export'
  | 'compliance:read'
  // System operations
  | 'system:admin'
  | 'system:maintenance'
  | 'system:health'
  | 'system:feature_flags'
  // Data access
  | 'data:reveal'
  | 'data:mask'
  // Customer success
  | 'cs:usage:view'
  | 'cs:trials:manage'
  // Point of sale
  | 'pos:operate'
  // Legacy permissions (for backward compatibility)
  | 'reports:export'
  | 'system:admin';

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  // ==================== PLATFORM ROLES ====================

  PLATFORM_OWNER: [
    // Full platform authority except self-approval
    'platform:overview:read',
    'platform:orgs:create',
    'platform:orgs:suspend',
    'platform:orgs:read',
    'platform:settings:read',
    'platform:settings:write',
    'platform:admins:create',
    'platform:admins:approve',
    'system:admin',
    'system:maintenance',
    'system:feature_flags',
    'audit:read',
    'audit:export',
    'reports:read',
    'reports:export',
    'reports:export:sensitive',
    'finance:ledger:read',
    'finance:reconcile',
    'compliance:read',
  ],

  PLATFORM_ADMIN: [
    // Day-to-day platform operations
    'platform:overview:read',
    'platform:orgs:create',
    'platform:orgs:suspend',
    'platform:orgs:read',
    'platform:admins:approve',
    'org:read',
    'org:config',
    'org:users:manage',
    'org:subscription:view',
    'org:subscription:manage',
    // NO wallet or payout access
  ],

  PLATFORM_SUBADMIN: [
    // Permission-built account: starts with read-only overview; real powers come
    // from granted overrides chosen by the platform owner (bounded by the catalog).
    'platform:overview:read',
    'platform:orgs:read',
  ],

  FINANCE_ADMIN: [
    // Money in and out, but can't approve own payouts
    'finance:ledger:read',
    'finance:invoices:read',
    'finance:invoices:create',
    'finance:reconcile',
    'finance:export',
    'wallet:read',
    'wallet:write',
    'payouts:view',
    'payouts:request',
    'reports:read',
    'reports:export',
    'audit:read',
    // NO payout approval
  ],

  FINANCE_APPROVER: [
    // Second pair of eyes for financial operations
    'payouts:view',
    'payouts:approve',
    'payouts:reject',
    'finance:ledger:read',
    'finance:invoices:read',
    'audit:read',
    'reports:read',
    // NO creating payouts or wallet writes
  ],

  SUPPORT_AGENT_TIER1: [
    // Help users with basic issues
    'support:search',
    'support:view:any',
    'support:reset_password',
    'support:resend_receipt',
    'orders:read:any',
    'baskets:read:any',
    // NO money operations or data reveal
  ],

  SUPPORT_LEAD_TIER2: [
    // Escalations with time-limited act-as
    'support:search',
    'support:view:any',
    'support:actas',
    'support:reset_password',
    'support:resend_receipt',
    'support:retry_payment',
    'orders:read:any',
    'baskets:read:any',
    // NO org changes or money operations
  ],

  RISK_FRAUD_ANALYST: [
    // Abuse control
    'fraud:view',
    'fraud:config',
    'fraud:block',
    'fraud:unblock',
    'fraud:review',
    'orders:read:any',
    'baskets:read:any',
    'support:search',
    'audit:read',
    'reports:read',
    'reports:export',
    // NO org changes or direct money operations
  ],

  COMPLIANCE_AUDITOR: [
    // Read-only oversight
    'audit:read',
    'audit:export',
    'compliance:read',
    // NO changes to anything
  ],

  PLATFORM_ENGINEER: [
    // System health and maintenance
    'system:health',
    'system:maintenance',
    'system:feature_flags',
    // NO customer data access by default
  ],

  CUSTOMER_SUCCESS: [
    // Onboarding and subscription management
    'platform:orgs:read',
    'org:read',
    'org:subscription:view',
    'org:subscription:manage',
    'cs:usage:view',
    'cs:trials:manage',
    'reports:read',
    // NO operational data access
  ],

  // ==================== ORGANIZATION ROLES ====================

  ORG_OWNER: [
    // One per supermarket, final authority within org
    'org:read',
    'org:config',
    'org:users:manage',
    'org:subscription:view',
    'org:subscription:manage',
    'stores:read',
    'stores:manage',
    'stores:create',
    'staff:read',
    'staff:manage',
    'staff:assign',
    'staff:terminate',
    'wallet:read',
    'payouts:view',
    'payouts:request',
    'finance:ledger:read',
    'finance:invoices:read',
    'orders:read:org',
    'reports:read',
    'reports:export',
    'audit:read',
    'inventory:read',
    'inventory:write',
    'inventory:adjust',
    'inventory:approve',
    'offers:read',
    'fraud:view',
    'fraud:config',
    'pricing:read',
    'pricing:write',
    'pricing:approve',
    'offers:manage',
  ],

  ORG_ADMIN: [
    // General org administration
    'org:read',
    'org:config',
    'org:users:manage',
    'stores:read',
    'stores:manage',
    'stores:create',
    'staff:read',
    'staff:manage',
    'staff:assign',
    'orders:read:org',
    'orders:read:store',
    'payouts:view',
    'payouts:request',
    'pricing:read',
    'pricing:write',
    'reports:read',
    'reports:export',
    'inventory:read',
    'inventory:write',
    'inventory:approve',
    'offers:read',
    'offers:manage',
    'audit:read',
  ],

  GENERAL_MANAGER: [
    // Oversees supermarket operations across all branches; no billing authority.
    'org:read',
    'stores:read',
    'stores:manage',
    'staff:read',
    'staff:manage',
    'staff:assign',
    'orders:read:org',
    'orders:read:store',
    'picking:read',
    'picking:assign',
    'orders:refund',
    'discrepancy:resolve',
    'supervisor:override',
    'supervisor:approve',
    'fraud:view',
    'fraud:config',
    'inventory:read',
    'inventory:write',
    'inventory:adjust',
    'inventory:approve',
    'pricing:read',
    'pricing:write',
    'offers:read',
    'offers:manage',
    'reports:read',
    'reports:export',
    'audit:read',
    // NO wallet, payouts, org:config, org:users:manage, subscription management
  ],

  FINANCE_OFFICER: [
    // Org wallet and settlements, no catalogue access
    'org:read',
    'wallet:read',
    'wallet:write',
    'payouts:view',
    'payouts:request',
    'finance:ledger:read',
    'finance:invoices:read',
    'finance:invoices:create',
    'finance:reconcile',
    'reports:read',
    'reports:export',
    'audit:read',
    'orders:read:org',
    // NO catalogue or pricing access
  ],

  CATALOGUE_INVENTORY_MANAGER: [
    // Products, prices, stock, offers
    'org:read',
    'inventory:read',
    'inventory:write',
    'inventory:adjust',
    'inventory:approve',
    'pricing:read',
    'pricing:write',
    'pricing:approve',
    'offers:read',
    'offers:manage',
    'offers:approve',
    'reports:read',
    'audit:read',
    // NO wallet or financial access
  ],

  MARKETING_MANAGER: [
    // Offers and trending, no pricing or stock edits
    'org:read',
    'offers:read',
    'offers:manage',
    'pricing:read',
    'inventory:read',
    'reports:read',
    'audit:read',
    // NO pricing write, inventory write, or financial access
  ],

  LOSS_PREVENTION_MANAGER: [
    // Fraud settings and audits for the organization
    'org:read',
    'fraud:view',
    'fraud:config',
    'fraud:block',
    'fraud:unblock',
    'fraud:review',
    'orders:read:org',
    'baskets:read:any',
    'audit:read',
    'reports:read',
    'reports:export',
    // NO org settings changes or financial operations
  ],

  ORG_AUDITOR: [
    // Read-only org access
    'org:read',
    'orders:read:org',
    'orders:read:store',
    'pricing:read',
    'inventory:read',
    'finance:ledger:read',
    'finance:invoices:read',
    'fraud:view',
    'reports:read',
    'reports:export',
    'audit:read',
    // NO write permissions
  ],

  // ==================== REGION / BRANCH MANAGEMENT ====================

  REGION_MANAGER: [
    // Oversees a configured subset of branches (managedStoreIds). Read-heavy
    // oversight plus staff assignment inside those branches only.
    'stores:read',
    'staff:read',
    'staff:assign',
    'orders:read:store',
    'picking:read',
    'picking:assign',
    'discrepancy:resolve',
    'supervisor:override',
    'fraud:view',
    'inventory:read',
    'inventory:write',
    'pricing:read',
    'reports:read',
    'reports:export',
    'audit:read',
    // NO staff:manage/terminate, stores:manage/create, org or financial access
  ],

  BRANCH_MANAGER: [
    // Own branch (can manage several)
    'stores:read',
    'stores:manage',
    'staff:read',
    'staff:manage',
    'staff:assign',
    'orders:read:store',
    'picking:read',
    'picking:assign',
    'orders:refund',
    'discrepancy:resolve',
    'supervisor:override',
    'supervisor:approve',
    'pos:operate',
    'fraud:view',
    'fraud:config',
    'inventory:read',
    'reports:read',
    'reports:export',
    'audit:read',
    // NO access to other branches or org wallet
  ],

  STOCK_CONTROLLER: [
    // Inventory and receiving management
    'stores:read',
    'inventory:read',
    'inventory:write',
    'inventory:adjust',
    'inventory:approve',
    'pricing:read',
    'pricing:write',
    'pricing:approve',
    'orders:read:store',
    // NO staff management or financial access
  ],

  STOCK_MANAGER: [],

  SUPERVISOR: [
    // Supervisor desk only: resolve discrepancies and approve justified overrides.
    'orders:read:store',
    'discrepancy:resolve',
    'supervisor:override',
    'pos:operate',
    'audit:read',
    // NO pricing edits or staff management
  ],

  CASHIER_CUSTOMER_SERVICE: [
    // Refunds, customer helpdesk, and the cashier till (scan/adjust/checkout baskets).
    'orders:read:store',
    'orders:refund',
    'pos:operate',
    'support:reset_password',
    'support:resend_receipt',
    // NO overrides or discrepancy resolution
  ],

  PICKER: [
    // Execute assigned picking
    'orders:read:store',
    'picking:read',
    'picking:execute',
    // NO verifying their own pick
  ],

  PACKER_VERIFIER: [
    // Verify picks (separation of duties)
    'orders:read:store',
    'picking:read',
    'picking:verify',
    // NO executing picks
  ],

  EXIT_OFFICER: [
    // Scan and verify receipts; handover belongs to the separate collection desk role.
    'orders:read:store',
    'exit:scan',
    'exit:verify',
    // NO resolving discrepancies
  ],

  DELIVERY_COLLECTION_HANDOVER: [
    // Hand over orders for delivery/collection
    'orders:read:store',
    'orders:handover',
  ],

  CUSTOMER: [
    // Own records: baskets, orders, payments
    'orders:read:own',
    'orders:create',
    'baskets:manage',
    'pricing:read',
  ],

  // ==================== LEGACY ROLES (for backward compatibility) ====================

  EXIT_STAFF: [
    // Legacy - maps to EXIT_OFFICER
    'orders:read:store',
    'exit:scan',
    'exit:verify',
    'orders:handover',
    'pricing:read',
  ],

  STORE_MANAGER: [
    // Legacy - maps to BRANCH_MANAGER
    'orders:read:store',
    'picking:read',
    'picking:verify',
    'exit:scan',
    'exit:verify',
    'orders:refund',
    'orders:handover',
    'discrepancy:resolve',
    'supervisor:override',
    'pos:operate',
    'fraud:view',
    'fraud:config',
    'pricing:read',
    'pricing:write',
    'staff:manage',
    'reports:export',
    'inventory:read',
    'inventory:write',
  ],

  SYSTEM_ADMIN: [], // Legacy alias is filled from PLATFORM_OWNER below; no legacy floor grants.
};

// Legacy role names must never drift from their current equivalents.
ROLE_PERMISSIONS.STOCK_MANAGER = [...ROLE_PERMISSIONS.STOCK_CONTROLLER];
ROLE_PERMISSIONS.STORE_MANAGER = [...ROLE_PERMISSIONS.BRANCH_MANAGER];
ROLE_PERMISSIONS.EXIT_STAFF = [...ROLE_PERMISSIONS.EXIT_OFFICER];
ROLE_PERMISSIONS.SYSTEM_ADMIN = [...ROLE_PERMISSIONS.PLATFORM_OWNER];

export interface PortalConfig {
  allowedPortals: ('CUSTOMER' | 'STAFF_PICKER' | 'EXIT_OFFICER' | 'SUPERVISOR' | 'ADMIN' | 'PLATFORM' | 'SUPPORT')[];
  defaultPortal: 'CUSTOMER' | 'STAFF_PICKER' | 'EXIT_OFFICER' | 'SUPERVISOR' | 'ADMIN' | 'PLATFORM' | 'SUPPORT';
  permissions: Permission[];
}

export function getRolePortalConfig(role: UserRole): PortalConfig {
  const permissions = ROLE_PERMISSIONS[role] || [];
  const only = (portal: PortalConfig['defaultPortal']): PortalConfig => ({
    allowedPortals: [portal],
    defaultPortal: portal,
    permissions,
  });

  // Platform roles: the platform console only. They never get floor portals
  // (picking, exit lane, supervisor desk) and never the customer app.
  if (isPlatformRole(role)) return only('ADMIN');

  // Organization roles: the organization workspace only. Which tabs they see
  // inside it is decided by their permissions (see frontend/src/permissions.ts).
  if (isOrgRole(role)) return only('ADMIN');

  switch (role) {
    case 'GENERAL_MANAGER':
      return only('ADMIN');
    case 'REGION_MANAGER':
      // Region manager runs a grouped-branch dashboard inside the org workspace.
      return only('ADMIN');
    case 'BRANCH_MANAGER':
    case 'STORE_MANAGER':
      // Manager runs the branch dashboard and the supervisor desk (overrides, escalations).
      return { allowedPortals: ['ADMIN', 'SUPERVISOR'], defaultPortal: 'ADMIN', permissions };
    case 'STOCK_CONTROLLER':
    case 'STOCK_MANAGER':
      return only('ADMIN');
    case 'SUPERVISOR':
      return only('SUPERVISOR');
    case 'PICKER':
    case 'PACKER_VERIFIER':
      return only('STAFF_PICKER');
    case 'EXIT_OFFICER':
    case 'EXIT_STAFF':
    case 'CASHIER_CUSTOMER_SERVICE':
    case 'DELIVERY_COLLECTION_HANDOVER':
      return only('EXIT_OFFICER');
    case 'CUSTOMER':
      return only('CUSTOMER');
    default:
      // Unknown role: deny by default (no portal), never fall back to the customer app.
      return { allowedPortals: [], defaultPortal: 'CUSTOMER', permissions: [] };
  }
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: UserRole;
    storeId?: string;
    organizationId?: string;
    managedStoreIds?: string[];
    managedOrganizationIds?: string[];
    // Secondary branch/department assignments (embedded on the user document).
    assignments?: { storeId?: string; role?: string; status?: string }[];
    name: string;
    phone: string;
    permissions: Permission[];
  };
}

export function generateToken(payload: {
  id: string;
  role: UserRole;
  storeId?: string;
  organizationId?: string;
  name: string;
  phone: string;
}): string {
  // Shortened access token (15m in production, 2h in development)
  const expiresIn = ENV.NODE_ENV === 'production' ? '15m' : '2h';
  return jwt.sign(payload, ENV.JWT_SECRET, { expiresIn });
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Authentication required. No token provided.' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as any;

    const user = await User.findById(decoded.id).select('-passwordHash -mfaSecret -mfaBackupCodes');
    if (!user) {
      res.status(401).json({ success: false, error: 'User associated with token no longer exists.' });
      return;
    }

    // Check account status
    if (user.active === false || user.status === 'DEACTIVATED') {
      res.status(403).json({ success: false, error: 'Account has been deactivated.' });
      return;
    }
    if (user.status === 'SUSPENDED') {
      res.status(403).json({ success: false, error: 'Account is suspended. Contact administrator.' });
      return;
    }

    // Check organization active status (guard against malformed IDs in legacy docs)
    if (user.organizationId && mongoose.isValidObjectId(user.organizationId)) {
      try {
        const orgModule = await import('../modules/organizations/organization.model.js');
        const Organization = orgModule.default;
        const org = await (Organization as any).findById(user.organizationId);
        if (org && org.status === 'SUSPENDED') {
          res.status(403).json({ success: false, error: 'Your organization is suspended.' });
          return;
        }
      } catch (orgErr) {
        console.error('[Auth] organization lookup failed (non-fatal):', orgErr);
      }
    }

    // Check store branch active status (guard against malformed IDs in legacy docs)
    if (user.storeId && mongoose.isValidObjectId(user.storeId)) {
      try {
        const storeModule = await import('../modules/stores/store.model.js');
        const Store = storeModule.default;
        const branch = await (Store as any).findById(user.storeId);
        if (branch && branch.active === false) {
          res.status(403).json({ success: false, error: 'Your assigned store branch is currently inactive.' });
          return;
        }
      } catch (storeErr) {
        console.error('[Auth] store lookup failed (non-fatal):', storeErr);
      }
    }

    // Check permission expiry
    if (user.permissionExpiry && new Date() > user.permissionExpiry) {
      res.status(403).json({ success: false, error: 'Permissions have expired. Contact administrator.' });
      return;
    }

    // Check break-glass access expiry — a failed save must never block auth
    if (user.breakGlassAccess?.active && user.breakGlassAccess.expiresAt && new Date() > user.breakGlassAccess.expiresAt) {
      try {
        user.breakGlassAccess.active = false;
        await user.save();
      } catch (saveErr) {
        console.error('[Auth] break-glass expiry save failed (non-fatal):', saveErr);
      }
    }

    // Start with role-based permissions
    let permissions = [...(ROLE_PERMISSIONS[user.role] || [])];

    // Apply permission overrides (granted and revoked)
    if (user.permissionOverrides) {
      const revoked = Array.isArray(user.permissionOverrides.revoked) ? user.permissionOverrides.revoked : [];
      const granted = Array.isArray(user.permissionOverrides.granted) ? user.permissionOverrides.granted : [];
      // Remove revoked permissions
      if (revoked.length > 0) {
        permissions = permissions.filter(p => !revoked.includes(p));
      }
      // Add granted permissions, but never beyond what the role's scope may hold.
      if (granted.length > 0) {
        permissions = [...permissions, ...filterGrantablePermissions(user.role, granted as Permission[])];
      }
    }

    // Handle workspace switcher for platform roles
    let effectiveStoreId = user.storeId ? user.storeId.toString() : undefined;
    let effectiveOrganizationId = user.organizationId ? user.organizationId.toString() : undefined;

    const platformRoles = ['PLATFORM_OWNER', 'PLATFORM_ADMIN', 'PLATFORM_SUBADMIN', 'FINANCE_ADMIN', 'FINANCE_APPROVER',
                           'SUPPORT_AGENT_TIER1', 'SUPPORT_LEAD_TIER2', 'RISK_FRAUD_ANALYST',
                           'COMPLIANCE_AUDITOR', 'PLATFORM_ENGINEER', 'CUSTOMER_SUCCESS', 'SYSTEM_ADMIN'];

    if (platformRoles.includes(user.role)) {
      // If acting as a specific org/store, use those for context
      if (user.actingAsOrganizationId) {
        effectiveOrganizationId = user.actingAsOrganizationId.toString();
      }
      if (user.actingAsStoreId) {
        effectiveStoreId = user.actingAsStoreId.toString();
      }
    }

    req.user = {
      id: user._id.toString(),
      role: user.role,
      storeId: effectiveStoreId,
      organizationId: effectiveOrganizationId,
      managedStoreIds: (Array.isArray(user.managedStoreIds) ? user.managedStoreIds : []).filter(Boolean).map((id: any) => id.toString()),
      managedOrganizationIds: (Array.isArray(user.managedOrganizationIds) ? user.managedOrganizationIds : []).filter(Boolean).map((id: any) => id.toString()),
      assignments: (Array.isArray(user.assignments) ? user.assignments : []).filter(Boolean).map((a: any) => ({
        storeId: a.storeId ? a.storeId.toString() : undefined,
        role: a.role,
        status: a.status,
      })),
      name: user.name,
      phone: user.phone,
      permissions: [...new Set(permissions)], // Deduplicate
    };

    next();
  } catch (error) {
    console.error('[Auth] authenticate() failed:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid or expired authentication token.',
      debug: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated.' });
      return;
    }

    // Legacy and current role names are treated as the same role (STORE_MANAGER == BRANCH_MANAGER, etc.)
    const mine = canonicalRole(req.user.role);
    if (!roles.some((r) => canonicalRole(r) === mine)) {
      // Do not echo the allowed-role list: it tells an attacker which roles to go after.
      res.status(403).json({ success: false, error: 'Access forbidden for your role.' });
      return;
    }

    next();
  };
}

export function requirePermission(...requiredPermissions: Permission[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated.' });
      return;
    }

    const userPerms = req.user.permissions || [];
    // system:admin bypasses platform/admin permissions only. Floor operations (picking, exit lane,
    // discrepancy resolution, handover, shopping) must be held explicitly, so a platform admin can
    // never silently act as a picker, exit officer or customer.
    if (userPerms.includes('system:admin') && requiredPermissions.every((p) => !isFloorPermission(p))) {
      return next();
    }

    const hasAll = requiredPermissions.every((p) => userPerms.includes(p));
    if (!hasAll) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: you do not have permission to perform this action.',
      });
      return;
    }

    next();
  };
}

export function requireAnyPermission(...requiredPermissions: Permission[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated.' });
      return;
    }
    const userPerms = req.user.permissions || [];
    if (userPerms.includes('system:admin') && requiredPermissions.every((permission) => !isFloorPermission(permission))) {
      next();
      return;
    }
    if (!requiredPermissions.some((permission) => userPerms.includes(permission))) {
      res.status(403).json({ success: false, error: 'Forbidden: you do not have permission to perform this action.' });
      return;
    }
    next();
  };
}

// Scope non-admin staff to their assigned storeId.
// Platform roles have unrestricted multi-branch visibility.
// Org roles can access any store within their organization (with tenant validation).
// Branch staff (PICKER, EXIT_OFFICER, SUPERVISOR, BRANCH_MANAGER, etc.) are strictly locked to their storeId.
// Customers can access whatever store they selected.
export async function scopeToStore(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated.' });
      return;
    }

    // Platform roles: multi-branch visibility (what they may DO is decided by permissions).
    // Sub-admins restricted to specific organizations are still bounded by managedOrganizationIds.
    if (isPlatformRole(req.user.role)) {
      const requested = (req.query.storeId || (req.body && req.body.storeId)) as string | undefined;
      if (requested && !(await canAccessStore(req.user, String(requested)))) {
        res.status(403).json({ success: false, error: 'That branch is outside your assigned organizations.' });
        return;
      }
      return next();
    }

    // Organization roles: any branch of THEIR organization only. A storeId from the query/body
    // must be verified, otherwise an org admin could read another supermarket's branch.
    if (isOrgRole(req.user.role)) {
      const requested = (req.query.storeId || (req.body && req.body.storeId)) as string | undefined;
      if (requested && !(await canAccessStore(req.user, String(requested)))) {
        res.status(403).json({ success: false, error: 'That branch does not belong to your organization.' });
        return;
      }
      return next();
    }

    // Customers shop at whichever store they selected (the routes behind this middleware also
    // require staff permissions, which customers never hold).
    if (req.user.role === 'CUSTOMER') return next();

    // Region managers may touch only their configured branches. A storeId in the
    // request must be one of them; with no storeId they get the aggregated region view.
    if (isRegionRole(req.user.role)) {
      const managed = req.user.managedStoreIds || [];
      if (managed.length === 0) {
        res.status(403).json({ success: false, error: 'Region manager is not assigned to any branches.' });
        return;
      }
      const requested = (req.query.storeId || (req.body && req.body.storeId)) as string | undefined;
      if (requested && !managed.includes(String(requested))) {
        res.status(403).json({ success: false, error: 'That branch is outside your region.' });
        return;
      }
      return next();
    }

    // Branch staff are locked to their assigned branch(es). A manager with
    // managedStoreIds oversees several branches; everyone else is pinned to storeId.
    if (isBranchRole(req.user.role)) {
      // Home branch + managed branches + active secondary assignments.
      const allowedSet = new Set<string>();
      if (req.user.storeId) allowedSet.add(String(req.user.storeId));
      (req.user.managedStoreIds || []).forEach((id) => allowedSet.add(String(id)));
      (req.user.assignments || []).forEach((a) => {
        if (a.storeId && a.status !== 'SUSPENDED') allowedSet.add(a.storeId);
      });
      const allowed = [...allowedSet];
      if (allowed.length === 0) {
        res.status(403).json({ success: false, error: 'Staff user is not assigned to any retail store branch.' });
        return;
      }
      const requested = (req.query.storeId || (req.body && req.body.storeId)) as string | undefined;
      if (requested && !allowed.includes(String(requested))) {
        res.status(403).json({ success: false, error: 'Cross-branch access forbidden.' });
        return;
      }
      // Single-branch staff keep the old behaviour: the store is forced into the request.
      // Multi-branch users must pass storeId explicitly per request.
      if (allowed.length === 1) {
        req.query.storeId = allowed[0];
        if (req.body && typeof req.body === 'object') req.body.storeId = allowed[0];
      }
      return next();
    }

    // Unknown role: deny by default.
    res.status(403).json({ success: false, error: 'Access forbidden.' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Could not verify branch access.' });
  }
}

// Helper functions for role categorization
export function isPlatformRole(role: UserRole): boolean {
  const platformRoles = ['PLATFORM_OWNER', 'PLATFORM_ADMIN', 'PLATFORM_SUBADMIN', 'FINANCE_ADMIN', 'FINANCE_APPROVER',
                         'SUPPORT_AGENT_TIER1', 'SUPPORT_LEAD_TIER2', 'RISK_FRAUD_ANALYST',
                         'COMPLIANCE_AUDITOR', 'PLATFORM_ENGINEER', 'CUSTOMER_SUCCESS', 'SYSTEM_ADMIN'];
  return platformRoles.includes(role);
}

export function isOrgRole(role: UserRole): boolean {
  const orgRoles = ['ORG_OWNER', 'ORG_ADMIN', 'GENERAL_MANAGER', 'FINANCE_OFFICER', 'CATALOGUE_INVENTORY_MANAGER',
                    'MARKETING_MANAGER', 'LOSS_PREVENTION_MANAGER', 'ORG_AUDITOR'];
  return orgRoles.includes(role);
}

// Region managers oversee a configured subset of branches (managedStoreIds), not the whole org.
export function isRegionRole(role: UserRole): boolean {
  return role === 'REGION_MANAGER';
}

export function isBranchRole(role: UserRole): boolean {
  const branchRoles = ['BRANCH_MANAGER', 'STOCK_CONTROLLER', 'STOCK_MANAGER', 'SUPERVISOR', 'CASHIER_CUSTOMER_SERVICE',
                       'PICKER', 'PACKER_VERIFIER', 'EXIT_OFFICER', 'DELIVERY_COLLECTION_HANDOVER',
                       'EXIT_STAFF', 'STORE_MANAGER'];
  return branchRoles.includes(role);
}

export function requiresMFA(role: UserRole): boolean {
  // MFA required for all platform roles and org owners/admins/general managers
  return isPlatformRole(role) || role === 'ORG_OWNER' || role === 'ORG_ADMIN' || role === 'GENERAL_MANAGER' || role === 'REGION_MANAGER';
}

export function isLegacyRole(role: UserRole): boolean {
  return ['EXIT_STAFF', 'STORE_MANAGER', 'SYSTEM_ADMIN'].includes(role);
}

// Role migration helper: map legacy roles to new roles
export function migrateLegacyRole(role: UserRole): UserRole {
  switch (role) {
    case 'SYSTEM_ADMIN':
      return 'PLATFORM_OWNER';
    case 'STORE_MANAGER':
      return 'BRANCH_MANAGER';
    case 'EXIT_STAFF':
      return 'EXIT_OFFICER';
    default:
      return role;
  }
}

// ===================== Central access helpers (single source of truth) =====================

const ROLE_ALIASES: Record<string, UserRole> = {
  SYSTEM_ADMIN: 'PLATFORM_OWNER',
  STORE_MANAGER: 'BRANCH_MANAGER',
  EXIT_STAFF: 'EXIT_OFFICER',
};

/** Maps legacy role names to their current equivalent so role checks never disagree. */
export function canonicalRole(role: UserRole): UserRole {
  return ROLE_ALIASES[role] || role;
}

export type RoleScope = 'PLATFORM' | 'ORG' | 'REGION' | 'BRANCH' | 'CUSTOMER' | 'UNKNOWN';

export function roleScope(role: UserRole): RoleScope {
  if (isPlatformRole(role)) return 'PLATFORM';
  if (isOrgRole(role)) return 'ORG';
  if (isRegionRole(role)) return 'REGION';
  if (isBranchRole(role)) return 'BRANCH';
  if (role === 'CUSTOMER') return 'CUSTOMER';
  return 'UNKNOWN';
}

/** Restrict a permission-bearing route to role scopes that can own that workflow. */
export function requireRoleScope(...allowedScopes: RoleScope[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated.' });
      return;
    }
    if (!allowedScopes.includes(roleScope(req.user.role))) {
      res.status(403).json({ success: false, error: 'This role scope cannot perform that action.' });
      return;
    }
    next();
  };
}

// Permissions that belong to the shop floor and shopper journey. system:admin does not bypass these.
const FLOOR_PERMISSION_PREFIXES = ['picking:', 'exit:', 'discrepancy:', 'supervisor:', 'baskets:'];
const FLOOR_PERMISSIONS_EXACT = ['orders:handover', 'orders:create', 'orders:read:own'];

export function isFloorPermission(p: string): boolean {
  return FLOOR_PERMISSIONS_EXACT.includes(p) || FLOOR_PERMISSION_PREFIXES.some((prefix) => p.startsWith(prefix));
}

// Permission families a scope can never hold, even if someone grants them through overrides.
const FORBIDDEN_GRANT_PREFIXES: Record<RoleScope, string[]> = {
  PLATFORM: ['picking:', 'exit:', 'discrepancy:', 'supervisor:', 'baskets:', 'orders:handover', 'orders:create', 'orders:read:own'],
  ORG: ['platform:', 'system:', 'cs:', 'support:actas', 'data:reveal', 'picking:', 'exit:', 'discrepancy:', 'supervisor:',
        'baskets:', 'orders:handover', 'orders:create', 'orders:read:own'],
  REGION: ['platform:', 'system:', 'org:', 'wallet:', 'payouts:', 'finance:', 'compliance:', 'cs:',
           'support:actas', 'support:view:any', 'data:reveal', 'reports:export:sensitive', 'audit:export',
           'staff:manage', 'staff:terminate', 'stores:manage', 'stores:create', 'stores:suspend',
           'orders:read:any', 'orders:read:org', 'orders:refund', 'inventory:approve', 'pricing:write', 'pricing:approve'],
  BRANCH: ['platform:', 'system:', 'org:', 'wallet:', 'payouts:', 'finance:', 'compliance:', 'cs:',
           'support:actas', 'support:view:any', 'data:reveal', 'reports:export:sensitive', 'audit:export', 'orders:read:any', 'orders:read:org'],
  CUSTOMER: [''], // '' prefix matches everything: customers can never be elevated by overrides
  UNKNOWN: [''],
};

export function filterGrantablePermissions(role: UserRole, granted: Permission[]): Permission[] {
  const forbidden = FORBIDDEN_GRANT_PREFIXES[roleScope(role)] || [''];
  return granted.filter((p) => !forbidden.some((prefix) => p.startsWith(prefix)));
}

/**
 * The permission catalog a PLATFORM_SUBADMIN may be granted, grouped for the
 * permission-builder UI. Deliberately excludes powers that let a sub-admin
 * appoint more admins or rewrite platform settings — those stay with the owner.
 */
export const SUBADMIN_PERMISSION_CATALOG: { group: string; permissions: Permission[] }[] = [
  {
    group: 'Supermarket workspaces',
    permissions: ['platform:orgs:read', 'platform:orgs:create', 'platform:orgs:suspend', 'org:read', 'org:config', 'org:users:manage', 'org:subscription:view', 'org:subscription:manage'],
  },
  {
    group: 'Billing & finance',
    permissions: ['finance:ledger:read', 'finance:invoices:read', 'finance:invoices:create', 'finance:reconcile', 'finance:export', 'reports:read', 'reports:export', 'reports:export:sensitive'],
  },
  {
    group: 'Support',
    permissions: ['support:search', 'support:view:any', 'support:actas', 'support:reset_password', 'support:resend_receipt', 'support:retry_payment'],
  },
  {
    group: 'Monitoring & risk',
    permissions: ['fraud:view', 'fraud:config', 'fraud:block', 'fraud:unblock', 'fraud:review', 'audit:read', 'audit:export', 'compliance:read', 'system:health', 'system:feature_flags', 'cs:usage:view', 'cs:trials:manage'],
  },
  {
    group: 'Data access',
    permissions: ['data:reveal', 'data:mask'],
  },
];

/** Permissions that can never be granted to a PLATFORM_SUBADMIN (owner-only powers). */
export const SUBADMIN_FORBIDDEN: Permission[] = [
  'platform:admins:create', 'platform:admins:approve', 'platform:settings:write',
  'system:admin', 'system:maintenance',
];

/**
 * Can this user touch data that belongs to this store?
 *  - platform roles: any store (what they can DO is limited by permissions)
 *  - org roles: only stores that belong to their organization
 *  - branch roles: only their own assigned store
 *  - customers and unknown roles: never (customers use customer-facing, owner-scoped routes)
 */
export async function canAccessStore(
  user: NonNullable<AuthRequest['user']>,
  storeId: string | undefined | null
): Promise<boolean> {
  if (!storeId) return false;
  const scope = roleScope(user.role);

  const storeModule = await import('../modules/stores/store.model.js');
  const store = await (storeModule.default as any).findById(storeId).select('organizationId');
  if (!store) return false;

  if (scope === 'PLATFORM') {
    // Platform sub-admins may be restricted to specific supermarket organizations.
    const managedOrgs = user.managedOrganizationIds || [];
    if (managedOrgs.length === 0) return true;
    return !!store.organizationId && managedOrgs.includes(store.organizationId.toString());
  }
  if (scope === 'REGION') {
    return (user.managedStoreIds || []).includes(String(storeId));
  }
  if (scope === 'BRANCH') {
    // Branch staff reach: home storeId + managedStoreIds (multi-branch managers)
    // + any ACTIVE secondary assignment store. Permissions still resolve from the
    // primary role — assignments widen scope, never grant extra powers.
    const allowed = new Set<string>();
    if (user.storeId) allowed.add(String(user.storeId));
    (user.managedStoreIds || []).forEach((id) => allowed.add(String(id)));
    (user.assignments || []).forEach((a) => {
      if (a.storeId && a.status !== 'SUSPENDED') allowed.add(a.storeId);
    });
    return allowed.has(String(storeId));
  }
  if (scope === 'ORG') {
    if (!user.organizationId || !/^[a-f\d]{24}$/i.test(String(storeId))) return false;
    return !!store?.organizationId && store.organizationId.toString() === String(user.organizationId);
  }
  return false;
}

/** Can this user touch data that belongs to this organization? */
export function canAccessOrganization(
  user: NonNullable<AuthRequest['user']>,
  organizationId: string | undefined | null
): boolean {
  if (!organizationId) return false;
  const scope = roleScope(user.role);
  if (scope === 'PLATFORM') {
    const managedOrgs = user.managedOrganizationIds || [];
    return managedOrgs.length === 0 || managedOrgs.includes(String(organizationId));
  }
  if (scope === 'ORG' || scope === 'REGION' || scope === 'BRANCH') {
    return !!user.organizationId && String(user.organizationId) === String(organizationId);
  }
  return false;
}


/** Effective permissions for a user document: role + overrides, with the scope ceiling applied. */
export function effectivePermissionsFor(user: { role: UserRole; permissionOverrides?: { granted?: string[]; revoked?: string[] } }): Permission[] {
  let permissions = [...(ROLE_PERMISSIONS[user.role] || [])];
  const o = user.permissionOverrides;
  if (o?.revoked?.length) permissions = permissions.filter((p) => !o.revoked!.includes(p));
  if (o?.granted?.length) permissions = [...permissions, ...filterGrantablePermissions(user.role, o.granted as Permission[])];
  return [...new Set(permissions)];
}
