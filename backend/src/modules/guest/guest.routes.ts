import { Router, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import GuestPass from './guest-pass.model.js';
import User from '../users/user.model.js';
import Store from '../stores/store.model.js';
import Basket from '../baskets/basket.model.js';
import SerializedTag from '../baskets/serialized-tag.model.js';
import StoreSession from '../presence/store-session.model.js';
import AuditLog from '../audits/audit.model.js';
import { authenticate, requireAnyPermission, AuthRequest, canAccessStore } from '../../middleware/auth.js';
import { resolvePolicy, getActiveSession, touchSession } from '../presence/presence.service.js';
import { applyProductScan, BasketOpError, recalculateBasket } from '../baskets/basket.service.js';
import { checkSubscriptionGate } from '../subscriptions/subscription.service.js';

const router = Router();

// ---------------------------------------------------------------------------
// Guest authentication: X-Guest-Token bearer pass. No user JWT involved.
// ---------------------------------------------------------------------------

export interface GuestRequest extends AuthRequest {
  guest?: { pass: any; userId: string; storeId: string };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function findPassByToken(token: string) {
  return GuestPass.findOne({ tokenHash: hashToken(token) }).select('+tokenHash');
}

async function authenticateGuest(req: GuestRequest, res: Response, next: NextFunction) {
  try {
    const token = String(req.headers['x-guest-token'] || req.body?.token || '').trim();
    if (!token || token.length > 120) {
      res.status(401).json({ success: false, code: 'GUEST_TOKEN_REQUIRED', error: 'A guest pass token is required.' });
      return;
    }
    const pass = await findPassByToken(token);
    if (!pass || !pass.guestUserId) {
      res.status(401).json({ success: false, code: 'GUEST_PASS_INVALID', error: 'This guest pass is not valid. Ask a staff member for a new one.' });
      return;
    }
    if (pass.status === 'REVOKED') {
      res.status(403).json({ success: false, code: 'GUEST_PASS_REVOKED', error: 'This guest pass has been deactivated.' });
      return;
    }
    if (pass.status !== 'ACTIVE' || pass.expiresAt <= new Date()) {
      res.status(403).json({ success: false, code: 'GUEST_PASS_EXPIRED', error: 'This guest pass has expired. Ask a staff member for a new one.' });
      return;
    }
    req.guest = { pass, userId: pass.guestUserId.toString(), storeId: pass.storeId.toString() };
    next();
  } catch {
    res.status(500).json({ success: false, error: 'Guest authentication failed.' });
  }
}

// ---------------------------------------------------------------------------
// Staff endpoints: issue, list, revoke guest passes.
// ---------------------------------------------------------------------------

const ISSUE_PERMS = ['stores:manage', 'fraud:config', 'supervisor:override'] as const;

function passView(p: any) {
  return {
    passId: p.passId,
    storeId: p.storeId,
    trustTier: p.trustTier,
    label: p.label,
    status: p.status,
    issuedByDeviceId: p.issuedByDeviceId,
    guestUserId: p.guestUserId,
    expiresAt: p.expiresAt,
    redeemedAt: p.redeemedAt,
    createdAt: p.createdAt,
  };
}

function newToken(): string {
  return `sgp_${crypto.randomBytes(24).toString('hex')}`;
}

// Staff issues a guest card/pass. Token returned exactly once.
router.post('/passes', authenticate, requireAnyPermission(...ISSUE_PERMS), async (req: AuthRequest, res: Response) => {
  try {
    const body = z
      .object({
        storeId: z.string().min(1),
        trustTier: z.union([z.literal(1), z.literal(2)]).optional(),
        label: z.string().trim().max(80).optional(),
        ttlHours: z.number().min(1).max(12).optional(),
      })
      .parse(req.body);

    if (!(await canAccessStore(req.user!, body.storeId))) {
      res.status(403).json({ success: false, error: 'Cannot issue guest passes for another branch.' });
      return;
    }
    const store = await Store.findById(body.storeId).select('_id');
    if (!store) {
      res.status(404).json({ success: false, error: 'Store not found.' });
      return;
    }

    const token = newToken();
    const pass = await GuestPass.create({
      passId: `GP-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
      tokenHash: hashToken(token),
      storeId: body.storeId,
      trustTier: body.trustTier ?? 2,
      label: body.label,
      issuedByUserId: req.user!.id,
      expiresAt: new Date(Date.now() + (body.ttlHours ?? 8) * 60 * 60 * 1000),
    });

    await AuditLog.create({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      actorName: req.user!.name,
      action: 'GUEST_PASS_ISSUED',
      entityType: 'STORE',
      entityId: body.storeId,
      storeId: body.storeId as any,
      details: { passId: pass.passId, trustTier: pass.trustTier, label: pass.label },
    }).catch(() => {});

    res.status(201).json({ success: true, pass: passView(pass), token });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid request.' });
      return;
    }
    res.status(error.code === 11000 ? 409 : 500).json({ success: false, error: error.code === 11000 ? 'Pass ID collision — retry.' : error.message });
  }
});

router.get('/passes', authenticate, requireAnyPermission(...ISSUE_PERMS), async (req: AuthRequest, res: Response) => {
  try {
    const storeId = String(req.query.storeId || '');
    if (!storeId || !(await canAccessStore(req.user!, storeId))) {
      res.status(403).json({ success: false, error: 'Branch scope is required.' });
      return;
    }
    const passes = await GuestPass.find({ storeId })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('-tokenHash');
    res.json({ success: true, passes: passes.map(passView) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/passes/:passId/revoke', authenticate, requireAnyPermission(...ISSUE_PERMS), async (req: AuthRequest, res: Response) => {
  try {
    const pass = await GuestPass.findOne({ passId: req.params.passId });
    if (!pass || !(await canAccessStore(req.user!, pass.storeId.toString()))) {
      res.status(404).json({ success: false, error: 'Guest pass not found.' });
      return;
    }
    pass.status = 'REVOKED';
    pass.revokedAt = new Date();
    await pass.save();
    // Kill the in-store session too — a revoked card stops working immediately.
    if (pass.guestUserId) {
      await StoreSession.updateMany(
        { userId: pass.guestUserId, status: 'ACTIVE' },
        { $set: { status: 'ENDED', endedAt: new Date(), endReason: 'STAFF_ENDED', endedBy: req.user!.id } }
      );
    }
    await AuditLog.create({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      actorName: req.user!.name,
      action: 'GUEST_PASS_REVOKED',
      entityType: 'STORE',
      entityId: pass.storeId.toString(),
      storeId: pass.storeId,
      details: { passId: pass.passId },
    }).catch(() => {});
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Staff view: open guest baskets in a store, so a cashier can find a guest's
// basket at the till by pass label or totals.
router.get('/baskets', authenticate, requireAnyPermission('stores:read', 'fraud:view', 'inventory:read'), async (req: AuthRequest, res: Response) => {
  try {
    const storeId = String(req.query.storeId || '');
    if (!storeId || !(await canAccessStore(req.user!, storeId))) {
      res.status(403).json({ success: false, error: 'Branch scope is required.' });
      return;
    }
    const guests = await User.find({ isGuest: true }).select('_id').lean();
    const guestIds = guests.map((g) => g._id);
    const baskets = await Basket.find({ storeId, customerId: { $in: guestIds }, status: 'OPEN' })
      .sort({ lastActivityAt: -1 })
      .limit(100)
      .lean();
    const passes = await GuestPass.find({ guestUserId: { $in: guestIds.map(String) }, storeId })
      .select('passId label guestUserId expiresAt')
      .lean();
    const passByUser = new Map(passes.map((p: any) => [String(p.guestUserId), p]));
    res.json({
      success: true,
      baskets: baskets.map((b: any) => ({
        id: b._id,
        passId: passByUser.get(String(b.customerId))?.passId,
        label: passByUser.get(String(b.customerId))?.label,
        totalMinor: b.totalMinor,
        totalItems: b.totalItems,
        storeSessionId: b.storeSessionId,
        lastActivityAt: b.lastActivityAt,
        createdAt: b.createdAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Guest-facing endpoints (X-Guest-Token).
// ---------------------------------------------------------------------------

// Redeem a pass: provisions the shadow guest user and an in-store session.
// Idempotent — calling again returns the live session.
router.post('/session', async (req, res: Response) => {
  const token = String(req.body?.token || '').trim();
  const deviceId = String(req.body?.deviceId || 'KIOSK').slice(0, 80);
  const displayName = String(req.body?.name || '').trim().slice(0, 60);

  const pass = token ? await findPassByToken(token) : null;
  if (!pass) {
    res.status(401).json({ success: false, code: 'GUEST_PASS_INVALID', error: 'This guest pass is not valid.' });
    return;
  }
  if (pass.status === 'REVOKED' || pass.expiresAt <= new Date()) {
    res.status(403).json({ success: false, code: 'GUEST_PASS_EXPIRED', error: 'This guest pass has expired. Ask a staff member for a new one.' });
    return;
  }

  try {
    const store = await Store.findById(pass.storeId);
    if (!store || !store.active) {
      res.status(403).json({ success: false, code: 'STORE_INACTIVE', error: 'This store is not open for Scan & Go right now.' });
      return;
    }
    const policy = resolvePolicy(store);

    // Provision (once) the shadow guest user. Random password hash — this
    // account can never log in; it exists so orders/payments have a customerId.
    let guestUserId = pass.guestUserId;
    if (!guestUserId) {
      const guest = await User.create({
        name: displayName || `Guest ${pass.passId.slice(-4)}`,
        phone: `guest_${pass.passId.toLowerCase()}`,
        passwordHash: crypto.randomBytes(32).toString('hex'),
        role: 'CUSTOMER',
        isGuest: true,
        storeId: store._id,
        organizationId: store.organizationId,
        status: 'ACTIVE',
      });
      guestUserId = guest._id as any;
      pass.guestUserId = guestUserId;
      pass.redeemedAt = pass.redeemedAt || new Date();
      await pass.save();
    }

    // One active session per guest user — same rule as registered customers.
    await StoreSession.updateMany(
      { userId: guestUserId, status: 'ACTIVE' },
      { $set: { status: 'ENDED', endedAt: new Date(), endReason: 'REPLACED' } }
    );
    const session = await StoreSession.create({
      userId: guestUserId,
      storeId: store._id,
      deviceId,
      trustTier: pass.trustTier,
      presenceMethod: pass.issuedByDeviceId ? 'KIOSK' : 'STAFF_ISSUED_HANDHELD',
      softSignals: { gps: false, wifi: false },
      status: 'ACTIVE',
      ttlMinutes: policy.sessionTtlMinutes,
      lastActivityAt: new Date(),
      activityCount: 0,
      expiresAt: new Date(Date.now() + policy.sessionTtlMinutes * 60 * 1000),
    });

    await AuditLog.create({
      actorId: guestUserId,
      actorRole: 'CUSTOMER',
      actorName: 'Guest',
      action: 'GUEST_SESSION_STARTED',
      entityType: 'STORE',
      entityId: store._id.toString(),
      storeId: store._id,
      details: { passId: pass.passId, sessionId: session._id, trustTier: session.trustTier, method: session.presenceMethod },
    }).catch(() => {});

    res.status(201).json({
      success: true,
      passId: pass.passId,
      session: {
        id: session._id,
        storeId: store._id,
        storeName: store.name,
        trustTier: session.trustTier,
        presenceMethod: session.presenceMethod,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      res.status(409).json({ success: false, code: 'SESSION_CONFLICT', error: 'Check-in was already in progress. Please try again.' });
      return;
    }
    res.status(500).json({ success: false, error: error?.message || 'Could not start guest session.' });
  }
});

// Guest session status (token auth).
router.get('/session', authenticateGuest, async (req: GuestRequest, res: Response) => {
  try {
    const session = await getActiveSession(req.guest!.userId, req.guest!.storeId);
    const store = await Store.findById(req.guest!.storeId).select('name presencePolicy');
    const policy = resolvePolicy(store);
    res.json({
      success: true,
      session: session
        ? { id: session._id, trustTier: session.trustTier, presenceMethod: session.presenceMethod, expiresAt: session.expiresAt }
        : null,
      enforced: policy.enforced,
      store: { _id: req.guest!.storeId, name: store?.name },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get or create the guest's open basket (mirrors POST /baskets for customers).
router.post('/baskets', authenticateGuest, async (req: GuestRequest, res: Response) => {
  try {
    const { storeId, deviceId } = req.body || {};
    if (storeId && String(storeId) !== req.guest!.storeId) {
      res.status(403).json({ success: false, error: 'Guest passes are valid for their issuing store only.' });
      return;
    }
    const store = await Store.findById(req.guest!.storeId).select('organizationId presencePolicy');
    if (!store?.organizationId) {
      res.status(409).json({ success: false, error: 'This store has not been assigned to an organization yet.' });
      return;
    }
    const gate = await checkSubscriptionGate(store.organizationId.toString(), 'scan_and_go');
    if (!gate.allowed) {
      res.status(gate.status || 402).json({ success: false, error: gate.reason, code: gate.code });
      return;
    }

    const policy = resolvePolicy(store);
    const session = policy.enforced ? await getActiveSession(req.guest!.userId, req.guest!.storeId) : null;
    if (policy.enforced && !session) {
      res.status(403).json({ success: false, code: 'PRESENCE_REQUIRED', error: 'Start your guest session first.' });
      return;
    }
    const presenceFields = session
      ? { storeSessionId: session._id, trustTier: session.trustTier, presenceMethod: session.presenceMethod }
      : {};

    let basket = await Basket.findOne({ customerId: req.guest!.userId, storeId: req.guest!.storeId, status: 'OPEN' });
    if (!basket) {
      basket = await Basket.create({
        customerId: req.guest!.userId,
        storeId: req.guest!.storeId,
        deviceId: String(deviceId || 'GUEST_CLIENT').slice(0, 80),
        status: 'OPEN',
        items: [],
        ...presenceFields,
      });
    } else if (session) {
      basket.storeSessionId = session._id;
      basket.trustTier = session.trustTier;
      basket.presenceMethod = session.presenceMethod;
      await basket.save();
    }

    res.json({ success: true, basket });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/baskets/current', authenticateGuest, async (req: GuestRequest, res: Response) => {
  try {
    const basket = await Basket.findOne({ customerId: req.guest!.userId, storeId: req.guest!.storeId, status: 'OPEN' });
    res.json({ success: true, basket });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Guest scan — same unified engine, same guards as the customer app route.
router.post('/baskets/:id/scan', authenticateGuest, async (req: GuestRequest, res: Response) => {
  try {
    const { barcode, isManualEntry, quantity = 1, tagSerial } = req.body || {};
    const basket = await Basket.findById(req.params.id);

    if (!basket || basket.customerId.toString() !== req.guest!.userId || basket.storeId.toString() !== req.guest!.storeId) {
      res.status(404).json({ success: false, error: 'Basket not found.' });
      return;
    }
    if (basket.status !== 'OPEN') {
      res.status(400).json({ success: false, error: 'Basket is locked or converted.' });
      return;
    }

    const store = await Store.findById(basket.storeId).select('organizationId presencePolicy');
    if (store?.organizationId) {
      const gate = await checkSubscriptionGate(store.organizationId.toString(), 'scan_and_go');
      if (!gate.allowed) {
        res.status(gate.status || 402).json({ success: false, error: gate.reason, code: gate.code });
        return;
      }
    }

    const policy = resolvePolicy(store);
    if (policy.enforced) {
      const live = basket.storeSessionId
        ? await StoreSession.exists({ _id: basket.storeSessionId, status: 'ACTIVE', expiresAt: { $gt: new Date() } })
        : null;
      if (!live) {
        res.status(403).json({ success: false, code: 'PRESENCE_EXPIRED', error: 'Your guest session has ended. Start a new guest session.' });
        return;
      }
      if (basket.storeSessionId) void touchSession(basket.storeSessionId);
    }

    const result = await applyProductScan(
      basket,
      { barcode, quantity, isManualEntry: !!isManualEntry, tagSerial },
      policy,
      { source: 'GUEST', reportedByName: 'Guest' }
    );

    if (result.kind === 'WEIGHED') {
      res.json({ success: true, scannedProduct: result.product, verification: result.verification, basket: result.basket });
      return;
    }
    res.json({ success: true, scannedProduct: result.product, basket: result.basket });
  } catch (error: any) {
    if (error instanceof BasketOpError) {
      res.status(error.status).json({ success: false, code: error.code, error: error.message, ...(error.data || {}) });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Guest quantity/remove — needed so a guest can fix a mis-scan without staff.
router.patch('/baskets/:id/items/:productId', authenticateGuest, async (req: GuestRequest, res: Response) => {
  try {
    const { quantity } = req.body || {};
    const basket = await Basket.findById(req.params.id);
    if (!basket || basket.customerId.toString() !== req.guest!.userId || basket.storeId.toString() !== req.guest!.storeId) {
      res.status(404).json({ success: false, error: 'Basket not found.' });
      return;
    }
    if (basket.status !== 'OPEN') {
      res.status(400).json({ success: false, error: 'Basket is locked or converted.' });
      return;
    }
    const itemIndex = basket.items.findIndex((i: any) => i.productId.toString() === req.params.productId);
    if (itemIndex === -1) {
      res.status(404).json({ success: false, error: 'Product not found in basket.' });
      return;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 0 || qty > 100) {
      res.status(400).json({ success: false, error: 'quantity must be an integer from 0 to 100.' });
      return;
    }
    const item = basket.items[itemIndex] as any;
    if ((item.labelBarcode || item.tagSerial) && qty !== 0 && qty !== 1) {
      res.status(400).json({ success: false, error: 'Weighed and serialized items can only be removed or kept as one line.' });
      return;
    }
    if (qty <= 0) {
      basket.removalCount += 1;
      basket.events.push({ eventType: 'REMOVAL', productId: item.productId, barcode: item.barcode, timestamp: new Date(), details: 'Removed by guest.' });
      basket.items.splice(itemIndex, 1);
    } else {
      if (qty < item.quantity) basket.removalCount += item.quantity - qty;
      item.quantity = qty;
      basket.events.push({ eventType: 'QUANTITY_CHANGE', productId: item.productId, barcode: item.barcode, quantity: qty, timestamp: new Date(), details: 'Quantity changed by guest.' });
    }
    recalculateBasket(basket);
    await basket.save();
    res.json({ success: true, basket });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Guest clear-basket — mirrors DELETE /baskets/:id/clear for registered users.
router.delete('/baskets/:id/clear', authenticateGuest, async (req: GuestRequest, res: Response) => {
  try {
    const basket = await Basket.findById(req.params.id);
    if (!basket || basket.customerId.toString() !== req.guest!.userId || basket.storeId.toString() !== req.guest!.storeId) {
      res.status(404).json({ success: false, error: 'Basket not found.' });
      return;
    }
    if (basket.status !== 'OPEN') {
      res.status(400).json({ success: false, error: 'Basket is locked or converted.' });
      return;
    }
    basket.items = [];
    await SerializedTag.updateMany({ basketId: basket._id, status: 'IN_BASKET' }, { $set: { status: 'IN_STORE' }, $unset: { basketId: 1 } });
    basket.removalCount += 1;
    recalculateBasket(basket);
    await basket.save();
    res.json({ success: true, basket });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export { authenticateGuest };
export default router;
