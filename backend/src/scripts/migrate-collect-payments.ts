import mongoose from 'mongoose';
import { ENV } from '../config/environment.js';
import Order from '../modules/orders/order.model.js';
import Payment from '../modules/payments/payment.model.js';

/**
 * One-off: orders paid before deposits existed have paidMinor = 0. Backfill paidMinor from the successful
 * payments on record (falling back to the order total for paid orders), and mark the plan as FULL.
 * Safe to re-run.
 */
async function migrate() {
  await mongoose.connect(ENV.MONGODB_URI);
  const legacy = await Order.find({ paidAt: { $exists: true }, $or: [{ paidMinor: { $exists: false } }, { paidMinor: 0 }] });
  let updated = 0;
  for (const order of legacy) {
    const payments = await Payment.find({ orderId: order._id, status: 'SUCCESS' });
    const paid = payments.reduce((sum, p) => sum + (p.amountMinor || 0), 0) || order.totalMinor;
    await Order.updateOne({ _id: order._id }, { $set: { paidMinor: Math.min(paid, order.totalMinor), paymentPlan: 'FULL' } });
    updated++;
  }
  console.log(`[Migration] Backfilled paidMinor on ${updated} order(s).`);
  await mongoose.disconnect();
}

migrate().catch((e) => {
  console.error('[Migration] failed:', e.message);
  process.exit(1);
});
