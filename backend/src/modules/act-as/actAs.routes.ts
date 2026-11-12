import { Router, Response } from 'express';
import { authenticate, requirePermission, AuthRequest } from '../../middleware/auth.js';
import {
  requestActAs,
  endActAs,
  getActiveActAs,
  getMyActAsSessions,
  getOrgActAsSessions,
} from './actAs.service.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * Request time-limited "act as" access to an organization/store
 * POST /api/v1/act-as/request
 */
router.post('/request', requirePermission('support:actas'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await requestActAs(req, req.body);
    res.status(201).json({ success: true, ...result });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * End an active act-as session
 * POST /api/v1/act-as/end
 */
router.post('/end', async (req: AuthRequest, res: Response) => {
  try {
    const { sessionId } = req.body;
    const result = await endActAs(req, sessionId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Get current active act-as session
 * GET /api/v1/act-as/active
 */
router.get('/active', async (req: AuthRequest, res: Response) => {
  try {
    const result = await getActiveActAs(req);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Get all act-as sessions for the current user
 * GET /api/v1/act-as/my-sessions
 */
router.get('/my-sessions', async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await getMyActAsSessions(req);
    res.json({ success: true, sessions });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Get act-as sessions for a specific organization
 * GET /api/v1/act-as/organization/:orgId
 */
router.get('/organization/:orgId', async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await getOrgActAsSessions(req, req.params.orgId as string);
    res.json({ success: true, sessions });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

export default router;
