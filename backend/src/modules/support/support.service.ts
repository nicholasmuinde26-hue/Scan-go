import User from '../users/user.model.js';
import Order from '../orders/order.model.js';
import Basket from '../baskets/basket.model.js';
import Payment from '../payments/payment.model.js';
import AuditLog from '../audits/audit.model.js';
import { AuthRequest, roleScope, canonicalRole, canAccessStore } from '../../middleware/auth.js';

export interface SearchResult {
  type: 'USER' | 'ORDER' | 'PAYMENT' | 'BASKET';
  id: string;
  data: any;
}

/**
 * Global search for support console
 * Search by phone number, order number, M-Pesa receipt
 */
export async function globalSearch(req: AuthRequest, query: string) {
  const results: SearchResult[] = [];

  // Search by phone number
  const users = await User.find({
    phone: { $regex: query, $options: 'i' },
  }).select('-passwordHash -mfaSecret -mfaBackupCodes').limit(20);

  users.forEach((user) => {
    results.push({
      type: 'USER',
      id: user._id.toString(),
      data: user,
    });
  });

  // Search by order number
  const orders = await Order.find({
    $or: [
      { orderNumber: { $regex: query, $options: 'i' } },
      { customerPhone: { $regex: query, $options: 'i' } },
    ],
  }).limit(20);

  orders.forEach((order) => {
    results.push({
      type: 'ORDER',
      id: order._id.toString(),
      data: order,
    });
  });

  // Search by M-Pesa receipt/transaction ID
  const payments = await Payment.find({
    $or: [
      { transactionId: { $regex: query, $options: 'i' } },
      { mpesaReceipt: { $regex: query, $options: 'i' } },
      { merchantRequestId: { $regex: query, $options: 'i' } },
    ],
  }).limit(20);

  payments.forEach((payment) => {
    results.push({
      type: 'PAYMENT',
      id: payment._id.toString(),
      data: payment,
    });
  });

  // Search by basket ID
  const baskets = await Basket.find({
    $or: [
      { _id: query },
      { customerPhone: { $regex: query, $options: 'i' } },
    ],
  }).limit(20);

  baskets.forEach((basket) => {
    results.push({
      type: 'BASKET',
      id: basket._id.toString(),
      data: basket,
    });
  });

  return results;
}

/**
 * Get full timeline for an entity (basket, order, payment, etc.)
 */
export async function getTimeline(req: AuthRequest, entityType: string, entityId: string) {
  const timeline: any[] = [];

  // Get audit logs for this entity
  const auditLogs = await AuditLog.find({
    $or: [
      { entityType: entityType.toUpperCase(), entityId },
      { orderId: entityId },
      { basketId: entityId },
      { paymentId: entityId },
    ],
  }).sort({ createdAt: -1 }).limit(100);

  auditLogs.forEach((log: any) => {
    timeline.push({
      type: 'AUDIT',
      timestamp: log.createdAt,
      action: log.action,
      actor: log.actorName,
      actorRole: log.actorRole,
      details: log.details,
      previousValue: log.previousValue,
      newValue: log.newValue,
    });
  });

  // Get entity-specific timeline data based on type
  switch (entityType.toLowerCase()) {
    case 'order':
      const order = await Order.findById(entityId);
      if (order) {
        timeline.push({
          type: 'ORDER_CREATED',
          timestamp: order.createdAt,
          details: {
            orderNumber: order.orderNumber,
            status: order.status,
            type: order.orderType,
            totalAmount: order.totalMinor,
          },
        });

        // Get related payments
        const payments = await Payment.find({ orderId: entityId });
        payments.forEach((payment) => {
          timeline.push({
            type: 'PAYMENT',
            timestamp: payment.createdAt,
            details: {
              amount: payment.amountMinor,
              status: payment.status,
              method: payment.method,
              transactionId: payment.checkoutRequestId || payment.mpesaReceiptNumber,
            },
          });
        });
      }
      break;

    case 'payment':
      const payment = await Payment.findById(entityId);
      if (payment) {
        timeline.push({
          type: 'PAYMENT_INITIATED',
          timestamp: payment.createdAt,
          details: {
            amount: payment.amountMinor,
            status: payment.status,
            method: payment.method,
            transactionId: payment.checkoutRequestId || payment.mpesaReceiptNumber,
          },
        });

        // Get related order
        if (payment.orderId) {
          const order = await Order.findById(payment.orderId);
          if (order) {
            timeline.push({
              type: 'ORDER',
              timestamp: order.createdAt,
              details: {
                orderNumber: order.orderNumber,
                status: order.status,
              },
            });
          }
        }
      }
      break;

    case 'basket':
      const basket = await Basket.findById(entityId);
      if (basket) {
        timeline.push({
          type: 'BASKET_CREATED',
          timestamp: basket.startedAt || new Date(),
          details: {
            status: basket.status,
            itemCount: basket.items.length,
          },
        });
      }
      break;
  }

  // Sort by timestamp descending
  timeline.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return timeline;
}

