import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { pgEnabled, ensureFinancialSchema } from '../db/postgres.js';
import { mirrorOrder, mirrorPayment } from '../modules/financial/financial-ledger.service.js';
import Order from '../modules/orders/order.model.js';
import Payment from '../modules/payments/payment.model.js';

/**
 * Backfill the PostgreSQL financial ledger with historical Mongo records.
 *
 * Idempotent — safe to re-run; everything is an upsert. Only mirrors orders
 * and payments; MongoDB remains authoritative.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-financial-ledger.ts [--store <storeId>] [--since <days>] [--batch 200]
 *
 * Requires POSTGRES_URL (or DATABASE_URL) in backend/.env.
 */

async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const storeId = arg('store');
  const sinceDays = arg('since') ? parseInt(arg('since')!, 10) : undefined;
  const batchSize = Math.min(Math.max(parseInt(arg('batch') || '200', 10) || 200, 10), 1000);

  if (!pgEnabled()) {
    console.error('[Backfill] POSTGRES_URL is not set — nothing to do. Add it to backend/.env first.');
    process.exit(1);
  }

  await connectDatabase();
  await ensureFinancialSchema();
  console.log('[Backfill] PostgreSQL schema ready. Reading MongoDB…');

  const orderFilter: any = {};
  if (storeId && mongoose.Types.ObjectId.isValid(storeId)) orderFilter.storeId = new mongoose.Types.ObjectId(storeId);
  if (sinceDays) orderFilter.createdAt = { $gte: new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000) };

  const totalOrders = await Order.countDocuments(orderFilter);
  console.log(`[Backfill] ${totalOrders} orders in scope.`);

  let ordersDone = 0;
  let paymentsDone = 0;
  let cursor = Order.find(orderFilter).select('_id').sort({ createdAt: 1 }).lean().cursor();

  // Process in batches so memory stays flat on large histories.
  let batch: any[] = [];
  const flush = async () => {
    if (!batch.length) return;
    const ids = batch.map((o) => o._id);
    const [orders, payments] = await Promise.all([
      Order.find({ _id: { $in: ids } }).lean(),
      Payment.find({ orderId: { $in: ids } }).lean(),
    ]);
    const paymentsByOrder = new Map<string, any[]>();
    for (const p of payments) {
      const k = String(p.orderId);
      if (!paymentsByOrder.has(k)) paymentsByOrder.set(k, []);
      paymentsByOrder.get(k)!.push(p);
    }
    for (const o of orders) {
      await mirrorOrder(o);
      for (const p of paymentsByOrder.get(String(o._id)) || []) {
        await mirrorPayment(p, o);
        paymentsDone++;
      }
      ordersDone++;
    }
    console.log(`[Backfill] ${ordersDone}/${totalOrders} orders, ${paymentsDone} payments mirrored.`);
    batch = [];
  };

  for await (const o of cursor) {
    batch.push(o);
    if (batch.length >= batchSize) await flush();
  }
  await flush();

  console.log(`[Backfill] Complete: ${ordersDone} orders, ${paymentsDone} payments.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('[Backfill] Failed:', e);
  process.exit(1);
});
