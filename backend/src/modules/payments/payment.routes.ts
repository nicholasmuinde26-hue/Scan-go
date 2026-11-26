import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Payment from './payment.model.js';
import SerializedTag from '../baskets/serialized-tag.model.js';
import Order from '../orders/order.model.js';
import Store from '../stores/store.model.js';
import PickingTask from '../picking/picking.model.js';
import User from '../users/user.model.js';
import { authenticate, canAccessStore, AuthRequest } from '../../middleware/auth.js';
import { signReceiptToken } from '../../shared/utils/crypto.js';
import AuditLog from '../audits/audit.model.js';
import { ENV } from '../../config/environment.js';
import { verifyDarajaCallback, parseDarajaCallback, initiateDarajaStkPush, normalizeKenyanMsisdn, isDarajaConfigured, describeDarajaResult, DarajaError } from './daraja.service.js';
import { finalizeSuccessfulPayment, reconcileStuckOrders, resolvePendingPayment } from './reconciliation.job.js';
import { broadcastEvent } from '../../shared/utils/eventStream.js';
import { rejectIfSubscriptionBlocked } from '../../middleware/subscriptionGate.js';
import { amountDueMinor, paymentKindFor } from '../../shared/utils/clickCollect.js';
import { createFlutterwaveCheckout, isFlutterwavePaymentValid, verifyFlutterwaveWebhookSignature, verifyFlutterwaveTransaction } from './flutterwave.service.js';
import { mirrorOrder, mirrorPayment } from '../financial/financial-ledger.service.js';

const router = Router();

async function isPaymentBlocked(storeId: any, res: any, operation: 'mpesa' | 'scan_and_go' | 'click_and_collect' = 'mpesa'): Promise<boolean> {
  const store = await Store.findById(storeId).select('organizationId');
  if (!store?.organizationId) {
    res.status(409).json({ success: false, error: 'This store has not been assigned to an organization yet.' });
    return true;
  }
  return rejectIfSubscriptionBlocked(res, store.organizationId.toString(), operation);
}

/**
 * Before starting a new payment for an order, settle any earlier PENDING attempt.
 * - Asks the provider first (the earlier attempt may actually have succeeded).
 * - A still-live M-Pesa prompt blocks a new one (returned so the caller can answer 409).
 * - An abandoned card checkout is superseded, so the customer can switch method or retry.
 */
async function settleEarlierAttempts(orderId: any) {
  const pending = await Payment.find({ orderId, status: 'PENDING' });
  for (const p of pending) {
    await resolvePendingPayment(p);
  }
  const stillPending = await Payment.find({ orderId, status: 'PENDING' });
  for (const p of stillPending) {
    if (p.method === 'CARD') {
      await Payment.updateOne({ _id: p._id, status: 'PENDING' }, { $set: { status: 'FAILED', errorMessage: 'Replaced by a new payment attempt.' } });
    } else {
      return p; // live M-Pesa prompt
    }
  }
  return null;
}

function paymentInProgressResponse(p: any) {
  const secondsLeft = Math.max(5, Math.ceil((ENV.MPESA_PENDING_EXPIRY_MS - (Date.now() - p.createdAt.getTime())) / 1000));
  return {
    code: 'PAYMENT_IN_PROGRESS',
    success: false,
    error: `An M-Pesa prompt is already active for this order. Complete it on your phone, or wait about ${secondsLeft}s to retry.`,
    paymentId: p._id,
    existingPaymentId: p._id,
    method: p.method,
    checkoutRequestId: p.checkoutRequestId,
  };
}

