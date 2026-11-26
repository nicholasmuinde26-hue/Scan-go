import { Schema, model, Document } from 'mongoose';
import Store from '../stores/store.model.js';

// An Organization is a "workspace": one supermarket company (e.g. Naivas) that owns many store branches.
export enum OrganizationStatus {
  ACTIVE = 'ACTIVE',
  GRACE = 'GRACE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export interface IOrganization extends Document {
  name: string;
  slug: string;
  status: OrganizationStatus;
  verificationStatus?: 'VERIFIED' | 'PENDING_VERIFICATION' | 'REJECTED';
  isArchived?: boolean;
  contactEmail?: string;
  contactPhone?: string;
  contactPerson?: string;
  maxStores?: number;
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    receiptFooter?: string;
  };
  featureFlags?: {
    scanAndGo?: boolean;
    pickup?: boolean;
    advancedFraud?: boolean;
    biometrics?: boolean;
  };
  createdBy?: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>(
  {
    // existing fields ...

    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: Object.values(OrganizationStatus), default: OrganizationStatus.ACTIVE, index: true },
    verificationStatus: {
      type: String,
      enum: ['VERIFIED', 'PENDING_VERIFICATION', 'REJECTED'],
      default: 'VERIFIED',
    },
    isArchived: { type: Boolean, default: false, index: true },
    contactEmail: String,
    contactPhone: String,
    contactPerson: String,
    maxStores: Number,
    branding: {
      logoUrl: String,
      primaryColor: { type: String, default: '#059669' },
      receiptFooter: String,
    },
    featureFlags: {
      scanAndGo: { type: Boolean, default: true },
      pickup: { type: Boolean, default: true },
      advancedFraud: { type: Boolean, default: true },
      biometrics: { type: Boolean, default: false },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Post‑save hook – ensure every organization has at least one default branch
organizationSchema.post('save', async function (doc) {
  const existing = await Store.findOne({ organizationId: doc._id }).lean();
  if (!existing) {
    await Store.create({
      name: 'Default Branch',
      code: `DEF-${doc.slug}`,
      location: 'Headquarters',
      organizationId: doc._id,
    });
  }
});

export default model<IOrganization>('Organization', organizationSchema);
