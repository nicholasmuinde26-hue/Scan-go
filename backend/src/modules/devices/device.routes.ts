import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import RetailDevice, { DeviceKind } from './device.model.js';
import DeviceEvent from './device-event.model.js';
import Store from '../stores/store.model.js';
import GuestPass from '../guest/guest-pass.model.js';
import AuditLog from '../audits/audit.model.js';
import { authenticate, requireAnyPermission, AuthRequest, canAccessStore } from '../../middleware/auth.js';
import { ingestDeviceEvent } from './device-event.service.js';

const router = Router();

// ---------------------------------------------------------------------------
// Device authentication: X-Device-Id + X-Device-Key (the secret shown once at
// registration). Devices never carry a user JWT.
// ---------------------------------------------------------------------------

export interface DeviceRequest extends AuthRequest {
  device?: any;
}

function hashDeviceKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function authenticateDevice(req: DeviceRequest, res: Response, next: NextFunction) {
  try {
    const deviceId = String(req.headers['x-device-id'] || '').trim();
    const key = String(req.headers['x-device-key'] || '').trim();
    if (!deviceId || !key) {
      res.status(401).json({ success: false, error: 'Device credentials required (X-Device-Id, X-Device-Key).' });
      return;
    }
    const device = await RetailDevice.findOne({ deviceId }).select('+credentialHash');
    if (!device) {
      res.status(401).json({ success: false, error: 'Unknown device.' });
      return;
    }
    const provided = Buffer.from(hashDeviceKey(key), 'hex');
    const stored = Buffer.from(device.credentialHash, 'hex');
    if (provided.length !== stored.length || !crypto.timingSafeEqual(provided, stored)) {
      res.status(401).json({ success: false, error: 'Invalid device credential.' });
      return;
    }
    if (device.status !== 'ACTIVE') {
      res.status(403).json({ success: false, error: `Device is ${device.status.toLowerCase()}.` });
      return;
    }
    req.device = device;
    next();
  } catch {
    res.status(500).json({ success: false, error: 'Device authentication failed.' });
  }
}

// ---------------------------------------------------------------------------
// Manager endpoints: register, list, suspend/revoke, rotate credentials.
// ---------------------------------------------------------------------------

const MANAGE_PERMS = ['stores:manage', 'fraud:config'] as const;

function publicDeviceView(d: any) {
  return {
    deviceId: d.deviceId,
    storeId: d.storeId,
    kind: d.kind,
    label: d.label,
    status: d.status,
    capabilities: d.capabilities,
    firmwareVersion: d.firmwareVersion,
    boundBasketId: d.boundBasketId,
    lastSeenAt: d.lastSeenAt,
    createdAt: d.createdAt,
  };
}

// Register a physical device. The secret is returned exactly once.
router.post('/', authenticate, requireAnyPermission(...MANAGE_PERMS), async (req: AuthRequest, res: Response) => {
  try {
    const { deviceId, storeId, kind, label, capabilities } = req.body || {};
    if (!deviceId || !storeId || !kind) {
      res.status(400).json({ success: false, error: 'deviceId, storeId and kind are required.' });
      return;
    }
    if (!(await canAccessStore(req.user!, String(storeId)))) {
      res.status(403).json({ success: false, error: 'Cannot register devices for another branch.' });
      return;
    }
    const store = await Store.findById(storeId).select('_id');
    if (!store) {
      res.status(404).json({ success: false, error: 'Store not found.' });
      return;
    }
    const secret = `sgd_${crypto.randomBytes(24).toString('hex')}`;
    const device = await RetailDevice.create({
      deviceId: String(deviceId).trim(),
      storeId,
      kind: kind as DeviceKind,
      label: label ? String(label).trim() : undefined,
      credentialHash: hashDeviceKey(secret),
      capabilities: capabilities || {},
      createdBy: req.user!.id,
    });
    await AuditLog.create({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      actorName: req.user!.name,
      action: 'DEVICE_REGISTERED',
      entityType: 'STORE',
      entityId: String(storeId),
      storeId: storeId as any,
      details: { deviceId: device.deviceId, kind: device.kind, label: device.label },
    }).catch(() => {});
    res.status(201).json({ success: true, device: publicDeviceView(device), secret });
  } catch (error: any) {
    res.status(error.code === 11000 ? 409 : 500).json({ success: false, error: error.code === 11000 ? 'A device with this ID is already registered.' : error.message });
  }
});

