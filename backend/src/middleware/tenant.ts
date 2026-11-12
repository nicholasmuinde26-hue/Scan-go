import { Response, NextFunction } from 'express';
import Organization, { OrganizationStatus } from '../modules/organizations/organization.model.js';
import Store from '../modules/stores/store.model.js';
import { AuthRequest } from './auth.js';

export interface TenantContext {
  organizationId?: string;
  organizationStatus?: OrganizationStatus | 'ACTIVE' | 'SUSPENDED';
  storeId?: string;
  storeActive?: boolean;
  isSystemAdmin: boolean;
  isOrgAdmin: boolean;
  isCustomer: boolean;
}

/**
 * Tenant Context Middleware
 * 
 * Resolves organization and store context from the authenticated user,
 * validates subscription status (ACTIVE vs SUSPENDED), and attaches
 * tenant information to the request for downstream use.
 * 
 * This middleware should run AFTER authenticate() but BEFORE
 * route handlers that need tenant-aware filtering.
 */
export async function requireTenantContext(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated.' });
    return;
  }

  const tenantContext: TenantContext = {
    isSystemAdmin: req.user.role === 'SYSTEM_ADMIN',
    isOrgAdmin: req.user.role === 'ORG_ADMIN',
    isCustomer: req.user.role === 'CUSTOMER',
  };

  // SYSTEM_ADMIN has full access across all organizations and stores
  if (tenantContext.isSystemAdmin) {
    // System admins can act on any org/store via explicit query params
    // but we still validate them if provided
    if (req.query.organizationId) {
      const org = await Organization.findById(req.query.organizationId);
      if (!org) {
        res.status(404).json({ success: false, error: 'Organization not found.' });
        return;
      }
      tenantContext.organizationId = org._id.toString();
      tenantContext.organizationStatus = org.status;
    }
    if (req.query.storeId) {
      const store = await Store.findById(req.query.storeId);
      if (!store) {
        res.status(404).json({ success: false, error: 'Store not found.' });
        return;
      }
      tenantContext.storeId = store._id.toString();
      tenantContext.storeActive = store.active;
      if (store.organizationId) {
        tenantContext.organizationId = store.organizationId.toString();
        const org = await Organization.findById(store.organizationId);
        if (org) {
          tenantContext.organizationStatus = org.status;
        }
      }
    }
  }
  // ORG_ADMIN has access to their organization and all its stores
  else if (tenantContext.isOrgAdmin) {
    if (!req.user.organizationId) {
      res.status(403).json({ 
        success: false, 
        error: 'ORG_ADMIN must be assigned to an organization.' 
      });
      return;
    }

    const org = await Organization.findById(req.user.organizationId);
    if (!org) {
      res.status(404).json({ success: false, error: 'Organization not found.' });
      return;
    }

    tenantContext.organizationId = org._id.toString();
    tenantContext.organizationStatus = org.status;

    // If storeId is provided, validate it belongs to this org
    if (req.query.storeId) {
      const store = await Store.findOne({ 
        _id: req.query.storeId, 
        organizationId: org._id 
      });
      if (!store) {
        res.status(403).json({ 
          success: false, 
          error: 'Store not found or does not belong to your organization.' 
        });
        return;
      }
      tenantContext.storeId = store._id.toString();
      tenantContext.storeActive = store.active;
    }

    // Check subscription status - block operations if suspended
    if (org.status === 'SUSPENDED') {
      const suspendedOperation = isSuspendedOperation(req.method, req.path);
      if (suspendedOperation) {
        res.status(403).json({ 
          success: false, 
          error: 'Organization is suspended. This operation is not allowed.' 
        });
        return;
      }
    }
  }
  // Store staff (STORE_MANAGER, SUPERVISOR, PICKER, EXIT_STAFF) are scoped to their store
  else if (req.user.storeId) {
    const store = await Store.findById(req.user.storeId);
    if (!store) {
      res.status(404).json({ success: false, error: 'Assigned store not found.' });
      return;
    }

    tenantContext.storeId = store._id.toString();
    tenantContext.storeActive = store.active;

    if (store.organizationId) {
      tenantContext.organizationId = store.organizationId.toString();
      const org = await Organization.findById(store.organizationId);
      if (org) {
        tenantContext.organizationStatus = org.status;
        
        // Check subscription status
        if (org.status === 'SUSPENDED') {
          const suspendedOperation = isSuspendedOperation(req.method, req.path);
          if (suspendedOperation) {
            res.status(403).json({ 
              success: false, 
              error: 'Organization is suspended. This operation is not allowed.' 
            });
            return;
          }
        }
      }
    }

    // Reject if query tries to access a different store
    if (req.query.storeId && req.query.storeId !== store._id.toString()) {
      res.status(403).json({ 
        success: false, 
        error: 'Cross-branch access forbidden.' 
      });
      return;
    }

    // Force query and body storeId to user's store
    req.query.storeId = store._id.toString();
    if (req.body && typeof req.body === 'object') {
      req.body.storeId = store._id.toString();
    }
  }
  // CUSTOMER can access any store they're shopping at
  else if (tenantContext.isCustomer) {
    // Customers select which store they're shopping at via query/body
    if (req.query.storeId) {
      const store = await Store.findById(req.query.storeId);
      if (!store) {
        res.status(404).json({ success: false, error: 'Store not found.' });
        return;
      }
      if (!store.active) {
        res.status(403).json({ success: false, error: 'Store is not active.' });
        return;
      }
      tenantContext.storeId = store._id.toString();
      tenantContext.storeActive = store.active;

      if (store.organizationId) {
        tenantContext.organizationId = store.organizationId.toString();
        const org = await Organization.findById(store.organizationId);
        if (org) {
          tenantContext.organizationStatus = org.status;
          
          // Check subscription status - block new orders if suspended
          if (org.status === 'SUSPENDED' && isSuspendedOperation(req.method, req.path)) {
            res.status(403).json({ 
              success: false, 
              error: 'This store is currently unavailable for new orders.' 
            });
            return;
          }
        }
      }
    }
  }
  // User has no org or store assignment
  else {
    res.status(403).json({ 
      success: false, 
      error: 'User is not assigned to an organization or store.' 
    });
    return;
  }

  // Attach tenant context to request
  (req as any).tenant = tenantContext;
  next();
}

