import { Router } from 'express';
import User from './user.model.js';
import Organization from '../organizations/organization.model.js';
import Store from '../stores/store.model.js';
import { authenticate, authorize, requirePermission, canAccessStore, canAccessOrganization, AuthRequest, Permission, roleScope, canonicalRole, filterGrantablePermissions } from '../../middleware/auth.js';
import AuditLog from '../audits/audit.model.js';
import { ROLE_PERMISSIONS } from '../../middleware/auth.js';
import { applyDataMasking, requireRevealPermission } from '../../middleware/dataMasking.js';

const router = Router();

/**
 * Get user's effective permissions (including overrides)
 * GET /api/v1/users/me/permissions
 */

/**
 * Who may change whose permissions. Nobody edits themselves; org admins stay inside their own
 * organization and below their own level; only a platform owner edits a platform owner.
 * Returns an error message, or null when allowed.
 */
function managementBlockReason(actor: NonNullable<AuthRequest['user']>, target: any): string | null {
  if (actor.id === target._id.toString()) return 'You cannot change your own permissions.';
  const actorScope = roleScope(actor.role);
  const targetRole = canonicalRole(target.role);
  const actorRole = canonicalRole(actor.role);
  if (actorScope === 'ORG') {
    if (!actor.organizationId || target.organizationId?.toString() !== actor.organizationId) {
      return 'You can only manage permissions for users in your organization.';
    }
    const targetScope = roleScope(target.role);
    if (targetScope !== 'BRANCH' && targetScope !== 'REGION' && targetScope !== 'ORG') return 'You cannot manage this user.';
    if (targetRole === 'ORG_OWNER') return 'Organization owners cannot be managed by other staff.';
    if (actorRole === 'ORG_ADMIN' && targetRole === 'ORG_ADMIN') return 'Organization admins cannot manage each other.';
  }
  if (actorScope === 'PLATFORM' && targetRole === 'PLATFORM_OWNER' && actorRole !== 'PLATFORM_OWNER') {
    return 'Only a platform owner can manage a platform owner.';
  }
  return null;
}