// Initiate M-Pesa STK Push
router.post('/mpesa/stk-push', authenticate, async (req: AuthRequest, res) => {
  try {
    const { orderId, phone } = req.body;
    const order = await Order.findById(orderId);

    if (!order) {
      res.status(404).json({ success: false, error: 'Order not found.' });
      return;
    }

    // Customers may only pay for their own orders
    if (req.user?.role === 'CUSTOMER' && order.customerId.toString() !== req.user.id) {
      res.status(403).json({ success: false, error: 'Forbidden: You can only initiate payment for your own orders.' });
      return;
    }
    if (await isPaymentBlocked(order.storeId, res, order.orderType === 'CLICK_AND_COLLECT' ? 'click_and_collect' : 'scan_and_go')) return;

    if (order.status !== 'PAYMENT_PENDING' && order.status !== 'AWAITING_FINAL_PAYMENT') {
      res.status(400).json({ success: false, error: `Order is not awaiting payment. Current status: ${order.status}` });
      return;
    }

    // Counter staff may send the pickup-balance prompt to the customer's phone, only after the pickup OTP has been verified.
    const isStaff = req.user?.role !== 'CUSTOMER';
    if (isStaff) {
      const canHandover = (req.user?.permissions || []).includes('orders:handover');
      if (!canHandover || !req.user?.storeId || req.user.storeId !== order.storeId.toString()) {
        res.status(403).json({ success: false, error: 'You can only request payment for orders of your own branch.' });
        return;
      }
      if (order.status !== 'AWAITING_FINAL_PAYMENT' || !order.handoverVerifiedAt) {
        res.status(403).json({ success: false, error: 'Staff can only request the balance payment after the customer has been verified at the counter.' });
        return;
      }
    }
    const customerForPhone = isStaff ? await User.findById(order.customerId).select('phone') : null;

    const paymentPhone = normalizeKenyanMsisdn(phone || (isStaff ? customerForPhone?.phone : req.user?.phone));
    if (!paymentPhone) {
      res.status(400).json({ success: false, code: 'INVALID_MPESA_PHONE', error: 'Enter a valid Kenyan Safaricom number, e.g. 0712 345 678.' });
      return;
    }
    const dueMinor = amountDueMinor(order);
    if (dueMinor % 100 !== 0 || dueMinor < 100) {
      res.status(400).json({ success: false, code: 'MPESA_WHOLE_SHILLINGS_ONLY', error: 'M-Pesa STK Push supports whole-shilling totals of at least KES 1. Choose card payment for this order.' });
      return;
    }
    if (!isDarajaConfigured()) {
      res.status(503).json({ success: false, code: 'MPESA_NOT_CONFIGURED', error: 'M-Pesa is not configured on the server yet.' });
      return;
    }
    // Daraja requires a public HTTPS callback (use an https tunnel such as ngrok while developing).
    if (!ENV.MPESA_CALLBACK_URL || !ENV.MPESA_CALLBACK_URL.startsWith('https://')) {
      res.status(503).json({ success: false, code: 'MPESA_CALLBACK_NOT_CONFIGURED', error: 'M-Pesa callback URL must be a public HTTPS address. Set MPESA_CALLBACK_URL.' });
      return;
    }

    // Idempotency: settle earlier attempts with the provider; only a live prompt blocks a new one.
    const live = await settleEarlierAttempts(order._id);
    if (live) {
      res.status(409).json(paymentInProgressResponse(live));
      return;
    }
    // The earlier attempt may have just succeeded while we checked.
    const refreshedOrder = await Order.findById(order._id);
    if (!refreshedOrder || !['PAYMENT_PENDING', 'AWAITING_FINAL_PAYMENT'].includes(refreshedOrder.status)) {
      res.status(409).json({ success: false, code: 'ORDER_ALREADY_PAID', error: 'This order has already been paid.' });
      return;
    }

    const amountKes = dueMinor / 100;

    // Record the attempt first so a callback can never arrive for an unknown payment
    const payment = await Payment.create({
      orderId: order._id,
      storeId: order.storeId,
      customerId: order.customerId,
      method: 'MPESA',
      kind: paymentKindFor(order),
      status: 'PENDING',
      amountMinor: dueMinor,
      expectedAmountMinor: dueMinor,
      phone: paymentPhone,
    });

    try {
      const callback = new URL(ENV.MPESA_CALLBACK_URL);
      callback.searchParams.set('secret', ENV.MPESA_CALLBACK_SECRET);

      const pushed = await initiateDarajaStkPush({
        amountKes,
        phone: paymentPhone,
        accountReference: order.orderNumber || order._id.toString(),
        transactionDesc: paymentKindFor(order) === 'DEPOSIT' ? 'Order deposit' : paymentKindFor(order) === 'BALANCE' ? 'Pickup balance' : 'Order payment',
        callbackUrl: callback.toString(),
      });

      payment.checkoutRequestId = pushed.checkoutRequestId;
      payment.merchantRequestId = pushed.merchantRequestId;
      payment.providerReference = pushed.checkoutRequestId;
      await payment.save();

      res.json({
        success: true,
        message: `M-PESA prompt sent to ${paymentPhone}`,
        checkoutRequestId: payment.checkoutRequestId,
        merchantRequestId: payment.merchantRequestId,
        amountKes,
        paymentId: payment._id,
        expiresInSeconds: Math.round(ENV.MPESA_PENDING_EXPIRY_MS / 1000),
      });
    } catch (darajaError: any) {
      const safeMessage = darajaError instanceof DarajaError ? darajaError.message : 'Could not start the M-Pesa payment. Please try again.';
      payment.status = 'FAILED';
      payment.errorMessage = safeMessage;
      await payment.save();
      // Technical detail stays in the server log, never in the customer response.
      console.error('[STK Push] failed for order', order.orderNumber, darajaError?.detail ?? darajaError?.message);
      res.status(502).json({ success: false, code: 'STK_PUSH_FAILED', error: safeMessage });
    }
  } catch (error: any) {
    console.error('[STK Push] unexpected error:', error);
    res.status(500).json({ success: false, error: 'Something went wrong starting the payment. Please try again.' });
  }
});

