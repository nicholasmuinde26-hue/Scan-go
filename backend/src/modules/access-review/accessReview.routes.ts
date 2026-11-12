import { Router, Response } from 'express';
import { authenticate, requirePermission, AuthRequest } from '../../middleware/auth.js';
import {
  getPrivilegedUsers,
  revokeAccess,
  grantTemporaryAccess,
  getAccessReviewStats,
} from './accessReview.service.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * Get all privileged users for access review
 * GET /api/v1/access-review/users
 */
router.get('/users', requirePermission('audit:read'), async (req: AuthRequest, res: Response) => {
  try {
    const { role, organizationId, storeId } = req.query;
    const users = await getPrivilegedUsers(req, {
      role: typeof role === 'string' ? role : undefined,
      organizationId: typeof organizationId === 'string' ? organizationId : undefined,
      storeId: typeof storeId === 'string' ? storeId : undefined,
    });
    res.json({ success: true, users });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Get access review statistics
 * GET /api/v1/access-review/stats
 */
router.get('/stats', requirePermission('audit:read'), async (req: AuthRequest, res: Response) => {
  try {
    const stats = await getAccessReviewStats(req);
    res.json({ success: true, stats });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Revoke user access
 * POST /api/v1/access-review/revoke/:userId
 */
router.post('/revoke/:userId', requirePermission('staff:terminate'), async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ success: false, error: 'Reason is required' });
    }

    const result = await revokeAccess(req, req.params.userId as string, reason);
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Grant temporary access
 * POST /api/v1/access-review/grant/:userId
 */
router.post('/grant/:userId', requirePermission('staff:assign'), async (req: AuthRequest, res: Response) => {
  try {
    const { expiryDays, reason } = req.body;
    if (!expiryDays || !reason) {
      return res.status(400).json({ success: false, error: 'Expiry days and reason are required' });
    }

    const result = await grantTemporaryAccess(req, req.params.userId as string, expiryDays, reason);
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

export default router;
