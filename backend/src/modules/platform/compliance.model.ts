import { Schema, model, Document } from 'mongoose';

export interface IRetentionRequest extends Document {
  customerPhone: string;
  customerName?: string;
  customerId?: Schema.Types.ObjectId;
  requestType: 'FORGET_ME' | 'DATA_EXPORT' | 'CONSENT_REVOCATION';
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  reason?: string;
  reviewedBy?: Schema.Types.ObjectId;
  reviewedByName?: string;
  processedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const retentionRequestSchema = new Schema<IRetentionRequest>(
  {
    customerPhone: { type: String, required: true, index: true },
    customerName: String,
    customerId: { type: Schema.Types.ObjectId, ref: 'User' },
    requestType: {
      type: String,
      enum: ['FORGET_ME', 'DATA_EXPORT', 'CONSENT_REVOCATION'],
      default: 'FORGET_ME',
    },
    status: {
      type: String,
      enum: ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED'],
      default: 'PENDING_REVIEW',
      index: true,
    },
    reason: String,
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedByName: String,
    processedAt: Date,
    notes: String,
  },
  { timestamps: true }
);

export default model<IRetentionRequest>('RetentionRequest', retentionRequestSchema);
