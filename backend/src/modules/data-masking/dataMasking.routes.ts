import { Router, Response } from 'express';
import { authenticate, requirePermission, AuthRequest } from '../../middleware/auth.js';
import { getRevealLogsForUser, getAllRevealLogs } from '../../shared/utils/dataMasking.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * Get reveal logs for the current user
 * GET /api/v1/data-masking/my-reveals
 */
router.get('/my-reveals', async (req: AuthRequest, res: Response) => {
  try {
    const logs = getRevealLogsForUser(req.user!.id);
    res.json({ success: true, logs });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Get all reveal logs (admin only)
 * GET /api/v1/data-masking/all-reveals
 */
router.get('/all-reveals', requirePermission('audit:read'), async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 500;
    const logs = getAllRevealLogs(limit);
    res.json({ success: true, logs });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

export default router;
