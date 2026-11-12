import { Schema, model, Document } from 'mongoose';

export interface IOnboardingApplication extends Document {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  branchCountEstimate: number;
  location: string;
  notes?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedBy?: Schema.Types.ObjectId;
  reviewedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const onboardingApplicationSchema = new Schema<IOnboardingApplication>(
  {
    companyName: { type: String, required: true },
    contactName: { type: String, required: true },
    contactEmail: { type: String, required: true },
    contactPhone: { type: String, required: true, index: true },
    branchCountEstimate: { type: Number, default: 1 },
    location: { type: String, required: true },
    notes: String,
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    rejectionReason: String,
  },
  { timestamps: true }
);

export default model<IOnboardingApplication>('OnboardingApplication', onboardingApplicationSchema);
