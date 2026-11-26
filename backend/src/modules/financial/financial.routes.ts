import { Router } from 'express';
import { Types } from 'mongoose';
import { authenticate, requireAnyPermission, AuthRequest, canAccessStore } from '../../middleware/auth.js';
import { pgEnabled } from '../../db/postgres.js';
import { ledgerReconciliation } from './financial-ledger.service.js';

const router = Router();

/**
 * Financial reconciliation: compares MongoDB (authoritative) aggregates with
 * the PostgreSQL ledger mirror for a store and window. Discrepancies here mean
 * a mirror write was missed — investigate before any cut-over.
 */
router.get('/reconciliation', authenticate, requireAnyPermission('reports:read', 'reports:export'), async (req: AuthRequest, res) => {
  try {
    if (!pgEnabled()) {
      res.status(503).json({
        success: false,
        code: 'POSTGRES_DISABLED',
        error: 'PostgreSQL ledger is not configured. Set POSTGRES_URL to enable financial mirroring.',
      });
      return;
    }
    const storeId = String(req.query.storeId || req.user?.storeId || '');
    if (!storeId || !Types.ObjectId.isValid(storeId) || !(await canAccessStore(req.user!, storeId))) {
      res.status(403).json({ success: false, error: 'Branch scope is required.' });
      return;
    }
    const days = Math.min(Math.max(parseInt(String(req.query.days || '30'), 10) || 30, 1), 365);

    const report = await ledgerReconciliation(storeId, days);
    res.json({ success: true, storeId, windowDays: days, report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
