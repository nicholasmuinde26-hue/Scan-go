import { Router } from 'express';
import { z } from 'zod';
import Store from '../stores/store.model.js';
import EntryPoint from './entry-point.model.js';
import StoreSession from './store-session.model.js';
import AuditLog from '../audits/audit.model.js';
import { authenticate, requirePermission, requireRoleScope, canAccessStore, AuthRequest } from '../../middleware/auth.js';
import { requireStoreAccess } from '../../middleware/access.js';
import { ENV } from '../../config/environment.js';
import {
  PresenceError,
  resolvePolicy,
  tierPolicy,
  resolvePosterCode,
  startSession,
  getActiveSession,
  endSession,
  ensureEntrySecret,
  rotateEntrySecret,
  signPosterCode,
  parseGps,
  normaliseIp,
} from './presence.service.js';

const router = Router();

function sendError(res: any, error: any) {
  if (error instanceof PresenceError) {
    res.status(error.status).json({ success: false, code: error.code, error: error.message });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ success: false, code: 'VALIDATION', error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    return;
  }
  res.status(500).json({ success: false, error: error?.message || 'Unexpected error.' });
}

function sessionView(session: any, store: any) {
  const policy = resolvePolicy(store);
  const rules = tierPolicy(policy, session.trustTier);
  return {
    id: session._id,
    storeId: session.storeId,
    trustTier: session.trustTier,
    presenceMethod: session.presenceMethod,
    expiresAt: session.expiresAt,
    limits: { maxItems: rules.maxItems, maxBasketMinor: rules.maxBasketMinor },
  };
}

// ---------------------------------------------------------------------------
// Shopper endpoints
// ---------------------------------------------------------------------------

// Public: tells the check-in page which store a scanned poster belongs to, so it can show the store name before login.
// Reveals only the store's public name and the poster's label; the signature must still verify.
router.get('/entry-info', async (req, res) => {
  try {
    const { entryPoint, store } = await resolvePosterCode(req.query.p);
    res.json({
      success: true,
      store: { _id: store._id, name: store.name, location: store.location },
      entryPoint: { label: entryPoint.label },
    });
  } catch (error) {
    sendError(res, error);
  }
});