/**
 * Check if an operation should be blocked for suspended organizations
 * 
 * Suspended orgs allow:
 * - Staff to log in and settle
 * - Viewing existing data
 * 
 * Suspended orgs block:
 * - New baskets
 * - New checkouts
 * - STK pushes
 */
function isSuspendedOperation(method: string, path: string): boolean {
  const lowerPath = path.toLowerCase();
  
  // Block POST operations that create new resources
  if (method === 'POST') {
    // Allow auth, view operations
    if (lowerPath.includes('/auth/') || lowerPath.includes('/orders') && lowerPath.includes('get')) {
      return false;
    }
    // Block new baskets, orders, payments
    if (lowerPath.includes('/baskets') || 
        lowerPath.includes('/orders') || 
        lowerPath.includes('/payments/stk-push')) {
      return true;
    }
  }
  
  // Block PUT/PATCH that modify critical resources
  if (method === 'PUT' || method === 'PATCH') {
    // Allow user profile updates, settlement
    if (lowerPath.includes('/users/') && !lowerPath.includes('/role')) {
      return false;
    }
    // Block product updates, store config changes
    if (lowerPath.includes('/products') || lowerPath.includes('/stores')) {
      return true;
    }
  }
  
  return false;
}

/**
 * Middleware to ensure store context is present
 * Used for operations that must be scoped to a specific store
 */
export function requireStoreContext(req: AuthRequest, res: Response, next: NextFunction): void {
  const tenant = (req as any).tenant as TenantContext;
  
  if (!tenant || !tenant.storeId) {
    res.status(400).json({ 
      success: false, 
      error: 'Store context is required for this operation.' 
    });
    return;
  }
  
  next();
}

/**
 * Middleware to ensure organization context is present
 * Used for org-level operations
 */
export function requireOrganizationContext(req: AuthRequest, res: Response, next: NextFunction): void {
  const tenant = (req as any).tenant as TenantContext;
  
  if (!tenant || !tenant.organizationId) {
    res.status(400).json({ 
      success: false, 
      error: 'Organization context is required for this operation.' 
    });
    return;
  }
  
  next();
}
