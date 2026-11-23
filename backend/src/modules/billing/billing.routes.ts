import { Router } from 'express';
import Invoice from './invoice.model.js';
import Subscription from '../subscriptions/subscription.model.js';
import Organization from '../organizations/organization.model.js';
import AuditLog from '../audits/audit.model.js';
import { authenticate, AuthRequest, isPlatformRole, canAccessOrganization, roleScope } from '../../middleware/auth.js';
import { computeUsage, generateInvoice, recordInvoicePayment, issueInvoice, sweepOverdueInvoices } from './billing.service.js';

const router = Router();

const PLATFORM_FINANCE_PERMS = ['finance:invoices:create', 'finance:invoices:read', 'finance:reconcile', 'finance:ledger:read', 'finance:export'];
const ORG_FINANCE_PERMS = ['finance:view', 'finance:invoices:read', 'finance:reports:view'];

function hasAny(perms: string[] | undefined, needed: string[]) {
  return (perms || []).some((p) => needed.includes(p));
}

/** Platform staff see everything (bounded by managedOrganizationIds); org finance sees only its own org. */
function canSeeOrg(req: AuthRequest, organizationId: string): boolean {
  const u = req.user!;
  if (isPlatformRole(u.role)) return canAccessOrganization(u, organizationId);
  return canAccessOrganization(u, organizationId) && hasAny(u.permissions, ORG_FINANCE_PERMS);
}

async function audit(req: AuthRequest, action: string, entityId: string, extra: any = {}) {
  await AuditLog.create({
    actorId: req.user?.id, actorRole: req.user?.role, actorName: req.user?.name,
    action, entityType: 'SUBSCRIPTION', entityId, ...extra,
  });
}

const handle = (fn: (req: AuthRequest, res: any) => Promise<any>) => (req: AuthRequest, res: any) =>
  fn(req, res).catch((e: any) => res.status(e.status || 500).json({ success: false, error: e.message }));

// List invoices. Platform finance: all (or managed orgs). Org finance: own org only.
router.get('/invoices', authenticate, handle(async (req: AuthRequest, res) => {
  const { organizationId, status } = req.query;
  const filter: any = {};
  if (organizationId) {
    if (!canSeeOrg(req, String(organizationId))) return res.status(403).json({ success: false, error: 'Forbidden.' });
    filter.organizationId = organizationId;
  } else if (!isPlatformRole(req.user!.role)) {
    if (!req.user!.organizationId) return res.status(403).json({ success: false, error: 'Forbidden.' });
    filter.organizationId = req.user!.organizationId;
  } else {
    const managed = req.user!.managedOrganizationIds || [];
    if (managed.length > 0) filter.organizationId = { $in: managed };
  }
  if (status) filter.status = status;
  await sweepOverdueInvoices();
  const invoices = await Invoice.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  res.json({ success: true, invoices });
}));

router.get('/invoices/:id', authenticate, handle(async (req: AuthRequest, res) => {
  const invoice = await Invoice.findById(String(req.params.id)).lean();
  if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' });
  if (!canSeeOrg(req, invoice.organizationId.toString())) return res.status(403).json({ success: false, error: 'Forbidden.' });
  res.json({ success: true, invoice });
}));

// Metered usage for an organization (platform finance or the org's own finance staff).
router.get('/usage/:organizationId', authenticate, handle(async (req: AuthRequest, res) => {
  if (!canSeeOrg(req, String(req.params.organizationId))) return res.status(403).json({ success: false, error: 'Forbidden.' });
  const sub = await Subscription.findOne({ organizationId: String(req.params.organizationId) });
  const start = sub?.currentPeriodStart || new Date(Date.now() - 30 * 86400000);
  const end = sub?.currentPeriodEnd || new Date();
  const usage = await computeUsage(String(req.params.organizationId), start, end);
  res.json({ success: true, usage, period: { start, end } });
}));

