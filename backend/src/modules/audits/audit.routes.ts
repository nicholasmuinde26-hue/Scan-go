import { Router } from 'express';
import AuditLog from './audit.model.js';
import { Discrepancy, ExitEvent } from '../exit-verification/exit.model.js';
import Store from '../stores/store.model.js';
import { authenticate, requirePermission, scopeToStore, AuthRequest, roleScope } from '../../middleware/auth.js';

const router = Router();

// Get audit logs (Admins / Store Managers / Supervisors - scoped to branch)
router.get('/', authenticate, requirePermission('audit:read'), scopeToStore, async (req: AuthRequest, res) => {
  try {
    const { entityType, action, storeId } = req.query;
    const query: any = {};
    if (entityType) query.entityType = entityType;
    if (action) query.action = action;
    if (storeId) query.storeId = storeId;
    else if (roleScope(req.user!.role) === 'ORG') {
      query.storeId = { $in: await Store.find({ organizationId: req.user!.organizationId }).distinct('_id') };
    }

    const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, count: logs.length, logs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fraud & Loss Prevention Summary (Scoped to branch for non-admin)
router.get('/fraud-summary', authenticate, requirePermission('fraud:view'), scopeToStore, async (req: AuthRequest, res) => {
  try {
    const storeFilter: any = {};
    if (roleScope(req.user!.role) === 'BRANCH') {
      storeFilter.storeId = req.user!.storeId;
    } else if (roleScope(req.user!.role) === 'ORG') {
      if (req.query.storeId) storeFilter.storeId = req.query.storeId;
      else storeFilter.storeId = { $in: await Store.find({ organizationId: req.user!.organizationId }).distinct('_id') };
    } else if (req.query.storeId) {
      storeFilter.storeId = req.query.storeId;
    }

    const totalExits = await ExitEvent.countDocuments(storeFilter);
    const greenExits = await ExitEvent.countDocuments({ ...storeFilter, riskBand: 'GREEN' });
    const amberExits = await ExitEvent.countDocuments({ ...storeFilter, riskBand: 'AMBER' });
    const amberFullExits = await ExitEvent.countDocuments({ ...storeFilter, riskBand: 'AMBER_FULL' });
    const redExits = await ExitEvent.countDocuments({ ...storeFilter, riskBand: 'RED' });

    const discrepancies = await Discrepancy.find(storeFilter).populate('customerId', 'name phone').sort({ createdAt: -1 });

    const totalExcessItemsCaught = discrepancies.reduce((sum, d) => sum + d.totalExcessItems, 0);
    const totalLossPreventedMinor = discrepancies.reduce((sum, d) => sum + d.totalExcessValueMinor, 0);

    res.json({
      success: true,
      storeScoped: storeFilter.storeId || 'ALL_BRANCHES',
      metrics: {
        totalExits,
        breakdown: {
          green: greenExits,
          amber: amberExits,
          amberFull: amberFullExits,
          red: redExits,
        },
        discrepanciesCount: discrepancies.length,
        totalExcessItemsCaught,
        totalLossPreventedMinor,
        totalLossPreventedKes: totalLossPreventedMinor / 100,
      },
      recentDiscrepancies: discrepancies.slice(0, 10),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
