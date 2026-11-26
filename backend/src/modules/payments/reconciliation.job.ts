import crypto from 'crypto';
import Payment, { IPayment } from './payment.model.js';
import Order, { IOrder } from '../orders/order.model.js';
import PickingTask from '../picking/picking.model.js';
import User from '../users/user.model.js';
import AuditLog from '../audits/audit.model.js';
import { signReceiptToken } from '../../shared/utils/crypto.js';
import { queryDarajaStkStatus, describeDarajaResult } from './daraja.service.js';
import { verifyFlutterwaveByReference, isFlutterwavePaymentValid } from './flutterwave.service.js';
import { ENV } from '../../config/environment.js';
import { broadcastEvent } from '../../shared/utils/eventStream.js';
import { sweepNoShowOrders } from '../orders/collectNoShow.job.js';
import { collectDeadline } from '../../shared/utils/clickCollect.js';
import { sendSms } from '../../shared/utils/sms.js';
import SerializedTag from '../baskets/serialized-tag.model.js';
import { mirrorOrder, mirrorPayment } from '../financial/financial-ledger.service.js';

/**
 * Fulfills an order once payment is confirmed valid (shared between callback & reconciliation).
 * Authoritative payment amount is strictly taken from the stored payment record `expectedAmountMinor`.
 */
