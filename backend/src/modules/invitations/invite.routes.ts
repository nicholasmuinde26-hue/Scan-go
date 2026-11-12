import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import Invite from './invite.model.js';
import User from '../users/user.model.js';
import Organization from '../organizations/organization.model.js';
import Store from '../stores/store.model.js';
import AuditLog from '../audits/audit.model.js';
import { authenticate, authorize, AuthRequest, canonicalRole, canAccessStore } from '../../middleware/auth.js';
import { validatePasswordStrength } from '../../shared/utils/passwordPolicy.js';
import bcrypt from 'bcryptjs';
import { rejectIfSubscriptionBlocked } from '../../middleware/subscriptionGate.js';

const router = Router();

// ---------------------------------------------------------------------------------------------
// Who may invite whom. Without this, any branch manager could invite an ORG_ADMIN (or a platform
// owner) and then log in as them. A person can only invite roles BELOW their own, inside their own tenant.
// Platform staff are never created through invites; they go through the platform maker-checker flow.
// ---------------------------------------------------------------------------------------------
const BRANCH_STAFF_ROLES = [
  'BRANCH_MANAGER', 'STOCK_CONTROLLER', 'SUPERVISOR', 'CASHIER_CUSTOMER_SERVICE',
  'PICKER', 'PACKER_VERIFIER', 'EXIT_OFFICER', 'DELIVERY_COLLECTION_HANDOVER',
];
const ORG_STAFF_ROLES = [
  'ORG_ADMIN', 'FINANCE_OFFICER', 'CATALOGUE_INVENTORY_MANAGER', 'MARKETING_MANAGER',
  'LOSS_PREVENTION_MANAGER', 'ORG_AUDITOR',
];

const INVITABLE_BY: Record<string, string[]> = {
  // Platform organization admins/owners are appointed in the platform console,
  // where the one-owner-per-organization rule is enforced. Platform staff roles
  // are handled by the separate maker-checker approval flow.
  PLATFORM_OWNER: [],
  PLATFORM_ADMIN: [],
  // Org Owners and Org Admins are appointed by platform staff through the
  // platform organization workflow, never through tenant staff invitations.
  ORG_OWNER: [...ORG_STAFF_ROLES.filter((r) => r !== 'ORG_ADMIN'), ...BRANCH_STAFF_ROLES],
  ORG_ADMIN: [...ORG_STAFF_ROLES.filter((r) => r !== 'ORG_ADMIN'), ...BRANCH_STAFF_ROLES],
  BRANCH_MANAGER: BRANCH_STAFF_ROLES.filter((r) => r !== 'BRANCH_MANAGER'),
};