// Process M-PESA Callback (Strict Daraja Webhook with verification & fraud protection)
router.post(['/mpesa/callback', '/stk/callback'], async (req, res) => {
  try {
    // 1. Verify caller authenticity: Secret in URL (?secret=...) or Daraja IP allowlist
    const authCheck = verifyDarajaCallback(req);
    if (!authCheck.valid) {
      await AuditLog.create({
        action: 'PAYMENT_CALLBACK_REJECTED_UNAUTHORIZED',
        entityType: 'PAYMENT',
        reason: authCheck.reason,
      });
      res.status(403).json({ ResultCode: 1, ResultDesc: authCheck.reason });
      return;
    }

    // 2. Validate official Safaricom Daraja callback payload structure
    const parsed = parseDarajaCallback(req.body);
    if (!parsed.isValidFormat || !parsed.checkoutRequestId) {
      await AuditLog.create({
        action: 'PAYMENT_CALLBACK_INVALID_FORMAT',
        entityType: 'PAYMENT',
        reason: parsed.errorMessage || 'Invalid Daraja STK callback payload format',
      });
      res.status(400).json({ ResultCode: 1, ResultDesc: parsed.errorMessage || 'Invalid Daraja callback structure' });
      return;
    }

    // 3. Locate stored payment record by checkoutRequestId
    const payment = await Payment.findOne({ checkoutRequestId: parsed.checkoutRequestId });
    if (!payment) {
      res.status(404).json({ ResultCode: 1, ResultDesc: 'Payment attempt not found.' });
      return;
    }

    // Store raw webhook payload for audit and dispute resolution
    payment.callbackData = req.body;

    // 4. Idempotency check: If already SUCCESS, return accepted immediately
    if (payment.status === 'SUCCESS') {
      // Reconciliation may have confirmed the payment before the callback arrived: back-fill the receipt number.
      if (!payment.mpesaReceiptNumber && parsed.resultCode === 0 && parsed.mpesaReceiptNumber && parsed.amountMinor === payment.expectedAmountMinor) {
        try {
          payment.mpesaReceiptNumber = parsed.mpesaReceiptNumber;
          await payment.save();
        } catch (e: any) {
          console.warn('[M-Pesa Callback] receipt back-fill skipped:', e.message);
        }
      }
      res.json({ ResultCode: 0, ResultDesc: 'Payment already processed successfully.' });
      return;
    }

    // 5. Handle provider failure / user cancellation (ResultCode !== 0)
    if (parsed.resultCode !== 0) {
      payment.status = parsed.resultCode === 1037 ? 'TIMED_OUT' : 'FAILED';
      payment.errorMessage = describeDarajaResult(parsed.resultCode, parsed.resultDesc);
      await payment.save();

      const order = await Order.findById(payment.orderId);
      if (order) {
        order.statusHistory.push({
          status: order.status,
          changedAt: new Date(),
          note: `M-PESA transaction failed: ${payment.errorMessage}`,
        });
        await order.save();
      }

      await AuditLog.create({
        action: 'PAYMENT_FAILED_PROVIDER',
        entityType: 'PAYMENT',
        entityId: payment._id.toString(),
        storeId: payment.storeId,
        reason: payment.errorMessage,
      });

      res.json({ ResultCode: 0, ResultDesc: 'Provider failure callback acknowledged' });
      return;
    }

    const order = await Order.findById(payment.orderId);
    if (!order) {
      res.status(404).json({ ResultCode: 1, ResultDesc: 'Associated order not found for payment' });
      return;
    }

    // 6. FRAUD CHECK: Validate amount from Daraja's CallbackMetadata against stored payment record
    // NEVER trust top-level req.body amount/amountMinor! Compare Daraja reported amount with expectedAmountMinor.
    if (parsed.amountMinor === undefined || parsed.amountMinor !== payment.expectedAmountMinor || !parsed.mpesaReceiptNumber) {
      payment.status = 'HELD';
      payment.errorMessage = parsed.amountMinor === undefined || !parsed.mpesaReceiptNumber
        ? 'Daraja callback omitted the amount or receipt number; payment requires manual review.'
        : `Amount mismatch: Stored expected KES ${payment.expectedAmountMinor / 100}, Daraja reported KES ${parsed.amountMinor / 100}`;
      await payment.save();

      order.status = 'HELD';
      order.statusHistory.push({
        status: 'HELD',
        changedAt: new Date(),
        note: parsed.amountMinor === undefined
          ? 'Payment callback omitted the verified amount or receipt number; held for review.'
          : `Payment amount mismatch: Expected KES ${payment.expectedAmountMinor / 100}, Daraja received KES ${parsed.amountMinor / 100}`,
      });
      await order.save();

      await AuditLog.create({
        action: 'PAYMENT_AMOUNT_MISMATCH',
        entityType: 'PAYMENT',
        entityId: payment._id.toString(),
        storeId: order.storeId,
        previousValue: { expected: payment.expectedAmountMinor },
        newValue: { received: parsed.amountMinor },
        reason: 'Daraja reported mismatched payment amount',
      });

      res.status(400).json({ ResultCode: 1, ResultDesc: payment.errorMessage });
      return;
    }

    // 7. Authoritative order fulfillment and receipt generation
    await finalizeSuccessfulPayment(payment, order, parsed.mpesaReceiptNumber, 'WEBHOOK_CALLBACK');

    // Acknowledge Safaricom Daraja with standard response
    res.json({
      ResultCode: 0,
      ResultDesc: 'Callback processed successfully',
    });
  } catch (error: any) {
    res.status(500).json({ ResultCode: 1, ResultDesc: error.message });
  }
});

