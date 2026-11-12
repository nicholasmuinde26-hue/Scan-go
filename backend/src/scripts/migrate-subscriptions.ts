import mongoose from 'mongoose';
import { ENV } from '../config/environment.js';
import Organization from '../modules/organizations/organization.model.js';
import Subscription, { SubscriptionStatus } from '../modules/subscriptions/subscription.model.js';
import { ensurePlanCatalogue } from '../modules/subscriptions/subscription.service.js';

const supportedPlans = new Set(['FREE', 'BASIC', 'PRO', 'ENTERPRISE']);

function legacyStatus(raw: any): SubscriptionStatus {
  if (raw?.status === 'CANCELLED') return SubscriptionStatus.CANCELLED;
  if (raw?.status === 'PAST_DUE' || raw?.organizationStatus === 'GRACE') return SubscriptionStatus.PAST_DUE;
  if (raw?.organizationStatus === 'INACTIVE' || raw?.organizationStatus === 'SUSPENDED') return SubscriptionStatus.SUSPENDED;
  return SubscriptionStatus.ACTIVE;
}

/**
 * Moves legacy Organization.subscription data into the Subscription collection, then removes
 * the embedded copy and the former plan-limit caches. It is idempotent and safe to re-run.
 *
 * Run after the organization migration with: npm run migrate-subscriptions
 */
async function migrateSubscriptions() {
  await mongoose.connect(ENV.MONGODB_URI);
  try {
    await ensurePlanCatalogue();
    const organizations = await Organization.collection.find({}).toArray();
    let created = 0;
    let cleaned = 0;

    for (const organization of organizations) {
      const organizationId = organization._id.toString();
      const legacy = organization.subscription || {};
      const rawPlan = String(legacy.plan || 'FREE').toUpperCase();
      const planCode = supportedPlans.has(rawPlan) ? rawPlan : 'FREE';
      const start = legacy.currentPeriodStart ? new Date(legacy.currentPeriodStart) : (organization.createdAt ? new Date(organization.createdAt) : new Date());
      const end = legacy.currentPeriodEnd ? new Date(legacy.currentPeriodEnd) : new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
      const status = legacyStatus({ ...legacy, organizationStatus: organization.status });

      const existing = await Subscription.findOne({ organizationId });
      if (!existing) {
        await Subscription.create({
          organizationId,
          planCode,
          status,
          billingInterval: 'MONTHLY',
          currentPeriodStart: start,
          currentPeriodEnd: end,
          pastDueAt: status === SubscriptionStatus.PAST_DUE ? end : undefined,
          gracePeriodEnd: legacy.gracePeriodEnd ? new Date(legacy.gracePeriodEnd) : undefined,
          cancelledAt: status === SubscriptionStatus.CANCELLED ? end : undefined,
          suspendedAt: status === SubscriptionStatus.SUSPENDED ? new Date() : undefined,
          stateChangedAt: new Date(),
        });
        created += 1;
      }

      const result = await Organization.collection.updateOne(
        { _id: organization._id },
        { $unset: { subscription: '', maxStores: '', features: '' } }
      );
      if (result.modifiedCount) cleaned += 1;
    }

    console.log(`[Migration] Created ${created} subscription records and removed legacy subscription fields from ${cleaned} organizations.`);
  } finally {
    await mongoose.disconnect();
  }
}

migrateSubscriptions().catch((error) => {
  console.error('[Migration] Subscription migration failed:', error);
  process.exitCode = 1;
});
