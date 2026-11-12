import { Schema, model, Document } from 'mongoose';

export enum PayoutStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface IPayout extends Document {
  storeId: Schema.Types.ObjectId;
  organizationId: Schema.Types.ObjectId;
  amountMinor: number;
  status: PayoutStatus;
  requestedBy: Schema.Types.ObjectId;
  approvedBy?: Schema.Types.ObjectId;
  approvedAt?: Date;
  referenceNumber?: string;
  bankDetails?: {
    accountName: string;
    accountNumber: string;
    bankCode: string;
    branch: string;
  };
  mpesaPhoneNumber?: string;
  failureReason?: string;
  ledgerEntryIds: Schema.Types.ObjectId[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const payoutSchema = new Schema<IPayout>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    amountMinor: { type: Number, required: true, min: 0 },
    status: { 
      type: String, 
      enum: Object.values(PayoutStatus),
      default: PayoutStatus.PENDING 
    },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    referenceNumber: { type: String, unique: true, sparse: true },
    bankDetails: {
      accountName: String,
      accountNumber: String,
      bankCode: String,
      branch: String,
    },
    mpesaPhoneNumber: String,
    failureReason: String,
    ledgerEntryIds: [{ type: Schema.Types.ObjectId, ref: 'LedgerEntry' }],
    notes: String,
  },
  { timestamps: true }
);

payoutSchema.index({ storeId: 1, status: 1 });
payoutSchema.index({ organizationId: 1, status: 1 });
payoutSchema.index({ status: 1, createdAt: -1 });

export default model<IPayout>('Payout', payoutSchema);