// Explicit opt-in, development-only test endpoint. Never mounted in production.
if (ENV.NODE_ENV !== 'production' && ENV.ENABLE_PAYMENT_SIMULATION) router.post('/simulate-quick-pay', authenticate, async (req: AuthRequest, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId);
    if (!order) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }

    if (req.user?.role === 'CUSTOMER' && order.customerId.toString() !== req.user.id) {
      res.status(403).json({ success: false, error: 'Unauthorized: Cannot pay for another customer\'s order.' });
      return;
    }
    if (await isPaymentBlocked(order.storeId, res)) return;

    const checkoutRequestId = `ws_CO_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const mpesaReceiptNumber = `QHK${Date.now().toString().slice(-6)}`;

    // Create payment record
    const payment = await Payment.create({
      orderId: order._id,
      storeId: order.storeId,
      customerId: order.customerId,
      method: 'MPESA',
      status: 'SUCCESS',
      amountMinor: order.totalMinor,
      expectedAmountMinor: order.totalMinor,
      phone: req.user?.phone || '254712345678',
      checkoutRequestId,
      mpesaReceiptNumber,
      verifiedAt: new Date(),
    });

    // Create signed single-use token
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const nonce = crypto.randomBytes(8).toString('hex');
    const signedQrToken = signReceiptToken({
      orderId: order._id.toString(),
      storeId: order.storeId.toString(),
      totalMinor: order.totalMinor,
      nonce,
      expiresAt,
    });

    order.collectionQrToken = signedQrToken;
    order.paidAt = new Date();
    order.paidMinor = order.totalMinor;

    if (order.orderType === 'CLICK_AND_COLLECT') {
      order.status = 'PICKING';
      order.statusHistory.push({
        status: 'PICKING',
        changedAt: new Date(),
        changedBy: req.user?.id as any,
        note: `Paid KES ${order.totalMinor / 100} via M-PESA (${mpesaReceiptNumber}). Dispatched to picking queue.`,
      });
      await order.save();

      // Create staff picking task
      const existingTask = await PickingTask.findOne({ orderId: order._id });
      if (!existingTask) {
        const picker = await User.findOne({ role: 'PICKER', storeId: order.storeId, active: { $ne: false } });
        await PickingTask.create({
          orderId: order._id,
          storeId: order.storeId,
          pickerId: picker?._id || order.customerId,
          status: 'ASSIGNED',
          items: order.items.map(item => ({
            productId: item.productId,
            barcode: item.barcode,
            name: item.productName,
            requiredQuantity: item.quantity,
            scannedQuantity: 0,
            isWeighted: item.isWeighted,
            expectedWeightGrams: item.weightGrams,
            isVerified: false,
            status: 'PENDING',
          })),
        });
      }
    } else {
      order.status = 'PAID';
      order.statusHistory.push({
        status: 'PAID',
        changedAt: new Date(),
        changedBy: req.user?.id as any,
        note: `Paid KES ${order.totalMinor / 100} via M-PESA (${mpesaReceiptNumber}). Ready for exit clearance.`,
      });
      await order.save();
    }

    const taggedSerials = order.items.map((item: any) => item.tagSerial).filter(Boolean);
    if (taggedSerials.length) {
      await SerializedTag.updateMany({ tagSerial: { $in: taggedSerials }, storeId: order.storeId, orderId: order._id, status: 'IN_BASKET' }, { $set: { status: 'PAID' } });
    }

    broadcastEvent({
      type: 'order.paid',
      payload: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        receiptNo: mpesaReceiptNumber,
        totalMinor: order.totalMinor,
      },
      storeId: order.storeId.toString(),
    });

    // The paying customer's own live update (customers never receive store-wide events).
    broadcastEvent({
      type: 'order.paid',
      payload: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        receiptNo: mpesaReceiptNumber,
        totalMinor: order.totalMinor,
      },
      storeId: order.storeId.toString(),
      targetUserId: order.customerId.toString(),
    });

    void mirrorPayment(payment, order);
    void mirrorOrder(order);

    res.json({
      success: true,
      message: 'Order paid successfully via M-PESA simulation',
      order,
      receiptToken: signedQrToken,
      mpesaReceiptNumber,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/card/checkout', authenticate, async (req: AuthRequest, res) => {
  try {
    const { orderId, email } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found.' });
    if (req.user?.role === 'CUSTOMER' && order.customerId.toString() !== req.user.id) return res.status(403).json({ success: false, error: 'You can only pay for your own orders.' });
    if (await isPaymentBlocked(order.storeId, res, order.orderType === 'CLICK_AND_COLLECT' ? 'click_and_collect' : 'scan_and_go')) return;
    if (!['PAYMENT_PENDING', 'AWAITING_FINAL_PAYMENT'].includes(order.status)) return res.status(409).json({ success: false, error: 'Order is not awaiting payment.' });
    const live = await settleEarlierAttempts(order._id);
    if (live) return res.status(409).json(paymentInProgressResponse(live));
    const fresh = await Order.findById(order._id);
    if (!fresh || !['PAYMENT_PENDING', 'AWAITING_FINAL_PAYMENT'].includes(fresh.status)) return res.status(409).json({ success: false, code: 'ORDER_ALREADY_PAID', error: 'This order has already been paid.' });
    const customer = await User.findById(order.customerId);
    const customerEmail = String(email || customer?.email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(customerEmail)) return res.status(400).json({ success: false, error: 'A valid email is required for card checkout.' });
    if (req.user?.role !== 'CUSTOMER' && !(order.status === 'AWAITING_FINAL_PAYMENT' && order.handoverVerifiedAt)) return res.status(403).json({ success: false, error: 'Card payment must be started by the customer.' });
    if (req.user?.role !== 'CUSTOMER' && (!(req.user?.permissions || []).includes('orders:handover') || !req.user?.storeId || req.user.storeId !== order.storeId.toString())) return res.status(403).json({ success: false, error: 'You can only request payment for orders of your own branch.' });
    const dueMinor = amountDueMinor(order);
    if (dueMinor < 100) return res.status(409).json({ success: false, error: 'Nothing is due on this order.' });
    const payment = await Payment.create({ orderId: order._id, storeId: order.storeId, customerId: order.customerId, method: 'CARD', kind: paymentKindFor(order), status: 'PENDING', amountMinor: dueMinor, expectedAmountMinor: dueMinor });
    const reference = `SG-${payment._id.toString()}-${crypto.randomBytes(6).toString('hex')}`;
    payment.providerReference = reference;
    await payment.save();
    try {
      const checkoutUrl = await createFlutterwaveCheckout({ reference, amountMinor: dueMinor, email: customerEmail, name: customer?.name || 'Scan & Go customer', phone: customer?.phone, redirectUrl: `${ENV.FRONTEND_URL}/payment/return`, orderNumber: order.orderNumber || order._id.toString() });
      return res.json({ success: true, paymentId: payment._id, checkoutUrl, reference });
    } catch (e: any) {
      payment.status = 'FAILED'; payment.errorMessage = e.message; await payment.save();
      return res.status(502).json({ success: false, error: 'Could not start card checkout. Please retry.' });
    }
  } catch (e: any) { return res.status(500).json({ success: false, error: e.message }); }
});

router.post('/card/webhook', async (req, res) => {
  try {
    if (!verifyFlutterwaveWebhookSignature(String(req.headers['verif-hash'] || ''))) return res.status(401).json({ success: false });
    const data = req.body?.data || {};
    const payment = await Payment.findOne({ method: 'CARD', providerReference: data.tx_ref });
    if (!payment) return res.status(200).json({ received: true });
    if (payment.status === 'SUCCESS') return res.status(200).json({ received: true });
    const order = await Order.findById(payment.orderId);
    if (!order) return res.status(200).json({ received: true });
    const transaction = data.id ? await verifyFlutterwaveTransaction(data.id) : null;
    if (!transaction || !isFlutterwavePaymentValid(transaction, { reference: payment.providerReference!, amountMinor: payment.expectedAmountMinor })) {
      if (transaction?.status === 'failed') { payment.status = 'FAILED'; payment.errorMessage = 'Card payment failed at provider.'; await payment.save(); }
      else { payment.status = 'HELD'; payment.errorMessage = 'Card provider verification did not match expected order details.'; await payment.save(); order.status = 'HELD'; await order.save(); await AuditLog.create({ action: 'CARD_PAYMENT_HELD', entityType: 'PAYMENT', entityId: payment._id.toString(), storeId: payment.storeId, reason: payment.errorMessage }); }
      return res.status(200).json({ received: true });
    }
    payment.providerTransactionId = String(transaction!.id);
    await finalizeSuccessfulPayment(payment, order, String(transaction!.id), 'WEBHOOK_CALLBACK');
    return res.status(200).json({ received: true });
  } catch { return res.status(500).json({ success: false }); }
});

router.post('/card/verify-return', authenticate, async (req: AuthRequest, res) => {
  try {
    const { txRef, transactionId, status: returnStatus } = req.body;
    const payment = await Payment.findOne({ method: 'CARD', providerReference: String(txRef || '') });
    // Visible to the shopper who made it, or to staff whose role reads orders AND whose tenant owns the payment.
    let canView = false;
    if (payment && req.user) {
      const viewerPerms = req.user.permissions || [];
      if (req.user.role === 'CUSTOMER') canView = payment.customerId.toString() === req.user.id;
      else if (viewerPerms.includes('orders:read:any')) canView = true;
      else if (viewerPerms.includes('orders:read:org') || viewerPerms.includes('orders:read:store')) canView = await canAccessStore(req.user, payment.storeId.toString());
    }
    if (!payment || !canView) return res.status(404).json({ success: false, error: 'Payment not found.' });
    if (payment.status === 'SUCCESS') return res.json({ success: true, status: payment.status, orderId: payment.orderId });

    // Cancelled (or closed) on the card page: the provider redirects back WITHOUT a transaction id.
    if (!transactionId) {
      const after = await resolvePendingPayment(payment);
      if (after === 'SUCCESS') return res.json({ success: true, status: after, orderId: payment.orderId });
      if (after === 'PENDING' && String(returnStatus || '').toLowerCase() === 'cancelled') {
        await Payment.updateOne({ _id: payment._id, status: 'PENDING' }, { $set: { status: 'FAILED', errorMessage: 'Card payment was cancelled.' } });
        return res.status(409).json({ success: false, status: 'FAILED', orderId: payment.orderId, error: 'You cancelled the card payment. Your order is still waiting; you can pay again.' });
      }
      return res.status(409).json({ success: false, status: after === 'PENDING' ? 'PENDING' : after, orderId: payment.orderId, error: 'The provider has not confirmed this payment yet.' });
    }

    const transaction = await verifyFlutterwaveTransaction(transactionId);
    if (!isFlutterwavePaymentValid(transaction, { reference: payment.providerReference!, amountMinor: payment.expectedAmountMinor })) {
      if (transaction.status === 'failed') { payment.status = 'FAILED'; payment.errorMessage = 'Card payment failed at provider.'; await payment.save(); }
      return res.status(409).json({ success: false, status: transaction.status === 'failed' ? 'FAILED' : payment.status, orderId: payment.orderId, error: transaction.status === 'failed' ? 'The card payment did not go through. You can try again.' : 'The provider has not confirmed this payment.' });
    }
    const order = await Order.findById(payment.orderId);
    if (!order) return res.status(404).json({ success: false, error: 'Order not found.' });
    payment.providerTransactionId = String(transaction.id);
    const result = await finalizeSuccessfulPayment(payment, order, String(transaction.id), 'WEBHOOK_CALLBACK');
    return res.json({ success: result.success, status: payment.status, orderId: order._id });
  } catch (e: any) { return res.status(502).json({ success: false, error: e.message }); }
});

router.get('/:paymentId/status', authenticate, async (req: AuthRequest, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId);
    if (!payment || !req.user) return res.status(404).json({ success: false, error: 'Payment not found.' });
    const user = req.user;
    const ownsPayment = user.role === 'CUSTOMER' && payment.customerId.toString() === user.id;
    const canReadAnyOrder = user.permissions.includes('orders:read:any');
    const canReadTenantOrder = (user.permissions.includes('orders:read:store') || user.permissions.includes('orders:read:org'))
      && await canAccessStore(user, payment.storeId.toString());
    if (!ownsPayment && !canReadAnyOrder && !canReadTenantOrder) return res.status(404).json({ success: false, error: 'Payment not found.' });

    // Do not rely on the provider callback alone: after a few seconds, ask the provider directly (throttled).
    // This is what makes payments complete even when the callback URL is unreachable.
    if (payment.status === 'PENDING' && Date.now() - payment.createdAt.getTime() >= 8_000) {
      await resolvePendingPayment(payment, { minIntervalMs: 4_000 });
    }

    const expiryMs = payment.method === 'CARD' ? ENV.CARD_PENDING_EXPIRY_MS : ENV.MPESA_PENDING_EXPIRY_MS;
    const timedOut = payment.status === 'TIMED_OUT' || (payment.status === 'PENDING' && Date.now() - payment.createdAt.getTime() >= expiryMs);
    return res.json({
      success: true,
      paymentId: payment._id,
      method: payment.method,
      status: payment.status,
      timedOut,
      message: payment.status === 'FAILED' || payment.status === 'TIMED_OUT' || payment.status === 'HELD' ? payment.errorMessage : undefined,
      orderId: payment.orderId,
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Trigger on-demand reconciliation of stuck orders
router.post('/mpesa/reconcile', async (req, res) => {
  try {
    // Verify either Daraja secret or staff token with proper validation
    const secretInUrl = req.query.secret as string | undefined;
    const secretBuf = Buffer.from(String(secretInUrl || ''));
    const expectedBuf = Buffer.from(ENV.MPESA_CALLBACK_SECRET || '');
    const isSecretAuthorized = secretBuf.length > 0 && secretBuf.length === expectedBuf.length && crypto.timingSafeEqual(secretBuf, expectedBuf);

    if (!isSecretAuthorized) {
      // Check if standard staff authentication is provided in header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'Unauthorized: Reconciliation requires valid authentication.' });
        return;
      }

      // Additional validation: Verify the token is actually valid
      const token = authHeader.split(' ')[1];
      try {
        const decoded: any = jwt.verify(token, ENV.JWT_SECRET);
        if (!decoded?.role || decoded.role === 'CUSTOMER') {
          res.status(403).json({ success: false, error: 'Forbidden: staff access required.' });
          return;
        }
      } catch (verifyError) {
        res.status(401).json({ success: false, error: 'Unauthorized: Invalid authentication token.' });
        return;
      }
    }

    const report = await reconcileStuckOrders();
    res.json({
      success: true,
      message: 'Reconciliation cycle completed successfully.',
      report,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
