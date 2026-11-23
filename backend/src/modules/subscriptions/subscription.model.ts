import { Schema, model, Document } from 'mongoose';

/**
 * A subscription is the sole record of an organization's billing state.
 * Product limits and feature availability live in SubscriptionPlanCatalog.
 */
export enum SubscriptionStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED',
}

export type BillingInterval = 'MONTHLY' | 'ANNUAL';

export interface ISubscription extends Document {
  organizationId: Schema.Types.ObjectId;
  planCode: string;
  status: SubscriptionStatus;
  billingInterval: BillingInterval;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEndsAt?: Date;
  pastDueAt?: Date;
  gracePeriodEnd?: Date;
  paymentMethod?: 'MPESA' | 'CARD' | 'MANUAL';
  // Per-organization negotiated pricing (custom agreement). Overrides plan pricing
  // for invoice generation; the plan itself is never modified.
  customPricing?: {
    monthlyAmountMinor?: number;
    annualAmountMinor?: number;
    notes?: string;
    setBy?: Schema.Types.ObjectId;
    setAt?: Date;
  };
  lastPaymentAt?: Date;
  nextPaymentAt?: Date;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: Date;
  suspendedAt?: Date;
  stateChangedAt: Date;
  reminderLog: Array<{
    periodEnd: Date;
    daysBeforeDue: number;
    sentAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, unique: true },
    planCode: { type: String, required: true, trim: true, uppercase: true, index: true },
    status: { type: String, enum: Object.values(SubscriptionStatus), required: true, index: true },
    billingInterval: { type: String, enum: ['MONTHLY', 'ANNUAL'], default: 'MONTHLY' },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    trialEndsAt: Date,
    pastDueAt: Date,
    gracePeriodEnd: Date,
    paymentMethod: { type: String, enum: ['MPESA', 'CARD', 'MANUAL'] },
    customPricing: {
      monthlyAmountMinor: Number,
      annualAmountMinor: Number,
      notes: String,
      setBy: { type: Schema.Types.ObjectId, ref: 'User' },
      setAt: Date,
    },
    lastPaymentAt: Date,
    nextPaymentAt: Date,
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancelledAt: Date,
    suspendedAt: Date,
    stateChangedAt: { type: Date, default: Date.now },
    reminderLog: [
      {
        periodEnd: { type: Date, required: true },
        daysBeforeDue: { type: Number, required: true },
        sentAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });
subscriptionSchema.index({ status: 1, gracePeriodEnd: 1 });

export default model<ISubscription>('Subscription', subscriptionSchema);