import { Router, Response } from 'express';
import { authenticate, requirePermission, AuthRequest } from '../../middleware/auth.js';
import {
  globalSearch,
  getTimeline,
  attachNote,
  getNotes,
  resendReceipt,
  requerySTK,
  releaseHeldOrder,
  resetUserPassword,
} from './support.service.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * Global search for support console
 * GET /api/v1/support/search?q=query
 */
router.get('/search', requirePermission('support:search'), async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ success: false, error: 'Search query is required' });
    }

    const results = await globalSearch(req, q);
    res.json({ success: true, results });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Get full timeline for an entity
 * GET /api/v1/support/timeline/:type/:id
 */
router.get('/timeline/:type/:id', requirePermission('support:view:any'), async (req: AuthRequest, res: Response) => {
  try {
    const type = req.params.type as string;
    const id = req.params.id as string;
    const timeline = await getTimeline(req, type, id);
    res.json({ success: true, timeline });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Attach internal note to an entity
 * POST /api/v1/support/notes/:type/:id
 */
router.post('/notes/:type/:id', requirePermission('support:view:any'), async (req: AuthRequest, res: Response) => {
  try {
    const type = req.params.type as string;
    const id = req.params.id as string;
    const { note } = req.body;
    if (!note) {
      return res.status(400).json({ success: false, error: 'Note content is required' });
    }

    const result = await attachNote(req, type, id, note);
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Get notes for an entity
 * GET /api/v1/support/notes/:type/:id
 */
router.get('/notes/:type/:id', requirePermission('support:view:any'), async (req: AuthRequest, res: Response) => {
  try {
    const type = req.params.type as string;
    const id = req.params.id as string;
    const notes = await getNotes(req, type, id);
    res.json({ success: true, notes });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Safe action: Resend receipt
 * POST /api/v1/support/actions/resend-receipt/:orderId
 */
router.post('/actions/resend-receipt/:orderId', requirePermission('support:resend_receipt'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await resendReceipt(req, req.params.orderId as string);
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Safe action: Re-query STK push status
 * POST /api/v1/support/actions/requery-stk/:paymentId
 */
router.post('/actions/requery-stk/:paymentId', requirePermission('support:retry_payment'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await requerySTK(req, req.params.paymentId as string);
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Safe action: Release held order
 * POST /api/v1/support/actions/release-order/:orderId
 */
router.post('/actions/release-order/:orderId', requirePermission('support:retry_payment'), async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ success: false, error: 'Reason is required' });
    }

    const result = await releaseHeldOrder(req, req.params.orderId as string, reason);
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Safe action: Reset user password
 * POST /api/v1/support/actions/reset-password/:userId
 */
router.post('/actions/reset-password/:userId', requirePermission('support:reset_password'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await resetUserPassword(req, req.params.userId as string);
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

export default router;
