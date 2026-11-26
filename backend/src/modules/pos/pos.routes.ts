import { Router } from 'express';
import crypto from 'crypto';
import Basket from '../baskets/basket.model.js';
import Store from '../stores/store.model.js';
import GuestPass from '../guest/guest-pass.model.js';
import User from '../users/user.model.js';
import { authenticate, requirePermission, AuthRequest, canAccessStore } from '../../middleware/auth.js';
import { resolvePolicy } from '../presence/presence.service.js';
import StoreSession from '../presence/store-session.model.js';
import { applyProductScan, BasketOpError, recalculateBasket } from '../baskets/basket.service.js';
import { checkoutBasketToOrder, CheckoutError } from '../orders/order.service.js';
import { checkSubscriptionGate } from '../subscriptions/subscription.service.js';
import { rejectIfSubscriptionBlocked } from '../../middleware/subscriptionGate.js';
import Order from '../orders/order.model.js';
import Payment from '../payments/payment.model.js';
import SerializedTag from '../baskets/serialized-tag.model.js';
import AuditLog from '../audits/audit.model.js';
import { broadcastEvent } from '../../shared/utils/eventStream.js';
import { mirrorOrder, mirrorPayment } from '../financial/financial-ledger.service.js';

const router = Router();

/**
 * Cashier POS: staff-side till for Scan & Go baskets — including guest baskets
 * that have no customer login. Every mutation goes through the same
 * applyProductScan / checkoutBasketToOrder engine as self-checkout, so prices,
 * weigh labels, serialized tags and tier limits are identical.
 */

async function loadAccessibleBasket(req: AuthRequest, basketId: string, res: any) {
  const basket = await Basket.findById(basketId);
  if (!basket || !(await canAccessStore(req.user!, basket.storeId.toString()))) {
    res.status(404).json({ success: false, error: 'Basket not found.' });
    return null;
  }
  return basket;
}

async function blockIfSubscriptionInactive(storeId: any, res: any): Promise<boolean> {
  const store = await Store.findById(storeId).select('organizationId');
  if (!store?.organizationId) {
    res.status(409).json({ success: false, error: 'This store has not been assigned to an organization yet.' });
    return true;
  }
  return rejectIfSubscriptionBlocked(res, store.organizationId.toString(), 'scan_and_go');
}

