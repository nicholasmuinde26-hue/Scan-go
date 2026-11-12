import User from '../users/user.model.js';
import AuditLog from '../audits/audit.model.js';
import { AuthRequest } from '../../middleware/auth.js';

/**
 * Roles that require quarterly access review
 */
const PRIVILEGED_ROLES = [
  // Platform roles
  'PLATFORM_OWNER',
  'PLATFORM_ADMIN',
  'FINANCE_ADMIN',
  'FINANCE_APPROVER',
  'SUPPORT_LEAD_TIER2',
  'RISK_FRAUD_ANALYST',
  'COMPLIANCE_AUDITOR',
  'PLATFORM_ENGINEER',
  // Organization roles
  'ORG_OWNER',
  'ORG_ADMIN',
  'FINANCE_OFFICER',
  'LOSS_PREVENTION_MANAGER',
  // Branch roles
  'BRANCH_MANAGER',
];

/**
 * Get all users with privileged roles for access review
 */
export async function getPrivilegedUsers(req: AuthRequest, filters?: {
  role?: string;
  organizationId?: string;
  storeId?: string;
}) {
  const query: any = {
    role: { $in: PRIVILEGED_ROLES },
    status: 'ACTIVE',
  };

  // Filter by role if specified
  if (filters?.role) {
    query.role = filters.role;
  }

  // Filter by organization if specified (for org admins reviewing their org)
  if (filters?.organizationId) {
    query.organizationId = filters.organizationId;
  }

  // Filter by store if specified (for branch managers reviewing their store)
  if (filters?.storeId) {
    query.storeId = filters.storeId;
  }

  // Platform roles can see all privileged users
  // Org roles can only see their org's privileged users
  // Branch roles can only see their store's privileged users
  const platformRoles = ['PLATFORM_OWNER', 'PLATFORM_ADMIN', 'COMPLIANCE_AUDITOR'];
  const orgRoles = ['ORG_OWNER', 'ORG_ADMIN', 'LOSS_PREVENTION_MANAGER'];
  const branchRoles = ['BRANCH_MANAGER'];

  if (platformRoles.includes(req.user!.role)) {
    // No additional filtering needed
  } else if (orgRoles.includes(req.user!.role)) {
    query.organizationId = req.user!.organizationId;
  } else if (branchRoles.includes(req.user!.role)) {
    query.storeId = req.user!.storeId;
  } else {
    throw new Error('Insufficient permissions to view privileged users');
  }

  const users = await User.find(query)
    .select('-passwordHash -mfaSecret -mfaBackupCodes')
    .populate('organizationId', 'name slug')
    .populate('storeId', 'name code')
    .sort({ role: 1, name: 1 });

  // Add metadata for review
  const usersWithMetadata = users.map((user) => ({
    id: user._id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    organization: user.organizationId,
    store: user.storeId,
    mfaEnabled: user.mfaEnabled,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    permissionExpiry: user.permissionExpiry,
    // Calculate days since last login
    daysSinceLastLogin: user.lastLoginAt
      ? Math.floor((Date.now() - user.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24))
      : null,
    // Calculate days since account creation
    daysSinceCreation: Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
    // Flag for review (no login in 90 days or account > 90 days old without MFA)
    needsReview: shouldFlagForReview(user),
  }));

  return usersWithMetadata;
}

/**
 * Check if a user should be flagged for review
 */
function shouldFlagForReview(user: any): boolean {
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;

  // Flag if no login in 90 days
  if (user.lastLoginAt && Date.now() - user.lastLoginAt.getTime() > ninetyDays) {
    return true;
  }

  // Flag if account is > 90 days old and MFA is not enabled (for privileged roles)
  if (Date.now() - user.createdAt.getTime() > ninetyDays && !user.mfaEnabled) {
    return true;
  }

  // Flag if permissions are expiring soon (within 7 days)
  if (user.permissionExpiry && user.permissionExpiry.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000) {
    return true;
  }

  return false;
}

/**
 * Revoke user access (deactivate account)
 */
export async function revokeAccess(req: AuthRequest, userId: string, reason: string) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Check if user has permission to revoke this user's access
  const platformRoles = ['PLATFORM_OWNER', 'PLATFORM_ADMIN'];
  const orgRoles = ['ORG_OWNER', 'ORG_ADMIN'];

  if (platformRoles.includes(req.user!.role)) {
    // Can revoke any privileged user
  } else if (orgRoles.includes(req.user!.role)) {
    // Can only revoke users in their organization
    if (user.organizationId?.toString() !== req.user!.organizationId) {
      throw new Error('You can only revoke access for users in your organization');
    }
  } else {
    throw new Error('Insufficient permissions to revoke access');
  }

  // Prevent self-revocation
  if (userId === req.user!.id) {
    throw new Error('Cannot revoke your own access');
  }

  // Deactivate the user
  user.status = 'DEACTIVATED';
  user.permissionExpiry = new Date(); // Expire permissions immediately
  await user.save();

  // Log the revocation
  await AuditLog.create({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    actorName: req.user!.name,
    action: 'REVOKE_ACCESS',
    entityType: 'USER',
    entityId: userId,
    details: {
      reason,
      previousRole: user.role,
    },
  });

  return { success: true, message: 'Access revoked successfully' };
}

/**
 * Grant temporary access (set permission expiry)
 */
export async function grantTemporaryAccess(req: AuthRequest, userId: string, expiryDays: number, reason: string) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Check if user has permission to grant temporary access
  const platformRoles = ['PLATFORM_OWNER', 'PLATFORM_ADMIN'];
  const orgRoles = ['ORG_OWNER', 'ORG_ADMIN'];

  if (platformRoles.includes(req.user!.role)) {
    // Can grant to any user
  } else if (orgRoles.includes(req.user!.role)) {
    // Can only grant to users in their organization
    if (user.organizationId?.toString() !== req.user!.organizationId) {
      throw new Error('You can only grant temporary access to users in your organization');
    }
  } else {
    throw new Error('Insufficient permissions to grant temporary access');
  }

  // Validate expiry (max 90 days)
  if (expiryDays > 90) {
    throw new Error('Temporary access cannot exceed 90 days');
  }

  // Set permission expiry
  user.permissionExpiry = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
  if (user.status === 'DEACTIVATED') {
    user.status = 'ACTIVE';
  }
  await user.save();

  // Log the grant
  await AuditLog.create({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    actorName: req.user!.name,
    action: 'GRANT_TEMPORARY_ACCESS',
    entityType: 'USER',
    entityId: userId,
    details: {
      reason,
      expiryDays,
      expiresAt: user.permissionExpiry,
    },
  });

  return { success: true, message: 'Temporary access granted', expiresAt: user.permissionExpiry };
}

/**
 * Get access review statistics
 */
export async function getAccessReviewStats(req: AuthRequest) {
  const privilegedUsers = await getPrivilegedUsers(req);

  const stats = {
    totalPrivilegedUsers: privilegedUsers.length,
    usersNeedingReview: privilegedUsers.filter((u) => u.needsReview).length,
    usersWithoutMFA: privilegedUsers.filter((u) => !u.mfaEnabled).length,
    usersInactive90Days: privilegedUsers.filter((u) => u.daysSinceLastLogin && u.daysSinceLastLogin > 90).length,
    expiringSoon: privilegedUsers.filter((u) => u.permissionExpiry && new Date(u.permissionExpiry) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)).length,
    byRole: {} as Record<string, number>,
  };

  // Count by role
  privilegedUsers.forEach((user) => {
    stats.byRole[user.role] = (stats.byRole[user.role] || 0) + 1;
  });

  return stats;
}
