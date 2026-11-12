import { Schema, model, Document } from 'mongoose';

export interface ISubscriptionFeatures {
  scanAndGo: boolean;
  clickAndCollect: boolean;
  mpesa: boolean;
  offers: boolean;
  analytics: boolean;
  multiStore: boolean;
}

export interface ISubscriptionPlan extends Document {
  code: string;
  name: string;
  description?: string;
  active: boolean;
  trialDays: number;
  gracePeriodDays: number;
  maxStores: number;
  monthlyOrderLimit: number;
  staffSeatLimit: number;
  features: ISubscriptionFeatures;
  pricing: {
    currency: 'KES';
    monthlyAmountMinor: number;
    annualAmountMinor: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionFeaturesSchema = new Schema<ISubscriptionFeatures>(
  {
    scanAndGo: { type: Boolean, default: true },
    clickAndCollect: { type: Boolean, default: false },
    mpesa: { type: Boolean, default: true },
    offers: { type: Boolean, default: false },
    analytics: { type: Boolean, default: false },
    multiStore: { type: Boolean, default: false },
  },
  { _id: false }
);

const subscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    active: { type: Boolean, default: true, index: true },
    trialDays: { type: Number, default: 14, min: 0 },
    gracePeriodDays: { type: Number, default: 7, min: 0 },
    maxStores: { type: Number, required: true, min: 1 },
    // Zero means unlimited. Limits are assessed over the subscription period.
    monthlyOrderLimit: { type: Number, default: 0, min: 0 },
    staffSeatLimit: { type: Number, default: 0, min: 0 },
    features: { type: subscriptionFeaturesSchema, required: true },
    pricing: {
      currency: { type: String, enum: ['KES'], default: 'KES' },
      monthlyAmountMinor: { type: Number, required: true, min: 0 },
      annualAmountMinor: { type: Number, required: true, min: 0 },
    },
  },
  { timestamps: true }
);

export default model<ISubscriptionPlan>('SubscriptionPlanCatalog', subscriptionPlanSchema);
