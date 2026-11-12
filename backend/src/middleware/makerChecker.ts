import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { createApprovalRequest } from '../modules/approvals/approval.service.js';
import { ApprovalType } from '../modules/approvals/approval.model.js';
import User from '../modules/users/user.model.js';

/**
 * Maker-checker middleware for sensitive actions
 * Wraps an action to require approval before execution
 *
 * Usage:
 * router.post('/payouts', requireMakerChecker('PAYOUT_REQUEST', 'PAYOUT'), async (req, res) => {
 *   // This only executes after approval
 *   await executePayout(req.body);
 *   res.json({ success: true });
 * });
 */
export function requireMakerChecker(
  approvalType: ApprovalType,
  targetType: 'ORGANIZATION' | 'USER' | 'STORE' | 'PAYOUT' | 'SYSTEM' | 'EXPORT',
  options: {
    skipIfApproved?: boolean; // Skip approval check if already approved
    creatorCanApprove?: boolean; // Allow creator to approve (default: false)
  } = {}
) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // Check if there's an existing approved approval for this action
    const approvalId = req.headers['x-approval-id'] as string;

    if (approvalId) {
      // If an approval ID is provided, the action has been pre-approved
      // Attach it to the request for validation in the handler
      req.approvalId = approvalId;
      return next();
    }

    // No approval provided - create a new approval request
    // and return 202 Accepted with the approval ID
    const targetId = req.body.id || req.body.targetId || req.params.id;

    createApprovalRequest(req, {
      type: approvalType,
      targetType,
      targetId,
      requestData: req.body,
      notes: req.body.notes,
      creatorCanApprove: options.creatorCanApprove ?? false,
    })
      .then((approval) => {
        res.status(202).json({
          success: true,
          message: 'Action requires approval',
          approvalId: approval._id,
          approval,
        });
      })
      .catch((error) => {
        res.status(error.status || 500).json({
          success: false,
          error: error.message,
        });
      });
  };
}

/**
 * Separation of duties middleware
 * Ensures that the actor cannot be the same as the target (e.g., picker can't verify their own pick)
 */
export function enforceSeparationOfDuties(
  targetUserIdField: string = 'pickerId'
) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const targetUserId = req.body[targetUserIdField] || req.params[targetUserIdField];

    if (targetUserId && targetUserId === req.user!.id) {
      return res.status(403).json({
        success: false,
        error: 'Separation of duties violation: Cannot perform this action on yourself',
      });
    }

    next();
  };
}

/**
 * Self-grant prevention middleware
 * Prevents users from granting themselves elevated permissions or roles
 */
export function preventSelfGrant(roleField: string = 'role') {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const targetUserId = req.params.userId || req.body.userId;
    const newRole = req.body[roleField];

    // If granting to self, block it
    if (targetUserId === req.user!.id) {
      return res.status(403).json({
        success: false,
        error: 'Cannot grant elevated permissions to yourself',
      });
    }

    // Check if the new role is more privileged than current role
    // This is a simplified check - in production, use a role hierarchy
    const privilegedRoles = ['PLATFORM_OWNER', 'PLATFORM_ADMIN', 'FINANCE_ADMIN', 'FINANCE_APPROVER',
                             'ORG_OWNER', 'ORG_ADMIN'];
    if (privilegedRoles.includes(newRole) && !privilegedRoles.includes(req.user!.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient privileges to grant this role',
      });
    }

    next();
  };
}

/**
 * Minimum owners enforcement middleware
 * Ensures at least one owner/admin remains in an organization
 */
export async function enforceMinimumOwners(
  orgIdField: string = 'organizationId'
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const orgId = req.params[orgIdField] || req.body[orgIdField];

    if (!orgId) {
      return next();
    }

    // If removing an admin, check if they're the last one
    if (req.method === 'DELETE' || req.body.role === 'CUSTOMER') {
      const adminCount = await User.countDocuments({
        organizationId: orgId,
        role: { $in: ['ORG_OWNER', 'ORG_ADMIN'] },
      });

      if (adminCount <= 1) {
        return res.status(409).json({
          success: false,
          error: 'Cannot remove the last admin. Add another admin before removing this one.',
        });
      }
    }

    next();
  };
}

// Extend AuthRequest to include approvalId
declare module './auth' {
  interface AuthRequest {
    approvalId?: string;
  }
}
