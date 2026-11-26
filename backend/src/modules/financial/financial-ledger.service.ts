import { Types } from 'mongoose';
import { ensureFinancialSchema, pgEnabled, pgQuery } from '../../db/postgres.js';
import Order from '../orders/order.model.js';
import Payment from '../payments/payment.model.js';

/**
 * Financial ledger mirror: writes the authoritative Mongo records into
 * PostgreSQL for relational integrity and reconciliation.
 *
 * Every function is fire-and-forget safe — a Postgres outage or missing
 * POSTGRES_URL must never break a sale. MongoDB remains authoritative until
 * the cut-over is deliberately performed.
 */

function oid(v: any): string {
  return v?._id ? String(v._id) : String(v ?? '');
}

/** Upsert the financial view of an order (created at checkout, updated on payment/status change). */
export async function mirrorOrder(order: any): Promise<void> {
  if (!pgEnabled() || !order?._id) return;
  try {
    await ensureFinancialSchema();
    await pgQuery(
      `INSERT INTO orders_financial
         (order_id, order_number, store_id, organization_id, customer_id, order_type,
          status, total_minor, paid_minor, is_guest, created_at, paid_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       ON CONFLICT (order_id) DO UPDATE SET
         status = EXCLUDED.status,
         paid_minor = EXCLUDED.paid_minor,
         paid_at = COALESCE(orders_financial.paid_at, EXCLUDED.paid_at),
         updated_at = now()`,
      [
        oid(order),
        order.orderNumber || '',
        oid(order.storeId),
        oid(order.organizationId),
        oid(order.customerId),
        order.orderType || 'SCAN_AND_GO',
        order.status || 'DRAFT',
        Number(order.totalMinor || 0),
        Number(order.paidMinor || 0),
        !!order.isGuest,
        order.createdAt ? new Date(order.createdAt) : new Date(),
        order.paidAt ? new Date(order.paidAt) : null,
      ]
    );
  } catch (err: any) {
    console.warn('[FinancialLedger] mirrorOrder failed:', err?.message);
  }
}

/** Upsert a payment record. Must be called after the payment reaches a final state. */
export async function mirrorPayment(payment: any, order?: any): Promise<void> {
  if (!pgEnabled() || !payment?._id) return;
  try {
    await ensureFinancialSchema();
    // The orders_financial row must exist first (FK).
    if (order) await mirrorOrder(order);
    const provider = payment.method === 'MPESA' ? 'mpesa' : payment.method === 'CARD' ? payment.provider || 'card' : payment.method;
    const providerRef =
      payment.mpesaReceiptNumber || payment.providerTransactionId || payment.checkoutRequestId || null;

    await pgQuery(
      `INSERT INTO payments
         (payment_id, order_id, store_id, customer_id, method, kind, status,
          amount_minor, expected_amount_minor, provider, provider_ref,
          checkout_request_id, verified_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
       ON CONFLICT (payment_id) DO UPDATE SET
         status = EXCLUDED.status,
         amount_minor = EXCLUDED.amount_minor,
         provider_ref = COALESCE(EXCLUDED.provider_ref, payments.provider_ref),
         verified_at = COALESCE(EXCLUDED.verified_at, payments.verified_at),
         updated_at = now()`,
      [
        oid(payment),
        oid(payment.orderId || order?._id),
        oid(payment.storeId || order?.storeId),
        oid(payment.customerId || order?.customerId),
        payment.method || 'UNKNOWN',
        payment.kind || 'FULL',
        payment.status || 'PENDING',
        Number(payment.amountMinor || payment.expectedAmountMinor || 0),
        Number(payment.expectedAmountMinor || payment.amountMinor || 0),
        provider,
        providerRef,
        payment.checkoutRequestId || null,
        payment.verifiedAt ? new Date(payment.verifiedAt) : null,
        payment.createdAt ? new Date(payment.createdAt) : new Date(),
      ]
    );

    // Keep the order's paid_minor in sync inside the same logical write.
    if (order) await mirrorOrder(order);
  } catch (err: any) {
    console.warn('[FinancialLedger] mirrorPayment failed:', err?.message);
  }
}

/** Reconciliation: compare Mongo aggregates against the Postgres ledger for a store/window. */
export async function ledgerReconciliation(storeId: string, days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const mongoOrders = await pgQuerySafeMongo(storeId, since);
  const pgOrders = await pgQuery(
    `SELECT status, COUNT(*)::int AS n, COALESCE(SUM(total_minor),0)::bigint AS total_minor,
            COALESCE(SUM(paid_minor),0)::bigint AS paid_minor
       FROM orders_financial WHERE store_id = $1 AND created_at >= $2 GROUP BY status`,
    [storeId, since]
  );
  const pgPayments = await pgQuery(
    `SELECT status, method, COUNT(*)::int AS n, COALESCE(SUM(amount_minor),0)::bigint AS amount_minor
       FROM payments WHERE store_id = $1 AND created_at >= $2 GROUP BY status, method`,
    [storeId, since]
  );

  return { mongo: mongoOrders, postgres: { ordersByStatus: pgOrders, paymentsByStatusMethod: pgPayments } };
}

async function pgQuerySafeMongo(storeId: string, since: Date) {
  const storeOid = new Types.ObjectId(storeId);
  const [orders, payments] = await Promise.all([
    Order.aggregate([
      { $match: { storeId: storeOid, createdAt: { $gte: since } } },
      { $group: { _id: '$status', n: { $sum: 1 }, totalMinor: { $sum: '$totalMinor' }, paidMinor: { $sum: '$paidMinor' } } },
    ]),
    Payment.aggregate([
      { $match: { storeId: storeOid, createdAt: { $gte: since } } },
      { $group: { _id: { status: '$status', method: '$method' }, n: { $sum: 1 }, amountMinor: { $sum: '$amountMinor' } } },
    ]),
  ]);
  return { ordersByStatus: orders, paymentsByStatusMethod: payments };
}
