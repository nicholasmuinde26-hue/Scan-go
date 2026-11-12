import Approval, { ApprovalType, ApprovalStatus } from './approval.model.js';
import { AuthRequest } from '../../middleware/auth.js';

export interface ApprovalRequest {
  type: ApprovalType;
  targetType: 'ORGANIZATION' | 'USER' | 'STORE' | 'PAYOUT' | 'SYSTEM' | 'EXPORT';
  targetId: string;
  requestData: Record<string, any>;
  notes?: string;
  requiresSecondFactor?: boolean;
  creatorCanApprove?: boolean;
}

/**
 * Create a new approval request (maker action)
 */
export async function createApprovalRequest(
  req: AuthRequest,
  approvalData: ApprovalRequest
) {
  const approval = await Approval.create({
    ...approvalData,
    requestedBy: req.user!.id as any,
    requestedByRole: req.user!.role,
    requestedByName: req.user!.name,
    status: ApprovalStatus.PENDING,
    requiresSecondFactor: approvalData.requiresSecondFactor ?? true,
    creatorCanApprove: approvalData.creatorCanApprove ?? false,
  });

  return approval;
}

/**
 * Approve an approval request (checker action)
 */
export async function approveApproval(
  req: AuthRequest,
  approvalId: string,
  reason?: string
) {
  const approval = await Approval.findById(approvalId);
  if (!approval) {
    throw new Error('Approval request not found');
  }

  if (approval.status !== ApprovalStatus.PENDING) {
    throw new Error(`Approval is ${approval.status.toLowerCase()}, cannot approve`);
  }

  if (new Date() > approval.expiresAt) {
    approval.status = ApprovalStatus.EXPIRED;
    await approval.save();
    throw new Error('Approval request has expired');
  }

  // Separation of duties: creator cannot approve their own request
  if (!approval.creatorCanApprove && approval.requestedBy.toString() === req.user!.id) {
    throw new Error('Cannot approve your own request (separation of duties)');
  }

  approval.status = ApprovalStatus.APPROVED;
  approval.approvedBy = req.user!.id as any;
  approval.approvedByRole = req.user!.role;
  approval.approvedByName = req.user!.name;
  approval.approvedAt = new Date();
  if (reason) {
    approval.notes = approval.notes ? `${approval.notes}\n\nApproval reason: ${reason}` : reason;
  }

  await approval.save();
  return approval;
}

/**
 * Reject an approval request
 */
export async function rejectApproval(
  req: AuthRequest,
  approvalId: string,
  rejectionReason: string
) {
  const approval = await Approval.findById(approvalId);
  if (!approval) {
    throw new Error('Approval request not found');
  }

  if (approval.status !== ApprovalStatus.PENDING) {
    throw new Error(`Approval is ${approval.status.toLowerCase()}, cannot reject`);
  }

  if (new Date() > approval.expiresAt) {
    approval.status = ApprovalStatus.EXPIRED;
    await approval.save();
    throw new Error('Approval request has expired');
  }

  approval.status = ApprovalStatus.REJECTED;
  approval.rejectedBy = req.user!.id as any;
  approval.rejectedByRole = req.user!.role;
  approval.rejectedByName = req.user!.name;
  approval.rejectedAt = new Date();
  approval.rejectionReason = rejectionReason;

  await approval.save();
  return approval;
}

/**
 * Cancel an approval request (only by creator)
 */
export async function cancelApproval(req: AuthRequest, approvalId: string) {
  const approval = await Approval.findById(approvalId);
  if (!approval) {
    throw new Error('Approval request not found');
  }

  if (approval.requestedBy.toString() !== req.user!.id) {
    throw new Error('Only the creator can cancel their own approval request');
  }

  if (approval.status !== ApprovalStatus.PENDING) {
    throw new Error(`Approval is ${approval.status.toLowerCase()}, cannot cancel`);
  }

  approval.status = ApprovalStatus.CANCELLED;
  await approval.save();
  return approval;
}

/**
 * Get pending approvals for the current user to review
 */
export async function getPendingApprovals(req: AuthRequest) {
  const userId = req.user!.id;
  const userRole = req.user!.role;

  // Filter approvals based on user's role and permissions
  // Platform roles can see platform-level approvals
  // Org roles can see org-level approvals
  // etc.

  const approvals = await Approval.find({
    status: ApprovalStatus.PENDING,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .limit(50);

  // Filter out approvals that the user cannot approve based on role
  // This is a simplified check - in production, use permission-based filtering
  const filterableApprovals = approvals.filter(approval => {
    // Creator cannot approve their own (unless explicitly allowed)
    if (!approval.creatorCanApprove && approval.requestedBy.toString() === userId) {
      return false;
    }

    // Role-based filtering would go here based on approval type
    return true;
  });

  return filterableApprovals;
}

/**
 * Get approvals created by the current user
 */
export async function getMyApprovals(req: AuthRequest) {
  const approvals = await Approval.find({
    requestedBy: req.user!.id,
  })
    .sort({ createdAt: -1 })
    .limit(100);

  return approvals;
}

/**
 * Clean up expired approvals (should be run as a scheduled job)
 */
export async function cleanupExpiredApprovals() {
  const result = await Approval.updateMany(
    {
      status: ApprovalStatus.PENDING,
      expiresAt: { $lt: new Date() },
    },
    {
      status: ApprovalStatus.EXPIRED,
    }
  );

  return result.modifiedCount;
}