router.get('/me/permissions', authenticate, async (req: AuthRequest, res) => {
  try {
    res.json({
      success: true,
      permissions: req.user?.permissions || [],
      role: req.user?.role,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Set permission overrides for a user (ORG_ADMIN or platform roles only)
 * Users can only grant permissions they themselves hold
 * POST /api/v1/users/:userId/permissions
 */
router.post('/:userId/permissions', authenticate, requireRevealPermission, authorize('ORG_OWNER', 'ORG_ADMIN', 'PLATFORM_OWNER', 'PLATFORM_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    const blockReason = managementBlockReason(req.user!, targetUser);
    if (blockReason) {
      res.status(403).json({ success: false, error: blockReason });
      return;
    }

    const { granted, revoked } = req.body;
    const requestorPermissions = req.user?.permissions || [];

    // A role can never be granted permissions outside its own scope (e.g. a picker cannot be given wallet access).
    if (granted && Array.isArray(granted)) {
      const outOfScope = (granted as Permission[]).filter((p) => !filterGrantablePermissions(targetUser.role, [p]).length);
      if (outOfScope.length > 0) {
        res.status(403).json({ success: false, error: `These permissions do not apply to a ${targetUser.role}: ${outOfScope.join(', ')}` });
        return;
      }
    }

    // Validate: can only grant permissions the requestor holds
    if (granted && Array.isArray(granted)) {
      const invalidGrants = granted.filter((p: Permission) => !requestorPermissions.includes(p));
      if (invalidGrants.length > 0) {
        res.status(403).json({
          success: false,
          error: `Cannot grant permissions you don't hold: ${invalidGrants.join(', ')}`
        });
        return;
      }
    }

    // Apply overrides
    if (!targetUser.permissionOverrides) {
      targetUser.permissionOverrides = { granted: [], revoked: [] };
    }

    if (granted && Array.isArray(granted)) {
      targetUser.permissionOverrides.granted = granted;
    }
    if (revoked && Array.isArray(revoked)) {
      targetUser.permissionOverrides.revoked = revoked;
    }

    await targetUser.save();

    // Calculate effective permissions
    let effectivePermissions = [...(ROLE_PERMISSIONS[targetUser.role] || [])];
    if (targetUser.permissionOverrides.revoked) {
      effectivePermissions = effectivePermissions.filter(p => !targetUser.permissionOverrides!.revoked.includes(p));
    }
    if (targetUser.permissionOverrides.granted) {
      effectivePermissions = [...effectivePermissions, ...targetUser.permissionOverrides.granted];
    }

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'UPDATE_USER_PERMISSIONS',
      entityType: 'USER',
      entityId: targetUser._id.toString(),
      storeId: targetUser.storeId,
      previousValue: targetUser.permissionOverrides,
      newValue: { granted, revoked },
      reason: req.body.reason || 'Permission override update',
    });

    res.json({
      success: true,
      message: 'Permission overrides updated',
      effectivePermissions: [...new Set(effectivePermissions)],
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Clear permission overrides for a user
 * DELETE /api/v1/users/:userId/permissions
 */
router.delete('/:userId/permissions', authenticate, authorize('ORG_OWNER', 'ORG_ADMIN', 'PLATFORM_OWNER', 'PLATFORM_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    const blockReason = managementBlockReason(req.user!, targetUser);
    if (blockReason) {
      res.status(403).json({ success: false, error: blockReason });
      return;
    }

    const previous = targetUser.permissionOverrides;
    targetUser.permissionOverrides = undefined;
    await targetUser.save();

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'CLEAR_USER_PERMISSIONS',
      entityType: 'USER',
      entityId: targetUser._id.toString(),
      storeId: targetUser.storeId,
      previousValue: previous,
      reason: 'Cleared permission overrides',
    });

    res.json({
      success: true,
      message: 'Permission overrides cleared',
      effectivePermissions: ROLE_PERMISSIONS[targetUser.role] || [],
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Workspace switcher for platform roles
 * Set acting-as context for organization and/or store
 * POST /api/v1/users/me/switch-workspace
 */
router.post('/me/switch-workspace', authenticate, authorize('PLATFORM_OWNER', 'PLATFORM_ADMIN', 'SUPPORT_LEAD_TIER2'), async (req: AuthRequest, res) => {
  try {
    const { organizationId, storeId } = req.body;

    const user = await User.findById(req.user?.id);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    const previous = {
      actingAsOrganizationId: user.actingAsOrganizationId,
      actingAsStoreId: user.actingAsStoreId,
    };

    // Validate organization exists if provided
    if (organizationId) {
      const org = await Organization.findById(organizationId);
      if (!org) {
        res.status(404).json({ success: false, error: 'Organization not found.' });
        return;
      }
      user.actingAsOrganizationId = organizationId;
    } else {
      user.actingAsOrganizationId = undefined;
    }

    // Validate store exists and belongs to organization if provided
    if (storeId) {
      const store = await Store.findById(storeId);
      if (!store) {
        res.status(404).json({ success: false, error: 'Store not found.' });
        return;
      }
      if (organizationId && store.organizationId?.toString() !== organizationId) {
        res.status(400).json({ 
          success: false, 
          error: 'Store does not belong to the specified organization.' 
        });
        return;
      }
      user.actingAsStoreId = storeId;
    } else {
      user.actingAsStoreId = undefined;
    }

    await user.save();

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'SWITCH_WORKSPACE',
      entityType: 'USER',
      entityId: user._id.toString(),
      previousValue: previous,
      newValue: { organizationId, storeId },
      reason: 'System admin workspace switch',
    });

    res.json({
      success: true,
      message: 'Workspace context updated',
      actingAs: {
        organizationId: user.actingAsOrganizationId,
        storeId: user.actingAsStoreId,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Clear workspace switcher context
 * DELETE /api/v1/users/me/switch-workspace
 */
router.delete('/me/switch-workspace', authenticate, authorize('PLATFORM_OWNER', 'PLATFORM_ADMIN', 'SUPPORT_LEAD_TIER2'), async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.user?.id);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    const previous = {
      actingAsOrganizationId: user.actingAsOrganizationId,
      actingAsStoreId: user.actingAsStoreId,
    };

    user.actingAsOrganizationId = undefined;
    user.actingAsStoreId = undefined;
    await user.save();

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'CLEAR_WORKSPACE',
      entityType: 'USER',
      entityId: user._id.toString(),
      previousValue: previous,
      reason: 'Cleared workspace switcher context',
    });

    res.json({
      success: true,
      message: 'Workspace context cleared',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Update a staff member's org-structure scope: home branch, managed branches,
 * department, reporting line, employee ID and lifecycle status.
 * PATCH /api/v1/users/:userId/scope
 */
router.patch('/:userId/scope', authenticate, requirePermission('staff:manage'), async (req: AuthRequest, res) => {
  try {
    const target = await User.findById(req.params.userId);
    if (!target) return res.status(404).json({ success: false, error: 'User not found.' });
    if (req.user!.id === target._id.toString()) {
      return res.status(403).json({ success: false, error: 'You cannot change your own scope.' });
    }
    // Tenant check: the target must belong to the actor's organization.
    if (!canAccessOrganization(req.user!, target.organizationId?.toString())) {
      return res.status(403).json({ success: false, error: 'User is outside your organization.' });
    }
    const actorScope = roleScope(req.user!.role);
    const orgLevel = actorScope === 'ORG' || actorScope === 'PLATFORM';

    const { storeId, managedStoreIds, departmentId, reportsTo, employeeId, status } = req.body;
    const previous = {
      storeId: target.storeId, managedStoreIds: target.managedStoreIds, departmentId: target.departmentId,
      reportsTo: target.reportsTo, employeeId: target.employeeId, status: target.status,
    };

    if (storeId !== undefined) {
      if (storeId && !(await canAccessStore(req.user!, String(storeId)))) {
        return res.status(403).json({ success: false, error: 'That branch is outside your scope.' });
      }
      target.storeId = storeId || undefined;
    }
    if (managedStoreIds !== undefined) {
      if (!orgLevel) {
        return res.status(403).json({ success: false, error: 'Only organization managers can change branch assignments.' });
      }
      const ids = Array.isArray(managedStoreIds) ? managedStoreIds.map(String).filter(Boolean) : [];
      for (const id of ids) {
        if (!(await canAccessStore(req.user!, id))) {
          return res.status(403).json({ success: false, error: 'One of the selected branches is outside your scope.' });
        }
      }
      target.managedStoreIds = ids as any;
    }
    if (departmentId !== undefined) target.departmentId = departmentId || undefined;
    if (reportsTo !== undefined) {
      if (reportsTo) {
        const manager = await User.findById(reportsTo).select('organizationId');
        if (!manager || manager.organizationId?.toString() !== target.organizationId?.toString()) {
          return res.status(400).json({ success: false, error: 'Reporting manager must be in the same organization.' });
        }
      }
      target.reportsTo = reportsTo || undefined;
    }
    if (employeeId !== undefined) target.employeeId = employeeId ? String(employeeId).trim() : undefined;
    if (status !== undefined) {
      const allowed = orgLevel ? ['ACTIVE', 'SUSPENDED', 'ON_LEAVE', 'DEACTIVATED'] : ['ACTIVE', 'SUSPENDED', 'ON_LEAVE'];
      if (!allowed.includes(status)) {
        return res.status(400).json({ success: false, error: `Status must be one of: ${allowed.join(', ')}` });
      }
      target.status = status;
      // Deactivation/suspension also blocks login via the active flag.
      target.active = status === 'ACTIVE';
    }

    await target.save();
    await AuditLog.create({
      actorId: req.user?.id, actorRole: req.user?.role, actorName: req.user?.name,
      action: 'UPDATE_STAFF_SCOPE', entityType: 'USER', entityId: target._id.toString(),
      storeId: target.storeId, previousValue: previous, newValue: req.body,
      reason: req.body.reason || 'Staff scope update',
    });
    res.json({ success: true, user: { id: target._id, storeId: target.storeId, managedStoreIds: target.managedStoreIds, departmentId: target.departmentId, reportsTo: target.reportsTo, employeeId: target.employeeId, status: target.status } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Add a secondary branch/department assignment (e.g. inventory manager at A,
 * stock controller at B). POST /api/v1/users/:userId/assignments
 */
router.post('/:userId/assignments', authenticate, requirePermission('staff:assign'), async (req: AuthRequest, res) => {
  try {
    const target = await User.findById(req.params.userId);
    if (!target) return res.status(404).json({ success: false, error: 'User not found.' });
    if (!canAccessOrganization(req.user!, target.organizationId?.toString())) {
      return res.status(403).json({ success: false, error: 'User is outside your organization.' });
    }
    const { storeId, departmentId, role, employeeId, reportsTo } = req.body;
    if (!role || !['REGION_MANAGER', 'BRANCH_MANAGER', 'STOCK_CONTROLLER', 'SUPERVISOR', 'CASHIER_CUSTOMER_SERVICE', 'PICKER', 'PACKER_VERIFIER', 'EXIT_OFFICER', 'DELIVERY_COLLECTION_HANDOVER'].includes(role)) {
      return res.status(400).json({ success: false, error: 'A valid branch-level role is required.' });
    }
    if (storeId && !(await canAccessStore(req.user!, String(storeId)))) {
      return res.status(403).json({ success: false, error: 'That branch is outside your scope.' });
    }
    if (role === 'REGION_MANAGER' || role === 'BRANCH_MANAGER') {
      // Multi-branch roles live on managedStoreIds, not in per-branch assignments.
      return res.status(400).json({ success: false, error: 'Use the scope endpoint to assign manager roles.' });
    }
    const assignment = {
      storeId: storeId || undefined,
      departmentId: departmentId || undefined,
      role,
      employeeId: employeeId ? String(employeeId).trim() : undefined,
      reportsTo: reportsTo || undefined,
      status: 'ACTIVE' as const,
      createdAt: new Date(),
    };
    target.assignments = [...(target.assignments || []), assignment];
    await target.save();
    await AuditLog.create({
      actorId: req.user?.id, actorRole: req.user?.role, actorName: req.user?.name,
      action: 'ADD_STAFF_ASSIGNMENT', entityType: 'USER', entityId: target._id.toString(),
      storeId: storeId, newValue: assignment, reason: 'Additional staff assignment',
    });
    res.status(201).json({ success: true, assignments: target.assignments });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** Suspend or remove an assignment by index. DELETE /api/v1/users/:userId/assignments/:index */
router.delete('/:userId/assignments/:index', authenticate, requirePermission('staff:assign'), async (req: AuthRequest, res) => {
  try {
    const target = await User.findById(req.params.userId);
    if (!target) return res.status(404).json({ success: false, error: 'User not found.' });
    if (!canAccessOrganization(req.user!, target.organizationId?.toString())) {
      return res.status(403).json({ success: false, error: 'User is outside your organization.' });
    }
    const index = Number(req.params.index);
    const list = target.assignments || [];
    if (!Number.isInteger(index) || index < 0 || index >= list.length) {
      return res.status(404).json({ success: false, error: 'Assignment not found.' });
    }
    const removed = list.splice(index, 1)[0];
    target.assignments = list;
    await target.save();
    await AuditLog.create({
      actorId: req.user?.id, actorRole: req.user?.role, actorName: req.user?.name,
      action: 'REMOVE_STAFF_ASSIGNMENT', entityType: 'USER', entityId: target._id.toString(),
      storeId: removed.storeId, previousValue: removed, reason: 'Staff assignment removed',
    });
    res.json({ success: true, assignments: target.assignments });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
