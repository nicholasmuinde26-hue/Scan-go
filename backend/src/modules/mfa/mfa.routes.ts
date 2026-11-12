import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../../middleware/auth.js';
import User from '../users/user.model.js';
import {
  generateMFASecret,
  enableMFA,
  disableMFA,
  verifyMFAToken,
  reAuthenticate,
} from './mfa.service.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * Generate MFA secret
 * POST /api/v1/mfa/generate
 */
router.post('/generate', async (req: AuthRequest, res: Response) => {
  try {
    const result = await generateMFASecret(req);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Enable MFA
 * POST /api/v1/mfa/enable
 */
router.post('/enable', async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required' });
    }

    const result = await enableMFA(req, token);
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Disable MFA
 * POST /api/v1/mfa/disable
 */
router.post('/disable', async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required' });
    }

    const result = await disableMFA(req, token);
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Verify MFA token
 * POST /api/v1/mfa/verify
 */
router.post('/verify', async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required' });
    }

    const verified = await verifyMFAToken(req, token);
    res.json({ success: true, verified });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Re-authenticate with password
 * POST /api/v1/mfa/re-authenticate
 */
router.post('/re-authenticate', async (req: AuthRequest, res: Response) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, error: 'Password is required' });
    }

    const result = await reAuthenticate(req, password);
    res.json({ success: true, reAuthenticated: result });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

/**
 * Get MFA status
 * GET /api/v1/mfa/status
 */
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user!.id).select('mfaEnabled');
    res.json({
      success: true,
      mfaEnabled: user?.mfaEnabled || false,
    });
  } catch (error: any) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

export default router;
