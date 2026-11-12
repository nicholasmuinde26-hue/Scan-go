import { Router } from 'express';
import User from './user.model.js';
import Organization from '../organizations/organization.model.js';
import Store from '../stores/store.model.js';
import { authenticate, authorize, AuthRequest, Permission, roleScope, canonicalRole, filterGrantablePermissions } from '../../middleware/auth.js';
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
    if (targetScope !== 'BRANCH' && targetScope !== 'ORG') return 'You cannot manage this user.';
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

export default router;