/**
 * Attach internal note to an entity
 */
export async function attachNote(req: AuthRequest, entityType: string, entityId: string, note: string) {
  // In a real implementation, you'd have a Notes model
  // For now, we'll use the audit log
  await AuditLog.create({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    actorName: req.user!.name,
    action: 'ADD_NOTE',
    entityType: entityType.toUpperCase(),
    entityId,
    details: {
      note,
    },
  });

  return { success: true, message: 'Note attached' };
}

/**
 * Get notes for an entity
 */
export async function getNotes(req: AuthRequest, entityType: string, entityId: string) {
  const notes = await AuditLog.find({
    action: 'ADD_NOTE',
    entityType: entityType.toUpperCase(),
    entityId,
  }).sort({ createdAt: -1 });

  return notes.map((note) => ({
    id: note._id,
    author: note.actorName,
    authorRole: note.actorRole,
    note: note.details?.note,
    createdAt: note.createdAt,
  }));
}

/**
 * Safe action: Resend receipt
 */
export async function resendReceipt(req: AuthRequest, orderId: string) {
  const order = await Order.findById(orderId);
  // Branch staff (e.g. cashiers) may only resend receipts for their own branch. Same message either way,
  // so they cannot probe which orders exist elsewhere.
  if (!order || (roleScope(req.user!.role) !== 'PLATFORM' && !(await canAccessStore(req.user!, String(order.storeId))))) {
    throw new Error('Order not found');
  }

  const customer = await User.findById(order.customerId);

  // In a real implementation, this would trigger the receipt resend logic
  await AuditLog.create({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    actorName: req.user!.name,
    action: 'RESEND_RECEIPT',
    entityType: 'ORDER',
    entityId: orderId,
    details: {
      orderNumber: order.orderNumber,
      customerPhone: customer?.phone || 'N/A',
    },
  });

  return { success: true, message: 'Receipt resend initiated' };
}

/**
 * Safe action: Re-query STK push status
 */
export async function requerySTK(req: AuthRequest, paymentId: string) {
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    throw new Error('Payment not found');
  }

  // In a real implementation, this would trigger the STK re-query logic
  await AuditLog.create({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    actorName: req.user!.name,
    action: 'REQUERY_STK',
    entityType: 'PAYMENT',
    entityId: paymentId,
    details: {
      transactionId: payment.checkoutRequestId || payment.mpesaReceiptNumber,
      merchantRequestId: payment.merchantRequestId,
    },
  });

  return { success: true, message: 'STK re-query initiated' };
}

/**
 * Safe action: Release held order
 */
export async function releaseHeldOrder(req: AuthRequest, orderId: string, reason: string) {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new Error('Order not found');
  }

  if (order.status !== 'HELD') {
    throw new Error('Order is not in HELD status');
  }

  order.status = 'AWAITING_CUSTOMER_APPROVAL';
  await order.save();

  await AuditLog.create({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    actorName: req.user!.name,
    action: 'RELEASE_HELD_ORDER',
    entityType: 'ORDER',
    entityId: orderId,
    details: {
      orderNumber: order.orderNumber,
      reason,
    },
  });

  return { success: true, message: 'Order released', order };
}

/**
 * Safe action: Reset user password
 */
export async function resetUserPassword(req: AuthRequest, userId: string) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Who may reset whose password: branch staff (cashier / helpdesk) reset SHOPPER accounts only; platform
  // support never resets a platform owner; nobody resets their own account through this route.
  if (String(user._id) === String(req.user!.id)) {
    throw new Error('Use the normal password change flow for your own account.');
  }
  if (roleScope(req.user!.role) !== 'PLATFORM') {
    if (user.role !== 'CUSTOMER') throw new Error('You can only reset customer passwords.');
  } else if (roleScope(user.role) === 'PLATFORM' && canonicalRole(req.user!.role) !== 'PLATFORM_OWNER') {
    throw new Error('Only a platform owner can reset a platform account.');
  }

  // In a real implementation, this would generate a temporary password
  // and send it via SMS/email
  user.mustChangePassword = true;
  await user.save();

  await AuditLog.create({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    actorName: req.user!.name,
    action: 'RESET_PASSWORD',
    entityType: 'USER',
    entityId: userId,
    details: {
      phone: user.phone,
    },
  });

  return { success: true, message: 'Password reset initiated' };
}