// Find a basket at the till: by basket id, guest pass id, or customer phone.
router.get('/baskets/lookup', authenticate, requirePermission('pos:operate'), async (req: AuthRequest, res) => {
  try {
    const storeId = String(req.query.storeId || '');
    const query = String(req.query.q || '').trim();
    if (!storeId || !(await canAccessStore(req.user!, storeId))) {
      res.status(403).json({ success: false, error: 'Branch scope is required.' });
      return;
    }
    if (!query) {
      res.status(400).json({ success: false, error: 'A basket id, guest pass id, or customer phone is required.' });
      return;
    }

    // 1. Direct basket id
    let basket: any = null;
    const { Types } = await import('mongoose');
    if (Types.ObjectId.isValid(query)) {
      basket = await Basket.findOne({ _id: query, storeId, status: 'OPEN' });
    }

    // 2. Guest pass id -> guest user -> open basket
    if (!basket && query.toUpperCase().startsWith('GP-')) {
      const pass = await GuestPass.findOne({ passId: query.toUpperCase(), storeId }).select('guestUserId');
      if (pass?.guestUserId) {
        basket = await Basket.findOne({ customerId: pass.guestUserId, storeId, status: 'OPEN' });
      }
    }

    // 3. Customer phone -> open basket
    if (!basket) {
      const customer = await User.findOne({ phone: query, isGuest: { $ne: true } }).select('_id');
      if (customer) {
        basket = await Basket.findOne({ customerId: customer._id, storeId, status: 'OPEN' });
      }
    }

    if (!basket) {
      res.status(404).json({ success: false, error: 'No open basket found for that reference.' });
      return;
    }

    const customer = await User.findById(basket.customerId).select('name phone isGuest').lean();
    const pass = customer?.isGuest
      ? await GuestPass.findOne({ guestUserId: basket.customerId, storeId }).select('passId label').lean()
      : null;

    res.json({
      success: true,
      basket: {
        id: basket._id,
        status: basket.status,
        totalMinor: basket.totalMinor,
        totalItems: basket.totalItems,
        expectedWeightGrams: basket.expectedWeightGrams,
        trustTier: basket.trustTier,
        storeSessionId: basket.storeSessionId,
        lastActivityAt: basket.lastActivityAt,
        items: basket.items,
        customer: customer ? { name: (customer as any).name, phone: (customer as any).phone, isGuest: !!(customer as any).isGuest } : null,
        guestPass: pass ? { passId: (pass as any).passId, label: (pass as any).label } : null,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start a walk-in till sale: provisions a guest pass + shadow user + staff-issued
// session + open basket in one step, so the cashier can scan items immediately.
// The customer never touches a phone — the till drives the whole flow.
router.post('/baskets/walkin', authenticate, requirePermission('pos:operate'), async (req: AuthRequest, res) => {
  try {
    const storeId = String(req.body?.storeId || '');
    const customerName = String(req.body?.customerName || '').trim().slice(0, 60);
    const label = String(req.body?.label || 'POS walk-in').trim().slice(0, 80);
    if (!storeId || !(await canAccessStore(req.user!, storeId))) {
      res.status(403).json({ success: false, error: 'Branch scope is required.' });
      return;
    }
    const store = await Store.findById(storeId);
    if (!store) {
      res.status(404).json({ success: false, error: 'Store not found.' });
      return;
    }
    if (await blockIfSubscriptionInactive(storeId, res)) return;

    const policy = resolvePolicy(store);
    const passId = `GP-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    // Consume the pass immediately — it exists for audit/lookup, not redemption.
    const pass = await GuestPass.create({
      passId,
      tokenHash: crypto.createHash('sha256').update(`pos_${crypto.randomBytes(24).toString('hex')}`).digest('hex'),
      storeId: store._id,
      trustTier: 2,
      label,
      issuedByUserId: req.user!.id,
      status: 'REDEEMED',
      redeemedAt: new Date(),
      expiresAt: new Date(Date.now() + policy.sessionTtlMinutes * 60 * 1000),
    });

    const guest = await User.create({
      name: customerName || `Guest ${passId.slice(-4)}`,
      phone: `guest_${passId.toLowerCase()}`,
      passwordHash: crypto.randomBytes(32).toString('hex'),
      role: 'CUSTOMER',
      isGuest: true,
      storeId: store._id,
      organizationId: store.organizationId,
      status: 'ACTIVE',
    });
    pass.guestUserId = guest._id as any;
    await pass.save();

    await StoreSession.updateMany(
      { userId: guest._id, status: 'ACTIVE' },
      { $set: { status: 'ENDED', endedAt: new Date(), endReason: 'REPLACED' } }
    );
    const session = await StoreSession.create({
      userId: guest._id,
      storeId: store._id,
      deviceId: 'CASHIER_POS',
      trustTier: 2,
      presenceMethod: 'STAFF_ISSUED_HANDHELD',
      softSignals: { gps: false, wifi: false },
      status: 'ACTIVE',
      ttlMinutes: policy.sessionTtlMinutes,
      lastActivityAt: new Date(),
      activityCount: 0,
      expiresAt: new Date(Date.now() + policy.sessionTtlMinutes * 60 * 1000),
    });

    const basket = await Basket.create({
      customerId: guest._id,
      storeId: store._id,
      deviceId: 'CASHIER_POS',
      status: 'OPEN',
      items: [],
      storeSessionId: session._id,
      trustTier: 2,
      presenceMethod: 'STAFF_ISSUED_HANDHELD',
    });

    await AuditLog.create({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      actorName: req.user!.name,
      action: 'POS_WALKIN_BASKET_CREATED',
      entityType: 'BASKET',
      entityId: basket._id.toString(),
      storeId: store._id,
      details: { passId, sessionId: session._id, customerName: guest.name },
    }).catch(() => {});

    res.status(201).json({
      success: true,
      basket: {
        id: basket._id,
        status: basket.status,
        totalMinor: basket.totalMinor,
        totalItems: basket.totalItems,
        items: basket.items,
        trustTier: basket.trustTier,
      },
      customer: { name: guest.name, isGuest: true },
      guestPass: { passId },
    });
  } catch (error: any) {
    res.status(error.code === 11000 ? 409 : 500).json({ success: false, error: error.code === 11000 ? 'Pass ID collision — retry.' : error.message });
  }
});

// Cashier scans an item into a customer's/guest's basket.
router.post('/baskets/:id/scan', authenticate, requirePermission('pos:operate'), async (req: AuthRequest, res) => {
  try {
    const { barcode, isManualEntry, quantity = 1, tagSerial } = req.body || {};
    const basket = await loadAccessibleBasket(req, String(req.params.id), res);
    if (!basket) return;
    if (await blockIfSubscriptionInactive(basket.storeId, res)) return;
    if (basket.status !== 'OPEN') {
      res.status(400).json({ success: false, error: 'Basket is locked or converted.' });
      return;
    }

    const store = await Store.findById(basket.storeId).select('presencePolicy');
    const result = await applyProductScan(
      basket,
      { barcode, quantity, isManualEntry: !!isManualEntry, tagSerial },
      resolvePolicy(store),
      { source: 'CASHIER_POS', reportedBy: req.user!.id, reportedByName: req.user!.name }
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

// Cashier adjusts quantity or removes a line (e.g. customer changed mind at the till).
router.patch('/baskets/:id/items/:productId', authenticate, requirePermission('pos:operate'), async (req: AuthRequest, res) => {
  try {
    const { quantity } = req.body || {};
    const basket = await loadAccessibleBasket(req, String(req.params.id), res);
    if (!basket) return;
    if (await blockIfSubscriptionInactive(basket.storeId, res)) return;
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
      basket.events.push({ eventType: 'REMOVAL', productId: item.productId, barcode: item.barcode, timestamp: new Date(), details: `Removed by cashier ${req.user!.name || req.user!.id}.` });
      basket.items.splice(itemIndex, 1);
    } else {
      if (qty < item.quantity) basket.removalCount += item.quantity - qty;
      item.quantity = qty;
      basket.events.push({ eventType: 'QUANTITY_CHANGE', productId: item.productId, barcode: item.barcode, quantity: qty, timestamp: new Date(), details: `Quantity changed by cashier ${req.user!.name || req.user!.id}.` });
    }
    recalculateBasket(basket);
    await basket.save();
    res.json({ success: true, basket });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cashier checks out a basket into an order (payment follows via existing payment routes).
router.post('/baskets/:id/checkout', authenticate, requirePermission('pos:operate'), async (req: AuthRequest, res) => {
  try {
    const basket = await loadAccessibleBasket(req, String(req.params.id), res);
    if (!basket) return;
    if (await blockIfSubscriptionInactive(basket.storeId, res)) return;

    const order = await checkoutBasketToOrder(
      basket,
      { id: req.user!.id, role: req.user!.role, name: req.user!.name },
      `Cashier ${req.user!.name || req.user!.id} checked out basket at POS.`
    );
    res.status(201).json({ success: true, order });
  } catch (error: any) {
    if (error instanceof CheckoutError) {
      res.status(error.status).json({ success: false, code: error.code, error: error.message, ...(error.data || {}) });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Record a cash/card payment taken at the till. Scan & Go orders only —
// click-and-collect keeps its deposit/balance flow.
router.post('/orders/:id/cash-payment', authenticate, requirePermission('pos:operate'), async (req: AuthRequest, res) => {
  try {
    const order = await Order.findById(String(req.params.id));
    if (!order || !(await canAccessStore(req.user!, order.storeId.toString()))) {
      res.status(404).json({ success: false, error: 'Order not found.' });
      return;
    }
    if (order.orderType !== 'SCAN_AND_GO') {
      res.status(400).json({ success: false, error: 'Cashier POS payments apply to Scan & Go orders only.' });
      return;
    }
    if (order.status !== 'PAYMENT_PENDING') {
      res.status(409).json({ success: false, code: 'ORDER_NOT_PAYABLE', error: `Order is not awaiting payment (status: ${order.status}).` });
      return;
    }
    if (await blockIfSubscriptionInactive(order.storeId, res)) return;

    const method = req.body?.method === 'CARD' ? 'CARD' : 'CASH';
    const amountMinor = order.totalMinor;

    const payment = await Payment.create({
      orderId: order._id,
      storeId: order.storeId,
      customerId: order.customerId,
      method,
      kind: 'FULL',
      status: 'SUCCESS',
      amountMinor,
      expectedAmountMinor: amountMinor,
      verifiedAt: new Date(),
      callbackData: { recordedBy: req.user!.id, recordedByName: req.user!.name, channel: 'CASHIER_POS' },
    });

    order.status = 'PAID';
    order.statusHistory.push({
      status: 'PAID',
      changedAt: new Date(),
      changedBy: req.user!.id as any,
      note: `Paid KES ${amountMinor / 100} via ${method} at cashier POS by ${req.user!.name || req.user!.id}. Ready for exit clearance.`,
    });
    await order.save();

    const taggedSerials = order.items.map((item: any) => item.tagSerial).filter(Boolean);
    if (taggedSerials.length) {
      await SerializedTag.updateMany({ tagSerial: { $in: taggedSerials }, storeId: order.storeId, orderId: order._id, status: 'IN_BASKET' }, { $set: { status: 'PAID' } });
    }

    await AuditLog.create({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      actorName: req.user!.name,
      action: 'POS_CASH_PAYMENT',
      entityType: 'PAYMENT',
      entityId: payment._id.toString(),
      storeId: order.storeId,
      details: { orderId: order._id, orderNumber: order.orderNumber, method, amountMinor },
    }).catch(() => {});

    broadcastEvent({
      type: 'order.paid',
      payload: { orderId: order._id, orderNumber: order.orderNumber, orderType: order.orderType, totalMinor: order.totalMinor, method },
      storeId: order.storeId.toString(),
    });
    broadcastEvent({
      type: 'order.paid',
      payload: { orderId: order._id, orderNumber: order.orderNumber, orderType: order.orderType, totalMinor: order.totalMinor, method },
      storeId: order.storeId.toString(),
      targetUserId: order.customerId.toString(),
    });

    void mirrorPayment(payment, order);
    void mirrorOrder(order);

    res.json({ success: true, payment, order });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
