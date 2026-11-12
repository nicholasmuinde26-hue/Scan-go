import Subscription, { BillingInterval, ISubscription, SubscriptionStatus } from './subscription.model.js';
import SubscriptionPlanCatalog, { ISubscriptionPlan, ISubscriptionFeatures } from './subscription-plan.model.js';
import SubscriptionJobLock from './subscription-job-lock.model.js';
import Organization, { OrganizationStatus } from '../organizations/organization.model.js';
import Store from '../stores/store.model.js';
import Order from '../orders/order.model.js';
import User from '../users/user.model.js';
import AuditLog from '../audits/audit.model.js';
import { getSettings } from '../platform/systemSettings.model.js';

export type SubscriptionOperation =
  | 'scan_and_go'
  | 'click_and_collect'
  | 'mpesa'
  | 'create_store'
  | 'invite_staff';

export interface SubscriptionGateResult {
  allowed: boolean;
  status: number;
  code?: string;
  reason?: string;
  subscription?: ISubscription;
  plan?: ISubscriptionPlan;
}

/** Feature availability for the storefront UI, independent of transient billing or quota blocks. */
export async function getOrganizationFeatureAvailability(
  organizationId: string,
  operation: 'scan_and_go' | 'click_and_collect'
): Promise<{ allowed: boolean; reason?: string }> {
  const org = await Organization.findById(organizationId).select('status featureFlags');
  if (!org || org.status === OrganizationStatus.SUSPENDED) return { allowed: false, reason: 'This organization is unavailable.' };
  const { plan } = await getSubscriptionContext(organizationId);
  const settings = await getSettings();
  const isCollect = operation === 'click_and_collect';
  const feature = isCollect ? 'clickAndCollect' : 'scanAndGo';
  const globalEnabled = isCollect
    ? settings.featureFlags?.clickAndCollectEnabled !== false
    : settings.featureFlags?.scanAndGoEnabled !== false;
  const orgEnabled = isCollect
    ? org.featureFlags?.pickup !== false
    : org.featureFlags?.scanAndGo !== false;
  if (!globalEnabled) return { allowed: false, reason: `${isCollect ? 'Shop & Collect' : 'Scan & Go'} is disabled platform-wide.` };
  if (!orgEnabled) return { allowed: false, reason: `${isCollect ? 'Shop & Collect' : 'Scan & Go'} is disabled for this supermarket.` };
  if (!plan.features[feature]) return { allowed: false, reason: `${isCollect ? 'Shop & Collect' : 'Scan & Go'} is not included in the ${plan.name} plan.` };
  return { allowed: true };
}

type PlanSeed = {
  code: string;
  name: string;
  description: string;
  trialDays: number;
  gracePeriodDays: number;
  maxStores: number;
  monthlyOrderLimit: number;
  staffSeatLimit: number;
  features: ISubscriptionFeatures;
  pricing: { currency: 'KES'; monthlyAmountMinor: number; annualAmountMinor: number };
};

