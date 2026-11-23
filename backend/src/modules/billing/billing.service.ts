import Store from '../stores/store.model.js';
import User from '../users/user.model.js';
import Order from '../orders/order.model.js';
import Subscription from '../subscriptions/subscription.model.js';
import SubscriptionPlan from '../subscriptions/subscription-plan.model.js';
import Invoice, { IInvoiceLineItem } from './invoice.model.js';

const PAID_ORDER_STATUSES = ['PAID', 'PICKING', 'AWAITING_CUSTOMER_APPROVAL', 'AWAITING_FINAL_PAYMENT', 'READY_FOR_VERIFICATION', 'VERIFIED_AND_PACKED', 'READY_FOR_PICKUP', 'COLLECTED', 'EXITED'];

export interface BillingUsage {
  activeBranches: number;
  activeStaff: number;
  transactions: number;
  grossSalesMinor: number;
}

/** Metered usage for one organization over a period — the basis of hybrid billing. */
export async function computeUsage(organizationId: string, periodStart: Date, periodEnd: Date): Promise<BillingUsage> {
  const stores = await Store.find({ organizationId, active: true }).select('_id').lean();
  const storeIds = stores.map((s) => s._id);
  const [activeStaff, transactions, sales] = await Promise.all([
    User.countDocuments({ organizationId, status: 'ACTIVE', role: { $ne: 'CUSTOMER' } }),
    Order.countDocuments({ storeId: { $in: storeIds }, createdAt: { $gte: periodStart, $lt: periodEnd }, status: { $in: PAID_ORDER_STATUSES } }),
    Order.aggregate([
      { $match: { storeId: { $in: storeIds }, createdAt: { $gte: periodStart, $lt: periodEnd }, status: { $in: PAID_ORDER_STATUSES } } },
      { $group: { _id: null, total: { $sum: '$totalMinor' } } },
    ]),
  ]);
  return {
    activeBranches: stores.length,
    activeStaff,
    transactions,
    grossSalesMinor: Number(sales[0]?.total || 0),
  };
}

function nextInvoiceNumber(): string {
  const d = new Date();
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `INV-${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}-${rand}`;
}

/**
 * Generate an invoice for a subscription period. Uses plan price components when
 * defined, otherwise the flat (or custom-negotiated) plan price. All amounts are
 * VAT-inclusive minor units (cents) in KES.
 */
export async function generateInvoice(
  organizationId: string,
  opts: { periodStart?: Date; periodEnd?: Date; createdBy?: string; notes?: string; issue?: boolean } = {}
) {
  const subscription = await Subscription.findOne({ organizationId });
  if (!subscription) throw Object.assign(new Error('No subscription found for this organization.'), { status: 404 });
  const plan = await SubscriptionPlan.findOne({ code: subscription.planCode });
  if (!plan) throw Object.assign(new Error(`Plan ${subscription.planCode} not found.`), { status: 404 });

  const periodStart = opts.periodStart || subscription.currentPeriodStart;
  const periodEnd = opts.periodEnd || subscription.currentPeriodEnd;
  const usage = await computeUsage(organizationId, periodStart, periodEnd);

  const lineItems: IInvoiceLineItem[] = [];
  const components = (plan.components || []).filter((c) => c.active);

  if (components.length > 0) {
    for (const c of components) {
      let quantity = 1;
      if (c.type === 'PER_BRANCH') quantity = Math.max(0, usage.activeBranches - (c.includedUnits || 0));
      else if (c.type === 'PER_STAFF') quantity = Math.max(0, usage.activeStaff - (c.includedUnits || 0));
      else if (c.type === 'PER_TRANSACTION') quantity = Math.max(0, usage.transactions - (c.includedUnits || 0));
      else if (c.type === 'USAGE') quantity = usage.activeStaff; // usage-priced per active staff seat by default
      const amountMinor = quantity * c.amountMinor;
      if (amountMinor <= 0 && c.type !== 'BASE') continue;
      lineItems.push({
        label: c.type === 'PER_BRANCH' ? `${c.label} (${usage.activeBranches} branches)`
          : c.type === 'PER_STAFF' ? `${c.label} (${usage.activeStaff} staff seats)`
          : c.type === 'PER_TRANSACTION' ? `${c.label} (${usage.transactions} transactions)`
          : c.label,
        quantity, unitAmountMinor: c.amountMinor, amountMinor,
      });
    }
  } else {
    // Flat pricing: custom agreement overrides the catalog price.
    const custom = subscription.customPricing;
    const amountMinor = subscription.billingInterval === 'ANNUAL'
      ? (custom?.annualAmountMinor ?? plan.pricing.annualAmountMinor)
      : (custom?.monthlyAmountMinor ?? plan.pricing.monthlyAmountMinor);
    lineItems.push({
      label: `${plan.name} subscription (${subscription.billingInterval === 'ANNUAL' ? 'annual' : 'monthly'})${custom ? ' — custom agreement' : ''}`,
      quantity: 1, unitAmountMinor: amountMinor, amountMinor,
    });
  }

  const totalMinor = lineItems.reduce((sum, li) => sum + li.amountMinor, 0);
  const duplicate = await Invoice.findOne({ organizationId, periodStart, periodEnd, status: { $ne: 'VOID' } });
  if (duplicate) throw Object.assign(new Error(`An invoice already exists for this period: ${duplicate.invoiceNumber}`), { status: 409 });

  const invoice = await Invoice.create({
    organizationId, subscriptionId: subscription._id,
    invoiceNumber: nextInvoiceNumber(),
    periodStart, periodEnd,
    billingInterval: subscription.billingInterval,
    lineItems,
    usageSnapshot: { activeBranches: usage.activeBranches, activeStaff: usage.activeStaff, transactions: usage.transactions },
    subtotalMinor: totalMinor, totalMinor, amountPaidMinor: 0,
    status: opts.issue ? 'ISSUED' : 'DRAFT',
    dueDate: periodEnd,
    issuedAt: opts.issue ? new Date() : undefined,
    notes: opts.notes,
    createdBy: opts.createdBy,
  });
  return invoice;
}

