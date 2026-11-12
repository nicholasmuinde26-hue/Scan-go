import { Router, Response } from 'express';
import SubscriptionPlanCatalog from './subscription-plan.model.js';
import { SubscriptionStatus } from './subscription.model.js';
import {
  changeSubscriptionPlan,
  createSubscriptionForOrganization,
  ensurePlanCatalogue,
  getSubscriptionContext,
  setSubscriptionStatus,
} from './subscription.service.js';
import Organization from '../organizations/organization.model.js';
import AuditLog from '../audits/audit.model.js';
import { authenticate, AuthRequest, requirePermission } from '../../middleware/auth.js';

const router = Router();

const platformRoles = new Set([
  'PLATFORM_OWNER', 'PLATFORM_ADMIN', 'FINANCE_ADMIN', 'FINANCE_APPROVER',
  'CUSTOMER_SUCCESS', 'SYSTEM_ADMIN',
]);

const handle =
  (fn: (req: AuthRequest, res: Response) => Promise<void>) =>
  (req: AuthRequest, res: Response): void => {
    void fn(req, res).catch((error: any) => {
      res.status(error.status || 500).json({ success: false, error: error.message || 'Subscription request failed.' });
    });
  };

function fail(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

function normalizePlanCode(value: unknown): string {
  const code = String(value || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(code)) {
    throw fail(400, 'Plan code must use 2-32 uppercase letters, numbers, or underscores.');
  }
  return code;
}

function singleParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function canManageOrganization(req: AuthRequest, organizationId: string): boolean {
  return platformRoles.has(req.user!.role) || req.user!.organizationId === organizationId;
}

function requirePlatformSubscriptionManager(req: AuthRequest): void {
  if (!platformRoles.has(req.user!.role)) {
    throw fail(403, 'Only a platform billing administrator can change a subscription plan or status.');
  }
}

async function audit(req: AuthRequest, action: string, subscription: any, previousValue?: any) {
  await AuditLog.create({
    actorId: req.user?.id,
    actorRole: req.user?.role,
    actorName: req.user?.name,
    action,
    entityType: 'SUBSCRIPTION',
    entityId: subscription._id.toString(),
    previousValue,
    newValue: {
      organizationId: subscription.organizationId,
      planCode: subscription.planCode,
      status: subscription.status,
      billingInterval: subscription.billingInterval,
    },
    reason: req.body?.reason,
  });
}

router.get('/plans', authenticate, handle(async (_req, res) => {
  await ensurePlanCatalogue();
  const plans = await SubscriptionPlanCatalog.find().sort({ 'pricing.monthlyAmountMinor': 1, code: 1 }).lean();
  res.json({ success: true, plans });
}));

router.post('/plans', authenticate, requirePermission('platform:settings:write'), handle(async (req, res) => {
  const code = normalizePlanCode(req.body.code);
  if (await SubscriptionPlanCatalog.exists({ code })) throw fail(409, `Plan "${code}" already exists.`);

  const { name, maxStores, monthlyOrderLimit = 0, staffSeatLimit = 0, trialDays = 14, gracePeriodDays = 7, features, pricing } = req.body;
  if (!name || !Number.isInteger(maxStores) || maxStores < 1) throw fail(400, 'name and a positive integer maxStores are required.');
  if (!features || !pricing || !Number.isFinite(pricing.monthlyAmountMinor) || !Number.isFinite(pricing.annualAmountMinor)) {
    throw fail(400, 'features and monthly/annual pricing amounts are required.');
  }

  const plan = await SubscriptionPlanCatalog.create({
    code,
    name: String(name).trim(),
    description: req.body.description ? String(req.body.description).trim() : undefined,
    active: req.body.active !== false,
    maxStores,
    monthlyOrderLimit,
    staffSeatLimit,
    trialDays,
    gracePeriodDays,
    features,
    pricing: { currency: 'KES', monthlyAmountMinor: pricing.monthlyAmountMinor, annualAmountMinor: pricing.annualAmountMinor },
  });
  res.status(201).json({ success: true, plan });
}));

router.patch('/plans/:code', authenticate, requirePermission('platform:settings:write'), handle(async (req, res) => {
  const plan = await SubscriptionPlanCatalog.findOne({ code: normalizePlanCode(req.params.code) });
  if (!plan) throw fail(404, 'Plan not found.');

  const before = plan.toObject();
  for (const field of ['name', 'description', 'active', 'maxStores', 'monthlyOrderLimit', 'staffSeatLimit', 'trialDays', 'gracePeriodDays'] as const) {
    if (req.body[field] !== undefined) (plan as any)[field] = req.body[field];
  }
  if (req.body.features) plan.features = { ...(plan.features as any), ...req.body.features };
  if (req.body.pricing) plan.pricing = { ...(plan.pricing as any), currency: 'KES', ...req.body.pricing };
  await plan.save();

  await AuditLog.create({
    actorId: req.user?.id, actorRole: req.user?.role, actorName: req.user?.name,
    action: 'UPDATE_SUBSCRIPTION_PLAN', entityType: 'SUBSCRIPTION', entityId: plan._id.toString(),
    previousValue: before, newValue: plan.toObject(), reason: req.body.reason,
  });
  res.json({ success: true, plan });
}));

router.get('/me', authenticate, requirePermission('org:subscription:view'), handle(async (req, res) => {
  if (!req.user?.organizationId) throw fail(403, 'Your account is not assigned to an organization.');
  const { subscription, plan } = await getSubscriptionContext(req.user.organizationId);
  res.json({ success: true, subscription, plan });
}));

router.get('/organizations/:organizationId', authenticate, requirePermission('org:subscription:view'), handle(async (req, res) => {
  const organizationId = singleParam(req.params.organizationId);
  if (!canManageOrganization(req, organizationId)) throw fail(403, 'You cannot view another organization’s subscription.');
  const { subscription, plan } = await getSubscriptionContext(organizationId);
  res.json({ success: true, subscription, plan });
}));

router.post('/organizations/:organizationId', authenticate, requirePermission('platform:orgs:create'), handle(async (req, res) => {
  requirePlatformSubscriptionManager(req);
  const organization = await Organization.findById(singleParam(req.params.organizationId));
  if (!organization) throw fail(404, 'Organization not found.');
  const subscription = await createSubscriptionForOrganization(
    organization._id.toString(),
    req.body.planCode || 'FREE',
    req.body.billingInterval || 'MONTHLY'
  );
  await audit(req, 'CREATE_SUBSCRIPTION', subscription);
  res.status(201).json({ success: true, subscription });
}));

router.patch('/organizations/:organizationId/plan', authenticate, requirePermission('org:subscription:manage'), handle(async (req, res) => {
  requirePlatformSubscriptionManager(req);
  const organization = await Organization.findById(singleParam(req.params.organizationId));
  if (!organization) throw fail(404, 'Organization not found.');
  const current = await getSubscriptionContext(organization._id.toString());
  const subscription = await changeSubscriptionPlan(
    organization._id.toString(),
    normalizePlanCode(req.body.planCode),
    req.body.billingInterval
  );
  await audit(req, 'CHANGE_SUBSCRIPTION_PLAN', subscription, { planCode: current.subscription.planCode, status: current.subscription.status });
  res.json({ success: true, subscription });
}));

router.patch('/organizations/:organizationId/status', authenticate, requirePermission('platform:orgs:suspend'), handle(async (req, res) => {
  requirePlatformSubscriptionManager(req);
  if (!Object.values(SubscriptionStatus).includes(req.body.status)) throw fail(400, 'A valid subscription status is required.');
  const organization = await Organization.findById(singleParam(req.params.organizationId));
  if (!organization) throw fail(404, 'Organization not found.');
  const current = await getSubscriptionContext(organization._id.toString());
  const subscription = await setSubscriptionStatus(organization._id.toString(), req.body.status);
  await audit(req, 'CHANGE_SUBSCRIPTION_STATUS', subscription, { status: current.subscription.status });
  res.json({ success: true, subscription });
}));

export default router;
