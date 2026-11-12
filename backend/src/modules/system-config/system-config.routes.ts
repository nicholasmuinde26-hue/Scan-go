import { Router } from 'express';
import SystemConfig from './system-config.model.js';
import { authenticate, authorize, AuthRequest } from '../../middleware/auth.js';
import AuditLog from '../audits/audit.model.js';

const router = Router();

// Helper to get or initialize default system config singleton
async function getOrCreateSystemConfig() {
  let config = await SystemConfig.findOne();
  if (!config) {
    config = await SystemConfig.create({});
  }
  return config;
}

// GET /api/v1/system-config - Super Admin only
router.get('/', authenticate, authorize('SYSTEM_ADMIN'), async (_req: AuthRequest, res) => {
  try {
    const config = await getOrCreateSystemConfig();
    res.json({ success: true, config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/v1/system-config - Update system configuration (Super Admin only)
router.patch('/', authenticate, authorize('SYSTEM_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const config = await getOrCreateSystemConfig();
    const previous = config.toObject();

    if (req.body.platformName !== undefined) config.platformName = req.body.platformName;
    if (req.body.maintenanceMode !== undefined) config.maintenanceMode = req.body.maintenanceMode;

    if (req.body.globalFraudDefaults) {
      config.globalFraudDefaults = {
        ...config.globalFraudDefaults,
        ...req.body.globalFraudDefaults,
      };
    }

    if (req.body.securityPolicies) {
      config.securityPolicies = {
        ...config.securityPolicies,
        ...req.body.securityPolicies,
      };
    }

    if (req.user?.id) {
      config.updatedBy = req.user.id as any;
    }

    await config.save();

    // Audit log
    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'UPDATE_SYSTEM_CONFIG',
      entityType: 'SYSTEM_CONFIG',
      entityId: config._id.toString(),
      previousValue: previous,
      newValue: config.toObject(),
      reason: req.body.reason || 'Super Admin system settings update',
    });

    res.json({
      success: true,
      message: 'System configurations updated successfully.',
      config,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