// These records initialise an empty catalogue only. Runtime enforcement always reads MongoDB,
// so pricing, limits and feature flags are managed through the console APIs rather than code.
const INITIAL_PLAN_CATALOGUE: PlanSeed[] = [
  {
    code: 'FREE', name: 'Free', description: 'For a single small branch getting started.',
    trialDays: 14, gracePeriodDays: 7, maxStores: 1, monthlyOrderLimit: 300, staffSeatLimit: 5,
    features: { scanAndGo: true, clickAndCollect: true, mpesa: true, offers: false, analytics: false, multiStore: false },
    pricing: { currency: 'KES', monthlyAmountMinor: 0, annualAmountMinor: 0 },
  },
  {
    code: 'BASIC', name: 'Basic', description: 'For growing supermarkets with a few branches.',
    trialDays: 14, gracePeriodDays: 7, maxStores: 3, monthlyOrderLimit: 2_000, staffSeatLimit: 25,
    features: { scanAndGo: true, clickAndCollect: true, mpesa: true, offers: false, analytics: true, multiStore: true },
    pricing: { currency: 'KES', monthlyAmountMinor: 100_000, annualAmountMinor: 1_000_000 },
  },
  {
    code: 'PRO', name: 'Pro', description: 'For multi-branch retailers.',
    trialDays: 14, gracePeriodDays: 7, maxStores: 10, monthlyOrderLimit: 10_000, staffSeatLimit: 100,
    features: { scanAndGo: true, clickAndCollect: true, mpesa: true, offers: true, analytics: true, multiStore: true },
    pricing: { currency: 'KES', monthlyAmountMinor: 300_000, annualAmountMinor: 3_000_000 },
  },
  {
    code: 'ENTERPRISE', name: 'Enterprise', description: 'For high-volume retail groups.',
    trialDays: 14, gracePeriodDays: 14, maxStores: 999, monthlyOrderLimit: 0, staffSeatLimit: 0,
    features: { scanAndGo: true, clickAndCollect: true, mpesa: true, offers: true, analytics: true, multiStore: true },
    pricing: { currency: 'KES', monthlyAmountMinor: 1_000_000, annualAmountMinor: 10_000_000 },
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function subscriptionEnd(subscription: ISubscription): Date {
  return subscription.status === SubscriptionStatus.TRIAL && subscription.trialEndsAt
    ? subscription.trialEndsAt
    : subscription.currentPeriodEnd;
}

export async function ensurePlanCatalogue(): Promise<void> {
  await SubscriptionPlanCatalog.bulkWrite(
    INITIAL_PLAN_CATALOGUE.map((plan) => ({
      updateOne: {
        filter: { code: plan.code },
        update: { $setOnInsert: { ...plan, active: true } },
        upsert: true,
      },
    }))
  );
}

export async function getPlan(planCode: string, activeOnly = false): Promise<ISubscriptionPlan> {
  const code = String(planCode || '').trim().toUpperCase();
  const plan = await SubscriptionPlanCatalog.findOne(activeOnly ? { code, active: true } : { code });
  if (!plan) {
    throw Object.assign(new Error(`Subscription plan "${code}" was not found or is unavailable.`), { status: 404 });
  }
  return plan;
}

export async function createSubscriptionForOrganization(
  organizationId: string,
  planCode = 'FREE',
  billingInterval: BillingInterval = 'MONTHLY'
): Promise<ISubscription> {
  await ensurePlanCatalogue();
  const plan = await getPlan(planCode, true);
  const now = new Date();
  const periodEnd = addDays(now, billingInterval === 'ANNUAL' ? 365 : 30);
  const trialEndsAt = plan.trialDays > 0 ? addDays(now, plan.trialDays) : undefined;

  return Subscription.create({
    organizationId,
    planCode: plan.code,
    status: trialEndsAt ? SubscriptionStatus.TRIAL : SubscriptionStatus.ACTIVE,
    billingInterval,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    trialEndsAt,
    nextPaymentAt: trialEndsAt || periodEnd,
    stateChangedAt: now,
  });
}

export async function getOrCreateSubscription(organizationId: string): Promise<ISubscription> {
  const existing = await Subscription.findOne({ organizationId });
  if (existing) return existing;

  const organization = await Organization.findById(organizationId).select('_id');
  if (!organization) {
    throw Object.assign(new Error('Organization not found.'), { status: 404 });
  }

  try {
    return await createSubscriptionForOrganization(organizationId);
  } catch (error: any) {
    // A concurrent first request may have created the unique subscription record.
    if (error?.code === 11000) {
      const created = await Subscription.findOne({ organizationId });
      if (created) return created;
    }
    throw error;
  }
}

export async function getSubscriptionContext(organizationId: string) {
  const subscription = await getOrCreateSubscription(organizationId);
  const plan = await getPlan(subscription.planCode);
  return { subscription, plan };
}

export async function changeSubscriptionPlan(
  organizationId: string,
  planCode: string,
  billingInterval?: BillingInterval
): Promise<ISubscription> {
  const subscription = await getOrCreateSubscription(organizationId);
  const plan = await getPlan(planCode, true);
  const now = new Date();
  const interval = billingInterval || subscription.billingInterval;

  subscription.planCode = plan.code;
  subscription.billingInterval = interval;
  subscription.currentPeriodStart = now;
  subscription.currentPeriodEnd = addDays(now, interval === 'ANNUAL' ? 365 : 30);
  subscription.nextPaymentAt = subscription.currentPeriodEnd;
  subscription.cancelAtPeriodEnd = false;
  subscription.cancelledAt = undefined;
  subscription.suspendedAt = undefined;
  subscription.pastDueAt = undefined;
  subscription.gracePeriodEnd = undefined;
  subscription.trialEndsAt = undefined;
  subscription.status = SubscriptionStatus.ACTIVE;
  subscription.stateChangedAt = now;
  await subscription.save();

  return subscription;
}

export async function setSubscriptionStatus(
  organizationId: string,
  status: SubscriptionStatus
): Promise<ISubscription> {
  const subscription = await getOrCreateSubscription(organizationId);
  const now = new Date();
  const plan = await getPlan(subscription.planCode);

  subscription.status = status;
  subscription.stateChangedAt = now;
  if (status === SubscriptionStatus.PAST_DUE) {
    subscription.pastDueAt = now;
    subscription.gracePeriodEnd = addDays(now, plan.gracePeriodDays);
  }
  if (status === SubscriptionStatus.SUSPENDED) subscription.suspendedAt = now;
  if (status === SubscriptionStatus.CANCELLED) subscription.cancelledAt = now;
  await subscription.save();
  return subscription;
}

async function advanceSubscriptionState(subscription: ISubscription, plan: ISubscriptionPlan, now: Date): Promise<boolean> {
  const previousStatus = subscription.status;

  if (subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd <= now) {
    subscription.status = SubscriptionStatus.CANCELLED;
    subscription.cancelledAt = now;
  } else if (
    (subscription.status === SubscriptionStatus.TRIAL && subscription.trialEndsAt && subscription.trialEndsAt <= now) ||
    (subscription.status === SubscriptionStatus.ACTIVE && subscription.currentPeriodEnd <= now)
  ) {
    subscription.status = SubscriptionStatus.PAST_DUE;
    subscription.pastDueAt = now;
    subscription.gracePeriodEnd = addDays(now, plan.gracePeriodDays);
  } else if (
    subscription.status === SubscriptionStatus.PAST_DUE &&
    subscription.gracePeriodEnd &&
    subscription.gracePeriodEnd <= now
  ) {
    subscription.status = SubscriptionStatus.SUSPENDED;
    subscription.suspendedAt = now;
  }

  if (subscription.status !== previousStatus) {
    subscription.stateChangedAt = now;
    await subscription.save();
    return true;
  }
  return false;
}

export async function checkSubscriptionGate(
  organizationId: string,
  operation: SubscriptionOperation
): Promise<SubscriptionGateResult> {
  const organization = await Organization.findById(organizationId).select('status');
  if (!organization) {
    return { allowed: false, status: 404, code: 'ORGANIZATION_NOT_FOUND', reason: 'Organization not found.' };
  }
  if (organization.status === OrganizationStatus.SUSPENDED) {
    return { allowed: false, status: 403, code: 'ORGANIZATION_SUSPENDED', reason: 'This organization is suspended.' };
  }

  const { subscription, plan } = await getSubscriptionContext(organizationId);
  await advanceSubscriptionState(subscription, plan, new Date());

  if (subscription.status === SubscriptionStatus.PAST_DUE) {
    return {
      allowed: false,
      status: 402,
      code: 'SUBSCRIPTION_READ_ONLY',
      reason: 'This subscription is past due and is in read-only mode until payment is received.',
      subscription,
      plan,
    };
  }
  if (subscription.status === SubscriptionStatus.SUSPENDED || subscription.status === SubscriptionStatus.CANCELLED) {
    return {
      allowed: false,
      status: 403,
      code: 'SUBSCRIPTION_INACTIVE',
      reason: 'This subscription is not active. Contact the organization administrator to restore service.',
      subscription,
      plan,
    };
  }

  if (operation === 'scan_and_go' || operation === 'click_and_collect') {
    const availability = await getOrganizationFeatureAvailability(organizationId, operation);
    if (!availability.allowed) {
    return {
      allowed: false,
      status: 403,
      code: 'FEATURE_UNAVAILABLE',
      reason: availability.reason,
      subscription,
      plan,
    };
    }
  } else if (operation === 'mpesa' && !plan.features.mpesa) {
    return {
      allowed: false,
      status: 403,
      code: 'PLAN_FEATURE_UNAVAILABLE',
      reason: 'M-Pesa is not included in this plan.',
      subscription,
      plan,
    };
  }

  if (operation === 'create_store') {
    const stores = await Store.countDocuments({ organizationId });
    if (stores >= plan.maxStores) {
      return {
        allowed: false,
        status: 409,
        code: 'STORE_LIMIT_REACHED',
        reason: `The ${plan.name} plan allows up to ${plan.maxStores} store${plan.maxStores === 1 ? '' : 's'}.`,
        subscription,
        plan,
      };
    }
  }

  if (operation === 'invite_staff' && plan.staffSeatLimit > 0) {
    const staff = await User.countDocuments({ organizationId, role: { $ne: 'CUSTOMER' }, active: { $ne: false } });
    if (staff >= plan.staffSeatLimit) {
      return {
        allowed: false,
        status: 409,
        code: 'STAFF_SEAT_LIMIT_REACHED',
        reason: `The ${plan.name} plan allows up to ${plan.staffSeatLimit} active staff seats.`,
        subscription,
        plan,
      };
    }
  }

  if ((operation === 'scan_and_go' || operation === 'click_and_collect') && plan.monthlyOrderLimit > 0) {
    const stores = await Store.find({ organizationId }).distinct('_id');
    const orders = await Order.countDocuments({
      storeId: { $in: stores },
      createdAt: { $gte: subscription.currentPeriodStart, $lte: subscription.currentPeriodEnd },
    });
    if (orders >= plan.monthlyOrderLimit) {
      return {
        allowed: false,
        status: 409,
        code: 'ORDER_LIMIT_REACHED',
        reason: `The ${plan.name} plan has reached its ${plan.monthlyOrderLimit.toLocaleString()} order limit for this billing period.`,
        subscription,
        plan,
      };
    }
  }

  return { allowed: true, status: 200, subscription, plan };
}

export interface SubscriptionLifecycleReport {
  processed: number;
  remindersQueued: number;
  movedToPastDue: number;
  suspended: number;
  cancelled: number;
}

async function auditLifecycle(subscription: ISubscription, action: string, reason: string): Promise<void> {
  await AuditLog.create({
    action,
    entityType: 'SUBSCRIPTION',
    entityId: subscription._id.toString(),
    newValue: { organizationId: subscription.organizationId, status: subscription.status, planCode: subscription.planCode },
    reason,
  });
}

function hasReminder(subscription: ISubscription, periodEnd: Date, daysBeforeDue: number): boolean {
  return subscription.reminderLog.some(
    (entry) => entry.daysBeforeDue === daysBeforeDue && entry.periodEnd.getTime() === periodEnd.getTime()
  );
}

/**
 * Runs under a MongoDB lock. Delivery is represented by an audit event until a provider is
 * configured in the notifications phase; the lifecycle state itself is never dependent on delivery.
 */
export async function processSubscriptionLifecycle(now = new Date()): Promise<SubscriptionLifecycleReport> {
  const report: SubscriptionLifecycleReport = { processed: 0, remindersQueued: 0, movedToPastDue: 0, suspended: 0, cancelled: 0 };
  const subscriptions = await Subscription.find({
    status: { $in: [SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
  });

  for (const subscription of subscriptions) {
    const plan = await getPlan(subscription.planCode);
    const priorStatus = subscription.status;
    const dueAt = subscriptionEnd(subscription);
    const daysUntilDue = Math.ceil((dueAt.getTime() - now.getTime()) / DAY_MS);

    if (
      (subscription.status === SubscriptionStatus.TRIAL || subscription.status === SubscriptionStatus.ACTIVE) &&
      [7, 3, 1].includes(daysUntilDue) &&
      !hasReminder(subscription, dueAt, daysUntilDue)
    ) {
      subscription.reminderLog.push({ periodEnd: dueAt, daysBeforeDue: daysUntilDue, sentAt: now });
      await subscription.save();
      await auditLifecycle(subscription, 'SUBSCRIPTION_PAYMENT_REMINDER_QUEUED', `${daysUntilDue}-day payment reminder queued.`);
      report.remindersQueued += 1;
    }

    if (await advanceSubscriptionState(subscription, plan, now)) {
      report.processed += 1;
      if (subscription.status === SubscriptionStatus.PAST_DUE) {
        report.movedToPastDue += 1;
        await auditLifecycle(subscription, 'SUBSCRIPTION_PAST_DUE', 'Subscription period ended; read-only grace period started.');
      } else if (subscription.status === SubscriptionStatus.SUSPENDED) {
        report.suspended += 1;
        await auditLifecycle(subscription, 'SUBSCRIPTION_SUSPENDED', 'Payment grace period ended.');
      } else if (subscription.status === SubscriptionStatus.CANCELLED) {
        report.cancelled += 1;
        await auditLifecycle(subscription, 'SUBSCRIPTION_CANCELLED', 'Subscription was cancelled at the end of its billing period.');
      }
    } else if (priorStatus !== subscription.status) {
      report.processed += 1;
    }
  }
  return report;
}

async function acquireLifecycleLock(now: Date): Promise<boolean> {
  const name = 'subscription-lifecycle-daily';
  const lockedUntil = new Date(now.getTime() + 30 * 60 * 1000);
  const existing = await SubscriptionJobLock.findOneAndUpdate(
    { name, lockedUntil: { $lte: now } },
    { $set: { lockedUntil } },
    { new: true }
  );
  if (existing) return true;

  try {
    await SubscriptionJobLock.create({ name, lockedUntil });
    return true;
  } catch (error: any) {
    if (error?.code === 11000) return false;
    throw error;
  }
}

export async function runSubscriptionLifecycleJob(): Promise<SubscriptionLifecycleReport | null> {
  const now = new Date();
  if (!(await acquireLifecycleLock(now))) return null;

  const report = await processSubscriptionLifecycle(now);
  await SubscriptionJobLock.updateOne(
    { name: 'subscription-lifecycle-daily' },
    { $set: { lastRunAt: now, lastRunSummary: report } }
  );
  return report;
}

export function startSubscriptionLifecycleWorker(): void {
  const intervalMs = 24 * 60 * 60 * 1000;
  void runSubscriptionLifecycleJob().catch((error) => console.error('[Subscriptions] Lifecycle job failed:', error));
  const timer = setInterval(() => {
    void runSubscriptionLifecycleJob().catch((error) => console.error('[Subscriptions] Lifecycle job failed:', error));
  }, intervalMs);
  timer.unref();
}
