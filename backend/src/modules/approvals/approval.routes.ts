import { Router, Response } from 'express';
import { authenticate, requirePermission, AuthRequest } from '../../middleware/auth.js';
import Approval from './approval.model.js';
import {
  createApprovalRequest,
  approveApproval,
  rejectApproval,
  cancelApproval,
  getPendingApprovals,
  getMyApprovals,
  cleanupExpiredApprovals,
} from './approval.service.js';
import { ApprovalType } from './approval.model.js';
import { enforceSeparationOfDuties } from '../../middleware/makerChecker.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * Create a new approval request (maker action)
 */
router.post('/', requirePermission('payouts:request', 'platform:orgs:suspend', 'platform:admins:create'), async (req: AuthRequest, res: Response) => {
  try {
    const approval = await createApprovalRequest(req, req.body);
    res.status(201).json({ success: true, approval });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Get pending approvals that the current user can review
 */
router.get('/pending', requirePermission('payouts:approve', 'platform:admins:approve'), async (req: AuthRequest, res: Response) => {
  try {
    const approvals = await getPendingApprovals(req);
    res.json({ success: true, approvals });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Get approvals created by the current user
 */
router.get('/my', async (req: AuthRequest, res: Response) => {
  try {
    const approvals = await getMyApprovals(req);
    res.json({ success: true, approvals });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Approve an approval request (checker action)
 */
router.post('/:id/approve', requirePermission('payouts:approve', 'platform:admins:approve'), async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body;
    const approval = await approveApproval(req, req.params.id as string, reason);
    res.json({ success: true, approval });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Reject an approval request
 */
router.post('/:id/reject', requirePermission('payouts:approve', 'platform:admins:approve'), async (req: AuthRequest, res: Response) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason) {
      return res.status(400).json({ success: false, error: 'Rejection reason is required' });
    }
    const approval = await rejectApproval(req, req.params.id as string, rejectionReason);
    res.json({ success: true, approval });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Cancel an approval request (only by creator)
 */
router.post('/:id/cancel', async (req: AuthRequest, res: Response) => {
  try {
    const approval = await cancelApproval(req, req.params.id as string);
    res.json({ success: true, approval });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Get a specific approval by ID
 */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const approval = await Approval.findById(req.params.id as string);
    if (!approval) {
      return res.status(404).json({ success: false, error: 'Approval not found' });
    }

    // Check if user has permission to view this approval
    const isCreator = approval.requestedBy.toString() === req.user!.id;
    const hasApprovePermission = req.user!.permissions.includes('payouts:approve') ||
                                  req.user!.permissions.includes('platform:admins:approve');

    if (!isCreator && !hasApprovePermission) {
      return res.status(403).json({ success: false, error: 'Access forbidden' });
    }

    res.json({ success: true, approval });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

export default router;