// Generate an invoice for the current subscription period (platform finance only).
router.post('/invoices/generate', authenticate, handle(async (req: AuthRequest, res) => {
  if (!isPlatformRole(req.user!.role) || !hasAny(req.user!.permissions, ['finance:invoices:create'])) {
    return res.status(403).json({ success: false, error: 'Platform finance permission required.' });
  }
  const { organizationId, periodStart, periodEnd, issue, notes } = req.body;
  if (!organizationId) return res.status(400).json({ success: false, error: 'organizationId is required.' });
  if (!canAccessOrganization(req.user!, String(organizationId))) {
    return res.status(404).json({ success: false, error: 'Organization not found.' });
  }
  const invoice = await generateInvoice(String(organizationId), {
    periodStart: periodStart ? new Date(periodStart) : undefined,
    periodEnd: periodEnd ? new Date(periodEnd) : undefined,
    createdBy: req.user!.id,
    notes,
    issue: !!issue,
  });
  await audit(req, 'GENERATE_INVOICE', invoice._id.toString(), { newValue: { invoiceNumber: invoice.invoiceNumber, organizationId, totalMinor: invoice.totalMinor } });
  res.status(201).json({ success: true, invoice });
}));

router.post('/invoices/:id/issue', authenticate, handle(async (req: AuthRequest, res) => {
  if (!isPlatformRole(req.user!.role) || !hasAny(req.user!.permissions, ['finance:invoices:create'])) {
    return res.status(403).json({ success: false, error: 'Platform finance permission required.' });
  }
  const existing = await Invoice.findById(String(req.params.id)).select('organizationId');
  if (!existing || !canAccessOrganization(req.user!, existing.organizationId.toString())) {
    return res.status(404).json({ success: false, error: 'Invoice not found.' });
  }
  const invoice = await issueInvoice(String(req.params.id));
  await audit(req, 'ISSUE_INVOICE', invoice._id.toString(), { newValue: { invoiceNumber: invoice.invoiceNumber } });
  res.json({ success: true, invoice });
}));

// Record a payment (platform finance reconciles; org finance can report its own payments).
router.post('/invoices/:id/payments', authenticate, handle(async (req: AuthRequest, res) => {
  const existing = await Invoice.findById(String(req.params.id)).select('organizationId');
  if (!existing) return res.status(404).json({ success: false, error: 'Invoice not found.' });
  const platformSide = isPlatformRole(req.user!.role);
  if (!canSeeOrg(req, existing.organizationId.toString())) return res.status(403).json({ success: false, error: 'Forbidden.' });
  if (!platformSide && !hasAny(req.user!.permissions, ['finance:invoices:create', 'finance:reconcile'])) {
    return res.status(403).json({ success: false, error: 'You cannot record payments on this invoice.' });
  }
  const { amountMinor, method = 'MANUAL', reference } = req.body;
  const invoice = await recordInvoicePayment(String(req.params.id), {
    amountMinor: Number(amountMinor), method, reference, receivedBy: req.user!.id,
  });
  await audit(req, 'RECORD_INVOICE_PAYMENT', invoice._id.toString(), {
    newValue: { amountMinor, method, reference, invoiceNumber: invoice.invoiceNumber },
  });
  res.json({ success: true, invoice });
}));

// Set per-organization custom pricing (negotiated agreement). Platform workspace/billing admins.
router.patch('/organizations/:organizationId/custom-pricing', authenticate, handle(async (req: AuthRequest, res) => {
  if (!isPlatformRole(req.user!.role)) return res.status(403).json({ success: false, error: 'Platform access only.' });
  if (!canAccessOrganization(req.user!, String(req.params.organizationId))) {
    return res.status(404).json({ success: false, error: 'Organization not found.' });
  }
  if (!hasAny(req.user!.permissions, ['org:subscription:manage', 'platform:orgs:suspend', 'system:admin'])) {
    return res.status(403).json({ success: false, error: 'You cannot change billing terms.' });
  }
  const { monthlyAmountMinor, annualAmountMinor, notes } = req.body;
  const sub = await Subscription.findOne({ organizationId: String(req.params.organizationId) });
  if (!sub) return res.status(404).json({ success: false, error: 'No subscription for this organization.' });
  sub.customPricing = {
    monthlyAmountMinor: monthlyAmountMinor !== undefined ? Number(monthlyAmountMinor) : sub.customPricing?.monthlyAmountMinor,
    annualAmountMinor: annualAmountMinor !== undefined ? Number(annualAmountMinor) : sub.customPricing?.annualAmountMinor,
    notes: notes !== undefined ? String(notes) : sub.customPricing?.notes,
    setBy: req.user!.id as any,
    setAt: new Date(),
  };
  await sub.save();
  await audit(req, 'UPDATE_CUSTOM_PRICING', sub._id.toString(), { newValue: sub.customPricing });
  res.json({ success: true, customPricing: sub.customPricing });
}));

export default router;