export async function finalizeSuccessfulPayment(
  payment: IPayment,
  order: IOrder,
  receiptNo: string | undefined,
  source: 'WEBHOOK_CALLBACK' | 'RECONCILIATION_JOB'
) {
  // Idempotency check: do not re-process if already SUCCESS
  if (payment.status === 'SUCCESS') {
    return { success: true, message: 'Payment already processed' };
  }

  if (!['PAYMENT_PENDING', 'AWAITING_FINAL_PAYMENT'].includes(order.status)) {
    payment.status = 'HELD';
    payment.errorMessage = 'Provider confirmed a payment after this order was already paid or closed. Review for duplicate charge and refund.';
    await payment.save();
    await AuditLog.create({
      action: 'PAYMENT_DUPLICATE_HELD',
      entityType: 'PAYMENT',
      entityId: payment._id.toString(),
      storeId: order.storeId,
      reason: payment.errorMessage,
    });
    return { success: false, duplicate: true };
  }

  // Atomic claim: the callback, the status poll and the reconciliation job can all arrive at the same moment.
  // Only the one that flips the status to SUCCESS gets to fulfil the order.
  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $ne: 'SUCCESS' } },
    { $set: { status: 'SUCCESS' } }
  );
  if (!claimed) {
    return { success: true, message: 'Payment already processed' };
  }

  payment.status = 'SUCCESS';
  if (payment.method === 'MPESA') {
    if (receiptNo) payment.mpesaReceiptNumber = receiptNo;
  } else if (receiptNo) {
    payment.providerTransactionId = receiptNo;
  }
  payment.verifiedAt = new Date();
  payment.amountMinor = payment.expectedAmountMinor;
  await payment.save();

  // Create signed single-use QR Receipt Token (2 hours validity)
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const nonce = crypto.randomBytes(8).toString('hex');
  const signedQrToken = signReceiptToken({
    orderId: order._id.toString(),
    storeId: order.storeId.toString(),
    totalMinor: order.totalMinor,
    nonce,
    expiresAt,
  });

  const kind = payment.kind || 'FULL';
  const isCollect = order.orderType === 'CLICK_AND_COLLECT';
  // Shop & Collect customers never receive a scannable code: they quote their order number and confirm by SMS OTP at the counter.
  if (!isCollect) order.collectionQrToken = signedQrToken;
  order.paidMinor = (order.paidMinor || 0) + payment.expectedAmountMinor;
  order.paidAt = order.paidAt || new Date();

  const methodLabel = payment.method === 'CARD' ? 'card' : 'M-PESA';
  const noteSuffix = source === 'RECONCILIATION_JOB'
    ? 'Reconciled against the payment provider.'
    : 'Verified by the payment provider callback.';
  const paidNote = `${kind === 'DEPOSIT' ? 'Deposit' : kind === 'BALANCE' ? 'Pickup balance' : 'Paid'} KES ${payment.expectedAmountMinor / 100} via ${methodLabel}${receiptNo ? ` (${receiptNo})` : ''}. ${noteSuffix}`;

  if (isCollect && kind === 'BALANCE') {
    // The order is already packed and the customer is verified at the counter: just release it for handover.
    order.status = 'READY_FOR_PICKUP';
    order.statusHistory.push({ status: 'READY_FOR_PICKUP', changedAt: new Date(), note: `${paidNote} Fully paid; ready for handover.` });
    await order.save();
  } else if (isCollect) {
    if (kind === 'DEPOSIT') order.depositMinor = payment.expectedAmountMinor;
    if (order.pickupSlot?.date) order.collectBy = collectDeadline(order.pickupSlot.date, order.pickupSlot.timeWindow || '');
    order.status = 'PICKING';
    order.statusHistory.push({
      status: 'PICKING',
      changedAt: new Date(),
      note: `${paidNote} ${kind === 'DEPOSIT' ? `Balance KES ${(order.totalMinor - order.paidMinor) / 100} is due at pickup. ` : ''}Dispatched to picking queue.`,
    });
    await order.save();

    // Create staff picking task if not present
    const existingTask = await PickingTask.findOne({ orderId: order._id });
    if (!existingTask) {
      const defaultPicker = await User.findOne({ role: 'PICKER', storeId: order.storeId, active: { $ne: false } });
      await PickingTask.create({
        orderId: order._id,
        storeId: order.storeId,
        pickerId: defaultPicker?._id || order.customerId,
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
    if (kind !== 'TOP_UP') {
      const customer = await User.findById(order.customerId).select('phone');
      if (customer?.phone) {
        const due = order.totalMinor - order.paidMinor;
        void sendSms(
          customer.phone,
          `Order ${order.orderNumber} confirmed. ${due > 0 ? `Balance KES ${due / 100} is payable at pickup. ` : ''}Quote this order number at the collection counter; a one-time code will be sent to this phone.`
        );
      }
    }
  } else {
    // Scan & Go: Order is PAID, ready for exit verification
    order.status = 'PAID';
    order.statusHistory.push({ status: 'PAID', changedAt: new Date(), note: `${paidNote} Ready for exit clearance.` });
    await order.save();
  }

  // A tag is not considered paid on a deposit; it changes to PAID only when the order is fully settled.
  if ((order.paidMinor || 0) >= order.totalMinor) {
    const serials = order.items.map((item: any) => item.tagSerial).filter(Boolean);
    if (serials.length) {
      await SerializedTag.updateMany(
        { tagSerial: { $in: serials }, storeId: order.storeId, orderId: order._id, status: 'IN_BASKET' },
        { $set: { status: 'PAID' } },
      );
    }
  }

  await AuditLog.create({
    action: source === 'RECONCILIATION_JOB' ? 'PAYMENT_RECONCILED_SUCCESS' : 'PAYMENT_VERIFIED',
    entityType: 'PAYMENT',
    entityId: payment._id.toString(),
    storeId: order.storeId,
    newValue: {
      receiptNo,
      providerTransactionId: payment.providerTransactionId,
      amountMinor: payment.expectedAmountMinor,
      orderId: order._id,
      source,
    },
  });

  // Staff portals: store-wide event. SECURITY: never include the signed QR token here.
  broadcastEvent({
    type: 'order.paid',
    payload: {
      orderId: order._id,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      receiptNo,
      amountMinor: payment.expectedAmountMinor,
    },
    storeId: order.storeId.toString(),
  });

  // The paying customer only: their own pass.
  broadcastEvent({
    type: 'order.paid',
    payload: {
      orderId: order._id,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      receiptNo,
      amountMinor: payment.expectedAmountMinor,
      ...(isCollect ? {} : { collectionQrToken: signedQrToken }),
      paymentKind: kind,
      paidMinor: order.paidMinor,
      balanceMinor: Math.max(0, order.totalMinor - order.paidMinor),
    },
    storeId: order.storeId.toString(),
    targetUserId: order.customerId.toString(),
  });

  // PostgreSQL financial ledger mirror (no-op unless POSTGRES_URL is set).
  void mirrorPayment(payment, order);
  void mirrorOrder(order);

  return { success: true, signedQrToken, receiptNo };
}

async function failPendingPayment(
  payment: IPayment,
  order: IOrder,
  status: 'FAILED' | 'TIMED_OUT',
  message: string,
  auditAction: string
): Promise<void> {
  // Only the caller that actually moves PENDING -> final records history (guards against parallel resolvers).
  const moved = await Payment.findOneAndUpdate(
    { _id: payment._id, status: 'PENDING' },
    { $set: { status, errorMessage: message } }
  );
  if (!moved) return;

  payment.status = status;
  payment.errorMessage = message;

  const label = payment.method === 'CARD' ? 'Card' : 'M-PESA';
  await Order.updateOne(
    { _id: order._id },
    { $push: { statusHistory: { status: order.status, changedAt: new Date(), note: `${label} payment ${status === 'TIMED_OUT' ? 'timed out' : 'failed'}: ${message}` } } }
  );
  await AuditLog.create({
    action: auditAction,
    entityType: 'PAYMENT',
    entityId: payment._id.toString(),
    storeId: order.storeId,
    reason: message,
  });
  void mirrorPayment(payment, order);
}

/**
 * Ask the provider what happened to a PENDING payment and apply the answer.
 * Shared by: the customer's status poll (works even when the provider callback never reaches us),
 * the background reconciliation job, and "start a new payment" (to clear a stale attempt first).
 *
 * Returns the payment's status afterwards. Never throws for provider/network trouble: unresolved stays PENDING.
 */
export async function resolvePendingPayment(
  payment: IPayment,
  opts: { minIntervalMs?: number } = {}
): Promise<IPayment['status']> {
  if (payment.status !== 'PENDING') return payment.status;

  // Throttle provider lookups per payment (atomic, so parallel pollers do not hammer Daraja / Flutterwave).
  const minInterval = opts.minIntervalMs ?? 0;
  if (minInterval > 0) {
    const gate = await Payment.findOneAndUpdate(
      {
        _id: payment._id,
        status: 'PENDING',
        $or: [{ lastQueriedAt: { $exists: false } }, { lastQueriedAt: { $lt: new Date(Date.now() - minInterval) } }],
      },
      { $set: { lastQueriedAt: new Date() } }
    );
    if (!gate) {
      const fresh = await Payment.findById(payment._id).select('status errorMessage');
      if (fresh && fresh.status !== 'PENDING') {
        payment.status = fresh.status;
        payment.errorMessage = fresh.errorMessage;
      }
      return payment.status;
    }
  }

  const order = await Order.findById(payment.orderId);
  if (!order) return payment.status;
  const ageMs = Date.now() - payment.createdAt.getTime();

  try {
    if (payment.method === 'MPESA') {
      if (!payment.checkoutRequestId) {
        // The server died between creating the record and getting Daraja's answer: no prompt exists.
        if (ageMs > 60_000) {
          await failPendingPayment(payment, order, 'FAILED', 'The M-Pesa prompt was never sent. Please retry.', 'PAYMENT_RECONCILED_FAILED');
        }
        return payment.status;
      }

      const q = await queryDarajaStkStatus(payment.checkoutRequestId);

      if (q.isCompleted) {
        if (q.resultCode === 0) {
          // The STK query does not return the receipt number; the callback (if it ever arrives) back-fills it.
          await finalizeSuccessfulPayment(payment, order, payment.mpesaReceiptNumber, 'RECONCILIATION_JOB');
        } else {
          await failPendingPayment(
            payment,
            order,
            q.resultCode === 1037 ? 'TIMED_OUT' : 'FAILED',
            describeDarajaResult(q.resultCode, q.resultDesc),
            'PAYMENT_RECONCILED_FAILED'
          );
        }
        return payment.status;
      }

      // Not completed. Expire only when Daraja actually answered (so an outage on our side never fails a real payment early).
      const reachedDaraja = q.raw && typeof q.raw === 'object' && Object.keys(q.raw).length > 0;
      const expiry = reachedDaraja ? ENV.MPESA_PENDING_EXPIRY_MS : ENV.MPESA_PENDING_EXPIRY_MS * 3;
      if (ageMs >= expiry) {
        await failPendingPayment(
          payment,
          order,
          'TIMED_OUT',
          'No response from M-Pesa. If money was deducted it will be matched to your order automatically.',
          'PAYMENT_RECONCILED_FAILED'
        );
      }
      return payment.status;
    }

    if (payment.method === 'CARD') {
      if (!payment.providerReference) return payment.status;
      const tx = await verifyFlutterwaveByReference(payment.providerReference);

      if (tx) {
        if (isFlutterwavePaymentValid(tx, { reference: payment.providerReference, amountMinor: payment.expectedAmountMinor })) {
          payment.providerTransactionId = String(tx.id);
          await finalizeSuccessfulPayment(payment, order, String(tx.id), 'RECONCILIATION_JOB');
          return payment.status;
        }
        if (tx.status === 'successful') {
          // Provider says paid but amount/currency/reference do not match what we expect: never auto-fulfil.
          const held = await Payment.findOneAndUpdate(
            { _id: payment._id, status: 'PENDING' },
            { $set: { status: 'HELD', errorMessage: 'Card provider verification did not match expected order details.' } }
          );
          if (held) {
            payment.status = 'HELD';
            await Order.updateOne({ _id: order._id }, { $set: { status: 'HELD' } });
            await AuditLog.create({
              action: 'CARD_PAYMENT_HELD',
              entityType: 'PAYMENT',
              entityId: payment._id.toString(),
              storeId: payment.storeId,
              reason: 'Card provider verification did not match expected order details.',
            });
          }
          return payment.status;
        }
        if (tx.status === 'failed' || tx.status === 'cancelled') {
          await failPendingPayment(payment, order, 'FAILED', 'Card payment was not completed.', 'PAYMENT_RECONCILED_FAILED');
          return payment.status;
        }
      }

      if (ageMs >= ENV.CARD_PENDING_EXPIRY_MS) {
        await failPendingPayment(payment, order, 'TIMED_OUT', 'Card checkout was not completed.', 'PAYMENT_RECONCILED_FAILED');
      }
      return payment.status;
    }
  } catch (error: any) {
    console.error(`[Payment Resolve] ${payment.method} ${payment._id}:`, error.message);
  }

  return payment.status;
}

/**
 * Reconciles every PENDING M-Pesa / card payment against its provider, then expires abandoned SUBMITTED orders.
 * Looks at payments directly (not "the oldest 50 orders"), so a backlog of old unpaid orders can never starve fresh payments.
 */
export async function reconcileStuckOrders(): Promise<{
  checked: number;
  reconciled: number;
  failed: number;
  stillPending: number;
}> {
  const result = { checked: 0, reconciled: 0, failed: 0, stillPending: 0 };

  try {
    // Give the callback a head start: only payments older than 20s.
    const pendingPayments = await Payment.find({
      status: 'PENDING',
      method: { $in: ['MPESA', 'CARD'] },
      createdAt: { $lt: new Date(Date.now() - 20_000) },
    }).sort({ createdAt: 1 }).limit(100);

    result.checked = pendingPayments.length;

    for (const payment of pendingPayments) {
      const after = await resolvePendingPayment(payment, { minIntervalMs: 5_000 });
      if (after === 'SUCCESS') result.reconciled++;
      else if (after === 'FAILED' || after === 'TIMED_OUT' || after === 'HELD') result.failed++;
      else result.stillPending++;
    }

    // Expire SUBMITTED orders older than 2 hours that have no active pending payment.
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const staleOrders = await Order.find({ status: 'SUBMITTED', createdAt: { $lt: twoHoursAgo } }).limit(100);
    for (const staleOrder of staleOrders) {
      const hasActivePayment = await Payment.exists({ orderId: staleOrder._id, status: 'PENDING' });
      if (!hasActivePayment) {
        staleOrder.status = 'EXPIRED';
        staleOrder.statusHistory.push({
          status: 'EXPIRED',
          changedAt: new Date(),
          note: 'Order expired: remained in SUBMITTED status without completed payment.',
        });
        await staleOrder.save();
      }
    }
  } catch (error: any) {
    console.error('[Reconciliation Job Error]:', error.message);
  }

  return result;
}

let reconciliationTimer: NodeJS.Timeout | null = null;

export function startReconciliationWorker(intervalMs = ENV.MPESA_RECONCILIATION_INTERVAL_MS) {
  if (reconciliationTimer) {
    clearInterval(reconciliationTimer);
  }

  console.log(`[Daraja Reconciliation] Worker started (Interval: ${intervalMs / 1000}s)`);

  // Run initial check after 10 seconds
  setTimeout(() => {
    reconcileStuckOrders().catch(err =>
      console.error('[Daraja Reconciliation Error]:', err.message)
    );
  }, 10000);

  reconciliationTimer = setInterval(async () => {
    try {
      const res = await reconcileStuckOrders();
      await sweepNoShowOrders().catch((e: any) => console.error('[No-show sweep]', e.message));
      if (res.reconciled > 0 || res.failed > 0) {
        console.log(`[Daraja Reconciliation] Completed cycle: Reconciled ${res.reconciled}, Failed ${res.failed}, Pending ${res.stillPending}`);
      }
    } catch (err: any) {
      console.error('[Daraja Reconciliation Error]:', err.message);
    }
  }, intervalMs);
}

export function stopReconciliationWorker() {
  if (reconciliationTimer) {
    clearInterval(reconciliationTimer);
    reconciliationTimer = null;
    console.log('[Daraja Reconciliation] Worker stopped.');
  }
}