/** Record a payment against an invoice and recompute its status. */
export async function recordInvoicePayment(
  invoiceId: string,
  payment: { amountMinor: number; method: 'MPESA' | 'CARD' | 'BANK' | 'CASH' | 'MANUAL'; reference?: string; receivedBy?: string }
) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw Object.assign(new Error('Invoice not found.'), { status: 404 });
  if (invoice.status === 'VOID' || invoice.status === 'PAID') {
    throw Object.assign(new Error(`Invoice is ${invoice.status}; payments cannot be recorded.`), { status: 409 });
  }
  if (!Number.isInteger(payment.amountMinor) || payment.amountMinor <= 0) {
    throw Object.assign(new Error('Payment amount must be a positive whole number of cents.'), { status: 400 });
  }
  invoice.payments.push({
    amountMinor: payment.amountMinor,
    method: payment.method,
    reference: payment.reference,
    receivedBy: payment.receivedBy as any,
    receivedAt: new Date(),
  });
  invoice.amountPaidMinor += payment.amountMinor;
  if (invoice.amountPaidMinor >= invoice.totalMinor) {
    invoice.status = 'PAID';
    invoice.paidAt = new Date();
  } else {
    invoice.status = 'PARTIAL';
  }
  await invoice.save();

  // Keep the subscription's payment markers in sync.
  if (invoice.subscriptionId) {
    await Subscription.updateOne(
      { _id: invoice.subscriptionId },
      { $set: { lastPaymentAt: new Date(), paymentMethod: payment.method === 'MANUAL' ? 'MANUAL' : payment.method } }
    );
  }
  return invoice;
}

/** Issue a draft invoice (makes it visible to the organization). */
export async function issueInvoice(invoiceId: string) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw Object.assign(new Error('Invoice not found.'), { status: 404 });
  if (invoice.status !== 'DRAFT') throw Object.assign(new Error(`Only DRAFT invoices can be issued (current: ${invoice.status}).`), { status: 409 });
  invoice.status = 'ISSUED';
  invoice.issuedAt = new Date();
  await invoice.save();
  return invoice;
}

/** Mark unpaid issued/partial invoices past their due date as OVERDUE. */
export async function sweepOverdueInvoices(now = new Date()) {
  return Invoice.updateMany(
    { status: { $in: ['ISSUED', 'PARTIAL'] }, dueDate: { $lt: now } },
    { $set: { status: 'OVERDUE' } }
  );
}