router.get('/', authenticate, requireAnyPermission(...MANAGE_PERMS), async (req: AuthRequest, res: Response) => {
  try {
    const storeId = String(req.query.storeId || '');
    if (!storeId || !(await canAccessStore(req.user!, storeId))) {
      res.status(403).json({ success: false, error: 'Branch scope is required.' });
      return;
    }
    const devices = await RetailDevice.find({ storeId }).sort({ createdAt: -1 }).limit(200);
    res.json({ success: true, devices: devices.map(publicDeviceView) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/:deviceId', authenticate, requireAnyPermission(...MANAGE_PERMS), async (req: AuthRequest, res: Response) => {
  try {
    const device = await RetailDevice.findOne({ deviceId: req.params.deviceId });
    if (!device || !(await canAccessStore(req.user!, String(device.storeId)))) {
      res.status(404).json({ success: false, error: 'Device not found.' });
      return;
    }
    const { status, label, firmwareVersion } = req.body || {};
    if (status && ['ACTIVE', 'SUSPENDED', 'REVOKED'].includes(status)) device.status = status;
    if (label !== undefined) device.label = String(label).trim() || undefined;
    if (firmwareVersion !== undefined) device.firmwareVersion = String(firmwareVersion).trim() || undefined;
    await device.save();
    await AuditLog.create({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      actorName: req.user!.name,
      action: 'DEVICE_UPDATED',
      entityType: 'STORE',
      entityId: device.storeId.toString(),
      storeId: device.storeId,
      details: { deviceId: device.deviceId, status: device.status, label: device.label },
    }).catch(() => {});
    res.json({ success: true, device: publicDeviceView(device) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rotate the device credential. The old key stops working immediately.
router.post('/:deviceId/rotate-key', authenticate, requireAnyPermission(...MANAGE_PERMS), async (req: AuthRequest, res: Response) => {
  try {
    const device = await RetailDevice.findOne({ deviceId: req.params.deviceId }).select('+credentialHash');
    if (!device || !(await canAccessStore(req.user!, String(device.storeId)))) {
      res.status(404).json({ success: false, error: 'Device not found.' });
      return;
    }
    const secret = `sgd_${crypto.randomBytes(24).toString('hex')}`;
    device.credentialHash = hashDeviceKey(secret);
    await device.save();
    await AuditLog.create({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      actorName: req.user!.name,
      action: 'DEVICE_KEY_ROTATED',
      entityType: 'STORE',
      entityId: device.storeId.toString(),
      storeId: device.storeId,
      details: { deviceId: device.deviceId },
    }).catch(() => {});
    res.json({ success: true, deviceId: device.deviceId, secret });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Kiosk self-service: a registered KIOSK device issues guest passes without a
// staff member present. Same GuestPass record as the staff endpoint.
router.post('/guest-passes', authenticateDevice, async (req: DeviceRequest, res: Response) => {
  const device = req.device!;
  try {
    if (device.kind !== 'KIOSK') {
      res.status(403).json({ success: false, error: 'Only kiosk devices can issue guest passes.' });
      return;
    }
    const { trustTier, label, ttlHours } = req.body || {};
    const token = `sgp_${crypto.randomBytes(24).toString('hex')}`;
    const pass = await GuestPass.create({
      passId: `GP-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      storeId: device.storeId,
      trustTier: trustTier === 1 ? 1 : 2,
      label: label ? String(label).slice(0, 80) : `Kiosk ${device.deviceId}`,
      issuedByDeviceId: device.deviceId,
      expiresAt: new Date(Date.now() + Math.min(12, Math.max(1, Number(ttlHours) || 8)) * 60 * 60 * 1000),
    });
    await AuditLog.create({
      actorId: undefined,
      actorRole: 'DEVICE',
      actorName: `device:${device.deviceId}`,
      action: 'GUEST_PASS_ISSUED',
      entityType: 'STORE',
      entityId: device.storeId.toString(),
      storeId: device.storeId,
      details: { passId: pass.passId, deviceId: device.deviceId, trustTier: pass.trustTier },
    }).catch(() => {});
    res.status(201).json({
      success: true,
      pass: { passId: pass.passId, storeId: pass.storeId, trustTier: pass.trustTier, expiresAt: pass.expiresAt },
      token,
    });
  } catch (error: any) {
    res.status(error.code === 11000 ? 409 : 500).json({ success: false, error: error.code === 11000 ? 'Pass ID collision — retry.' : error.message });
  }
});

// Recent device events for a store (dashboards / investigations).
router.get('/events', authenticate, requireAnyPermission('stores:read', 'fraud:view', 'inventory:read'), async (req: AuthRequest, res: Response) => {
  try {
    const storeId = String(req.query.storeId || '');
    if (!storeId || !(await canAccessStore(req.user!, storeId))) {
      res.status(403).json({ success: false, error: 'Branch scope is required.' });
      return;
    }
    const filter: any = { storeId };
    if (req.query.sessionId) filter.sessionId = req.query.sessionId;
    if (req.query.basketId) filter.basketId = req.query.basketId;
    if (req.query.type) filter.type = String(req.query.type);
    const events = await DeviceEvent.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.json({ success: true, events });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Device-facing event ingestion (HTTPS). MQTT messages land in the same
// ingestDeviceEvent() service — one code path for every transport.
// ---------------------------------------------------------------------------

router.post('/events', authenticateDevice, async (req: DeviceRequest, res: Response) => {
  const device = req.device!;
  try {
    const { httpStatus, body } = await ingestDeviceEvent(device, req.body || {});
    res.status(httpStatus).json(body);
  } catch (error: any) {
    if (error?.code === 11000) {
      res.status(200).json({ success: true, duplicate: true });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