// Start (or restart) an in-store session by scanning a poster.
router.post('/enter', authenticate, requireRoleScope('CUSTOMER'), async (req: AuthRequest, res) => {
  try {
    const body = z
      .object({
        code: z.string().min(10).max(80),
        deviceId: z.string().max(80).optional(),
        gps: z.any().optional(),
      })
      .parse(req.body);

    const { session, store, entryPoint } = await startSession({
      userId: req.user!.id,
      code: body.code,
      deviceId: body.deviceId,
      gps: parseGps(body.gps),
      requestIp: req.ip,
    });

    await AuditLog.create({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      actorName: req.user!.name,
      action: 'STORE_SESSION_STARTED',
      entityType: 'STORE',
      entityId: store._id.toString(),
      storeId: store._id,
      // No coordinates are logged: only which method passed.
      details: { sessionId: session._id, tier: session.trustTier, method: session.presenceMethod, softSignals: session.softSignals, entryPoint: entryPoint.label },
      ipAddress: normaliseIp(req.ip),
    }).catch(() => {});

    res.status(201).json({
      success: true,
      session: sessionView(session, store),
      store: { _id: store._id, name: store.name },
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      res.status(409).json({ success: false, code: 'SESSION_CONFLICT', error: 'Check-in was already in progress. Please try again.' });
      return;
    }
    sendError(res, error);
  }
});

// The shopper's current session for a store (used by the app to decide whether to ask them to scan a poster).
router.get('/session', authenticate, requireRoleScope('CUSTOMER'), async (req: AuthRequest, res) => {
  try {
    const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
    const session = await getActiveSession(req.user!.id, storeId);
    const store = await Store.findById(session ? session.storeId : storeId).select('name presencePolicy');
    // `enforced` tells the app whether this store requires check-in before Scan & Go.
    const enforced = resolvePolicy(store).enforced;
    if (!session) {
      res.json({ success: true, session: null, enforced });
      return;
    }
    res.json({ success: true, enforced, session: sessionView(session, store), store: { _id: session.storeId, name: store?.name } });
  } catch (error) {
    sendError(res, error);
  }
});

// ---------------------------------------------------------------------------
// Manager endpoints (store configuration, posters, sessions)
// ---------------------------------------------------------------------------

const tierSchema = z
  .object({
    enabled: z.boolean(),
    requireSoftSignal: z.boolean(),
    maxBasketMinor: z.number().int().min(0).max(100_000_000),
    maxItems: z.number().int().min(0).max(500),
    auditPercentage: z.number().min(0).max(100),
  })
  .partial();

const configSchema = z.object({
  geo: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable().optional(),
  geoRadiusMetres: z.number().min(20).max(2000).optional(),
  allowedPublicIps: z.array(z.string().trim().min(3).max(64)).max(20).optional(),
  presencePolicy: z
    .object({
      enforced: z.boolean().optional(),
      sessionTtlMinutes: z.number().int().min(120).max(240).optional(),
      maxGpsAccuracyMetres: z.number().min(10).max(500).optional(),
      tier1: tierSchema.optional(),
      tier2: tierSchema.optional(),
    })
    .optional(),
});

async function configView(storeId: string) {
  const store = await Store.findById(storeId).select('+allowedPublicIps name geo geoRadiusMetres presencePolicy');
  if (!store) throw new PresenceError('STORE_NOT_FOUND', 'Store not found.', 404);
  return {
    storeId: store._id,
    name: store.name,
    geo: store.geo?.coordinates ? { lat: store.geo.coordinates[1], lng: store.geo.coordinates[0] } : null,
    geoRadiusMetres: store.geoRadiusMetres ?? 150,
    allowedPublicIps: store.allowedPublicIps || [],
    presencePolicy: resolvePolicy(store),
  };
}

router.get('/stores/:storeId/config', authenticate, requirePermission('fraud:config'), requireStoreAccess('params', 'storeId'), async (req: AuthRequest, res) => {
  try {
    res.json({ success: true, config: await configView(String(req.params.storeId)) });
  } catch (error) {
    sendError(res, error);
  }
});

router.put('/stores/:storeId/config', authenticate, requirePermission('fraud:config'), requireStoreAccess('params', 'storeId'), async (req: AuthRequest, res) => {
  try {
    const body = configSchema.parse(req.body);
    const before = await configView(String(req.params.storeId));
    const set: Record<string, any> = {};
    const unset: Record<string, 1> = {};

    if (body.geo === null) unset.geo = 1;
    else if (body.geo) set.geo = { type: 'Point', coordinates: [body.geo.lng, body.geo.lat] };
    if (body.geoRadiusMetres !== undefined) set.geoRadiusMetres = body.geoRadiusMetres;
    if (body.allowedPublicIps) set.allowedPublicIps = [...new Set(body.allowedPublicIps.map(normaliseIp).filter(Boolean))];

    const pp = body.presencePolicy;
    if (pp) {
      if (pp.enforced !== undefined) set['presencePolicy.enforced'] = pp.enforced;
      if (pp.sessionTtlMinutes !== undefined) set['presencePolicy.sessionTtlMinutes'] = pp.sessionTtlMinutes;
      if (pp.maxGpsAccuracyMetres !== undefined) set['presencePolicy.maxGpsAccuracyMetres'] = pp.maxGpsAccuracyMetres;
      for (const tier of ['tier1', 'tier2'] as const) {
        for (const [key, value] of Object.entries(pp[tier] || {})) {
          if (value !== undefined) set[`presencePolicy.${tier}.${key}`] = value;
        }
      }
    }

    const update: Record<string, any> = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;
    if (Object.keys(update).length) await Store.updateOne({ _id: req.params.storeId }, update);

    const after = await configView(String(req.params.storeId));
    await AuditLog.create({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      actorName: req.user!.name,
      action: 'PRESENCE_CONFIG_UPDATED',
      entityType: 'STORE',
      entityId: req.params.storeId,
      storeId: req.params.storeId as any,
      previousValue: before,
      newValue: after,
      ipAddress: normaliseIp(req.ip),
    }).catch(() => {});

    res.json({ success: true, config: after });
  } catch (error) {
    sendError(res, error);
  }
});

async function posterView(entryPoint: any, secret: string) {
  const code = signPosterCode(entryPoint._id.toString(), secret);
  return {
    _id: entryPoint._id,
    label: entryPoint.label,
    tier: entryPoint.tier,
    active: entryPoint.active,
    createdAt: entryPoint.createdAt,
    code,
    // Print this link as the QR code on the poster.
    url: `${ENV.FRONTEND_URL.replace(/\/$/, '')}/enter?p=${encodeURIComponent(code)}`,
  };
}

router.get('/stores/:storeId/entry-points', authenticate, requirePermission('fraud:config'), requireStoreAccess('params', 'storeId'), async (req: AuthRequest, res) => {
  try {
    const secret = await ensureEntrySecret(String(req.params.storeId));
    const points = await EntryPoint.find({ storeId: req.params.storeId }).sort({ createdAt: 1 });
    res.json({ success: true, entryPoints: await Promise.all(points.map((p) => posterView(p, secret))) });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/stores/:storeId/entry-points', authenticate, requirePermission('fraud:config'), requireStoreAccess('params', 'storeId'), async (req: AuthRequest, res) => {
  try {
    const body = z.object({ label: z.string().trim().min(1).max(80), tier: z.union([z.literal(1), z.literal(2)]) }).parse(req.body);
    const secret = await ensureEntrySecret(String(req.params.storeId));
    const point = await EntryPoint.create({ storeId: req.params.storeId, label: body.label, tier: body.tier, createdBy: req.user!.id });
    await AuditLog.create({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      actorName: req.user!.name,
      action: 'ENTRY_POINT_CREATED',
      entityType: 'STORE',
      entityId: req.params.storeId,
      storeId: req.params.storeId as any,
      details: { entryPointId: point._id, label: point.label, tier: point.tier },
    }).catch(() => {});
    res.status(201).json({ success: true, entryPoint: await posterView(point, secret) });
  } catch (error) {
    sendError(res, error);
  }
});

// Switch a poster off (for example if it is photographed and shared) or back on, or rename it.
router.patch('/stores/:storeId/entry-points/:id', authenticate, requirePermission('fraud:config'), requireStoreAccess('params', 'storeId'), async (req: AuthRequest, res) => {
  try {
    const body = z.object({ active: z.boolean().optional(), label: z.string().trim().min(1).max(80).optional() }).parse(req.body);
    const point = await EntryPoint.findOne({ _id: req.params.id, storeId: req.params.storeId });
    if (!point) {
      res.status(404).json({ success: false, error: 'Entry point not found.' });
      return;
    }
    if (body.label !== undefined) point.label = body.label;
    if (body.active !== undefined) {
      point.active = body.active;
      point.revokedAt = body.active ? undefined : new Date();
    }
    await point.save();
    await AuditLog.create({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      actorName: req.user!.name,
      action: body.active === false ? 'ENTRY_POINT_REVOKED' : 'ENTRY_POINT_UPDATED',
      entityType: 'STORE',
      entityId: req.params.storeId,
      storeId: req.params.storeId as any,
      details: { entryPointId: point._id, label: point.label, active: point.active },
    }).catch(() => {});
    const secret = await ensureEntrySecret(String(req.params.storeId));
    res.json({ success: true, entryPoint: await posterView(point, secret) });
  } catch (error) {
    sendError(res, error);
  }
});

// Invalidate every printed poster for this store at once. New codes appear in the entry-points list for reprinting.
router.post('/stores/:storeId/rotate-secret', authenticate, requirePermission('fraud:config'), requireStoreAccess('params', 'storeId'), async (req: AuthRequest, res) => {
  try {
    await rotateEntrySecret(String(req.params.storeId));
    await AuditLog.create({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      actorName: req.user!.name,
      action: 'ENTRY_SECRET_ROTATED',
      entityType: 'STORE',
      entityId: req.params.storeId,
      storeId: req.params.storeId as any,
    }).catch(() => {});
    res.json({ success: true, message: 'All previously printed posters for this store no longer work. Print the new codes.' });
  } catch (error) {
    sendError(res, error);
  }
});

router.get('/stores/:storeId/sessions', authenticate, requirePermission('fraud:view'), requireStoreAccess('params', 'storeId'), async (req: AuthRequest, res) => {
  try {
    const sessions = await StoreSession.find({ storeId: req.params.storeId, status: 'ACTIVE', expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('userId', 'name');
    res.json({
      success: true,
      sessions: sessions.map((s: any) => ({
        id: s._id,
        customerName: s.userId?.name,
        trustTier: s.trustTier,
        presenceMethod: s.presenceMethod,
        softSignals: s.softSignals,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      })),
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.post('/sessions/:id/end', authenticate, requirePermission('supervisor:override'), async (req: AuthRequest, res) => {
  try {
    const session = await StoreSession.findById(req.params.id);
    if (!session || !(await canAccessStore(req.user!, session.storeId.toString()))) {
      res.status(404).json({ success: false, error: 'Session not found.' });
      return;
    }
    await endSession(session._id, 'STAFF_ENDED', req.user!.id);
    await AuditLog.create({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      actorName: req.user!.name,
      action: 'STORE_SESSION_ENDED_BY_STAFF',
      entityType: 'STORE',
      entityId: session.storeId.toString(),
      storeId: session.storeId,
      details: { sessionId: session._id },
    }).catch(() => {});
    res.json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
