import Order from './order.model.js';
import AuditLog from '../audits/audit.model.js';
import { broadcastEvent } from '../../shared/utils/eventStream.js';

/**
 * Orders that were packed against a deposit but never collected: once the pickup window plus grace has passed,
 * the order expires and the store keeps the deposit. Fully paid orders are never touched here (that money is the
 * customer's and goes through the normal refund path).
 */
export async function sweepNoShowOrders(): Promise<number> {
  const overdue = await Order.find({
    orderType: 'CLICK_AND_COLLECT',
    paymentPlan: 'DEPOSIT',
    status: { $in: ['PICKING', 'AWAITING_CUSTOMER_APPROVAL', 'READY_FOR_VERIFICATION', 'VERIFIED_AND_PACKED', 'READY_FOR_PICKUP', 'AWAITING_FINAL_PAYMENT'] },
    collectBy: { $lte: new Date() },
    depositForfeitedAt: { $exists: false },
  }).limit(100);

  let count = 0;
  for (const order of overdue) {
    const moved = await Order.findOneAndUpdate(
      { _id: order._id, status: order.status, depositForfeitedAt: { $exists: false } },
      {
        $set: { status: 'EXPIRED', depositForfeitedAt: new Date() },
        $push: { statusHistory: { status: 'EXPIRED', changedAt: new Date(), note: `No-show: not collected by the end of the pickup window. Deposit KES ${(order.paidMinor || 0) / 100} retained by the store; return the packed goods to shelf.` } },
      }
    );
    if (!moved) continue;
    count++;
    await AuditLog.create({
      action: 'COLLECT_ORDER_NO_SHOW',
      entityType: 'ORDER',
      entityId: order._id.toString(),
      storeId: order.storeId,
      newValue: { depositRetainedMinor: order.paidMinor || 0 },
    });
    broadcastEvent({
      type: 'order.expired',
      payload: { orderId: order._id, orderNumber: order.orderNumber, reason: 'NO_SHOW' },
      storeId: order.storeId.toString(),
      targetRoles: ['PICKER', 'SUPERVISOR', 'STORE_MANAGER'],
    });
  }
  return count;
}
