import { Request, Response, NextFunction } from 'express';
import { Permission } from '../models/rbac/permission.model.js';
import { RolePermission } from '../models/rbac/rolePermission.model.js';
import { UserRoleAssignment } from '../models/rbac/userRoleAssignment.model.js';
import { AuthRequest } from './auth.js';
import { Types } from 'mongoose';

/**
 * Helper to test whether a scope object matches an assignment.
 * All defined fields in the assignment must equal the corresponding
 * field in the requested scope. Undefined fields are ignored.
 */
function matchesScope(assignment: any, scope: any): boolean {
  const fields = ['organizationId', 'storeId', 'regionId', 'departmentId'];
  for (const f of fields) {
    if (assignment[f]) {
      // Convert both sides to string for safe comparison (ObjectId vs string)
      if (!scope[f] || assignment[f].toString() !== scope[f].toString()) return false;
    }
  }
  return true;
}

/**
 * Core permission check – returns true if the authenticated user has the
 * supplied permission key within the requested scope.
 */
export async function hasPermission(
  user: any,
  permissionKey: string,
  scope: { organizationId?: string; storeId?: string; regionId?: string; departmentId?: string },
): Promise<boolean> {
  const perm = await Permission.findOne({ key: permissionKey }).lean();
  if (!perm) return false;

  const assignments = await UserRoleAssignment.find({ userId: user._id }).lean();
  for (const a of assignments) {
    const has = await RolePermission.exists({ roleId: a.roleId, permissionId: perm._id });
    if (has && matchesScope(a, scope)) return true;
  }
  return false;
}

/**
 * Express middleware generator.
 *   authorize('staff:manage', { organizationId: req.user.organizationId, storeId: req.body.storeId })
 * The `scopeResolver` argument may be a plain object or a function that returns the scope.
 */
export function authorize(
  permissionKey: string,
  scopeResolver: ((req: AuthRequest) => any) | any,
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    let scope = typeof scopeResolver === 'function' ? scopeResolver(req) : scopeResolver;
    // If resolver returns a Promise, await it
    if (scope && typeof (scope as any).then === 'function') {
      scope = await scope;
    }
    // Attach resolved scope to request for downstream handlers
    (req as any).resolvedScope = scope;
    const allowed = await hasPermission(req.user, permissionKey, scope);
    if (!allowed) {
      return res.status(403).json({ success: false, error: 'Forbidden – missing permission.' });
    }
    next();
  };
}
 