// Hash token helper
function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// 1. Create an invite (Platform super-admin or Org admin or Branch manager)
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const name = String(req.body.name || '').trim();
    const phone = String(req.body.phone || '').trim();
    const email = req.body.email ? String(req.body.email).trim() : undefined;
    const { role, organizationId, storeId } = req.body;

    if (!name || !phone || !role) {
      res.status(400).json({ success: false, error: 'Name, phone, and role are required.' });
      return;
    }

    // 1. Is the inviter allowed to invite at all, and is this role one they may hand out?
    const inviterRole = canonicalRole(req.user!.role) as string;
    const allowedRoles = INVITABLE_BY[inviterRole];
    if (!allowedRoles) {
      res.status(403).json({ success: false, error: 'You are not authorized to create invitations.' });
      return;
    }
    if (!allowedRoles.includes(role)) {
      res.status(403).json({ success: false, error: 'You are not allowed to invite someone into that role.' });
      return;
    }

    const isPlatformInviter = ['PLATFORM_OWNER', 'PLATFORM_ADMIN'].includes(inviterRole);
    const isOrgInviter = ['ORG_OWNER', 'ORG_ADMIN'].includes(inviterRole);
    const isBranchRoleInvite = BRANCH_STAFF_ROLES.includes(role);

    // Ensure phone is not already registered
    const existingUser = await User.findOne({ phone: phone.trim() });
    if (existingUser) {
      res.status(409).json({ success: false, error: 'A user with this phone number is already registered.' });
      return;
    }

    // 2. Resolve the tenant the new person will belong to. Never trust organizationId/storeId from the body
    //    unless the inviter is platform staff, and even then check the two belong together.
    let targetOrgId: string | undefined;
    let targetStoreId: string | undefined;

    if (isPlatformInviter) {
      targetOrgId = organizationId ? String(organizationId) : undefined;
      targetStoreId = storeId ? String(storeId) : undefined;
      if (targetStoreId) {
        const store = await Store.findById(targetStoreId).select('organizationId');
        if (!store) {
          res.status(404).json({ success: false, error: 'Store not found.' });
          return;
        }
        if (targetOrgId && store.organizationId?.toString() !== targetOrgId) {
          res.status(400).json({ success: false, error: 'That store does not belong to the chosen organization.' });
          return;
        }
        targetOrgId = store.organizationId?.toString();
      }
    } else if (isOrgInviter) {
      targetOrgId = req.user!.organizationId;
      targetStoreId = storeId ? String(storeId) : undefined;
      if (targetStoreId && !(await canAccessStore(req.user!, targetStoreId))) {
        res.status(403).json({ success: false, error: 'That branch does not belong to your organization.' });
        return;
      }
    } else {
      // Branch manager: always their own branch.
      targetOrgId = req.user!.organizationId;
      targetStoreId = req.user!.storeId;
    }

    // 3. Branch roles must be pinned to one branch; organization roles must not be.
    if (isBranchRoleInvite && !targetStoreId) {
      res.status(400).json({ success: false, error: 'Choose the branch this staff member will work at.' });
      return;
    }
    if (!isBranchRoleInvite) targetStoreId = undefined;

    // Customers do not consume a paid staff seat. Every other invited role is checked
    // against the organization subscription before the invitation is issued.
    if (role !== 'CUSTOMER') {
      if (!targetOrgId && targetStoreId) {
        const targetStore = await Store.findById(targetStoreId).select('organizationId');
        targetOrgId = targetStore?.organizationId?.toString();
      }
      if (!targetOrgId) {
        res.status(400).json({ success: false, error: 'Staff invitations must be assigned to an organization or store.' });
        return;
      }
      if (await rejectIfSubscriptionBlocked(res, String(targetOrgId), 'invite_staff')) return;
    }

    // Generate random 32-byte single-use cryptographic token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashInviteToken(rawToken);

    // 48 hours expiry
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const invite = await Invite.create({
      tokenHash,
      role,
      organizationId: targetOrgId,
      storeId: targetStoreId,
      phone: phone.trim(),
      email: email ? email.trim() : undefined,
      name: name.trim(),
      invitedBy: req.user?.id,
      expiresAt,
      status: 'PENDING',
    });

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'CREATE_INVITE',
      entityType: 'USER',
      entityId: invite._id.toString(),
      storeId: targetStoreId,
      newValue: { phone: invite.phone, role: invite.role, organizationId: targetOrgId, storeId: targetStoreId },
      reason: `Invite generated for ${name} (${role})`,
    });

    // In production, send SMS/Email with the link. For testing/demo UI, return inviteLink.
    const inviteLink = `/accept-invite/${rawToken}`;

    res.status(201).json({
      success: true,
      message: 'Invitation generated successfully.',
      inviteId: invite._id,
      inviteLink,
      token: rawToken,
      expiresAt,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Query / Validate invite token by public URL (/accept-invite/:token)
router.get('/validate/:token', async (req: Request, res: Response) => {
  try {
    const tokenParam = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    const rawToken = tokenParam;
    const tokenHash = hashInviteToken(rawToken);

    const invite = await Invite.findOne({ tokenHash, status: 'PENDING' })
      .populate('organizationId', 'name slug')
      .populate('storeId', 'name code location');

    if (!invite) {
      res.status(404).json({ success: false, error: 'Invitation link is invalid, expired, or has already been used.' });
      return;
    }

    if (new Date() > invite.expiresAt) {
      invite.status = 'EXPIRED';
      await invite.save();
      res.status(410).json({ success: false, error: 'This invitation has expired (valid for 48 hours).' });
      return;
    }

    res.json({
      success: true,
      invite: {
        name: invite.name,
        phone: invite.phone,
        email: invite.email,
        role: invite.role,
        organization: invite.organizationId,
        store: invite.storeId,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Accept invite and activate account
router.post('/accept/:token', async (req: Request, res: Response) => {
  try {
    const tokenParam = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    const rawToken = tokenParam;
    const { password } = req.body;

    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      res.status(400).json({ success: false, error: pwCheck.error });
      return;
    }

    const tokenHash = hashInviteToken(rawToken);
    const invite = await Invite.findOne({ tokenHash, status: 'PENDING' });

    if (!invite) {
      res.status(404).json({ success: false, error: 'Invitation link is invalid or already used.' });
      return;
    }

    if (new Date() > invite.expiresAt) {
      invite.status = 'EXPIRED';
      await invite.save();
      res.status(410).json({ success: false, error: 'This invitation has expired.' });
      return;
    }

    // Hash password with standard cost 12
    const passwordHash = await bcrypt.hash(password, 12);

    // Require MFA for administrative/privileged roles
    const privilegedRoles = [
      'SYSTEM_ADMIN', 'PLATFORM_OWNER', 'PLATFORM_ADMIN', 'FINANCE_ADMIN', 'FINANCE_APPROVER',
      'ORG_OWNER', 'ORG_ADMIN', 'FINANCE_OFFICER', 'LOSS_PREVENTION_MANAGER', 'BRANCH_MANAGER', 'STORE_MANAGER'
    ];
    const roleRequiresMfa = privilegedRoles.includes(invite.role);

    // Create user account
    const user = await User.create({
      name: invite.name,
      phone: invite.phone,
      email: invite.email,
      passwordHash,
      role: invite.role,
      organizationId: invite.organizationId,
      storeId: invite.storeId,
      status: 'ACTIVE',
      active: true,
      mustChangePassword: false,
      mfaEnabled: false, // will enroll next if required
    });

    // Mark invite accepted
    invite.status = 'ACCEPTED';
    invite.usedAt = new Date();
    await invite.save();

    const ipStr = Array.isArray(req.ip) ? req.ip[0] : req.ip;

    await AuditLog.create({
      actorId: user._id,
      actorRole: user.role,
      actorName: user.name,
      action: 'ACCEPT_INVITE',
      entityType: 'USER',
      entityId: user._id.toString(),
      storeId: user.storeId,
      ipAddress: ipStr,
      newValue: { phone: user.phone, role: user.role },
      reason: `Account activated via invitation token`,
    });

    res.status(201).json({
      success: true,
      message: 'Account activated successfully. You may now sign in.',
      requiresMfaEnrollment: roleRequiresMfa,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
