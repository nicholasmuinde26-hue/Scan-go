import { Schema, model, Document } from 'mongoose';

export enum ApprovalType {
  PAYOUT_REQUEST = 'PAYOUT_REQUEST',
  FEE_CHANGE = 'FEE_CHANGE',
  ORG_SUSPENSION = 'ORG_SUSPENSION',
  PLATFORM_ADMIN_CREATE = 'PLATFORM_ADMIN_CREATE',
  BULK_EXPORT = 'BULK_EXPORT',
  ROLE_GRANT_ADMIN = 'ROLE_GRANT_ADMIN',
  PAYOUT_APPROVAL = 'PAYOUT_APPROVAL',
  REFUND_REQUEST = 'REFUND_REQUEST',
  VOID_ORDER = 'VOID_ORDER',
  PRICE_OVERRIDE = 'PRICE_OVERRIDE',
  INVENTORY_CHANGE = 'INVENTORY_CHANGE',
  PRODUCT_REGISTRATION = 'PRODUCT_REGISTRATION',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export interface IApproval extends Document {
  type: ApprovalType;
  status: ApprovalStatus;
  requestedBy: Schema.Types.ObjectId;
  requestedByRole: string;
  requestedByName: string;
  approvedBy?: Schema.Types.ObjectId;
  approvedByRole?: string;
  approvedByName?: string;
  approvedAt?: Date;
  rejectedBy?: Schema.Types.ObjectId;
  rejectedByRole?: string;
  rejectedByName?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  // Target entity (what this approval is for)
  targetType: 'ORGANIZATION' | 'USER' | 'STORE' | 'PAYOUT' | 'SYSTEM' | 'EXPORT' | 'PRODUCT';
  targetId: Schema.Types.ObjectId;
  // The change data (before/after values or action details)
  requestData: Record<string, any>;
  // Approval constraints
  requiresSecondFactor: boolean;
  expiresAt: Date;
  // Comments/notes
  notes?: string;
  // Separation of duties: creator cannot approve their own request
  creatorCanApprove: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const approvalSchema = new Schema<IApproval>(
  {
    type: {
      type: String,
      enum: Object.values(ApprovalType),
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(ApprovalStatus),
      default: ApprovalStatus.PENDING,
      required: true,
      index: true,
    },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByRole: { type: String, required: true },
    requestedByName: { type: String, required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedByRole: { type: String },
    approvedByName: { type: String },
    approvedAt: { type: Date },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedByRole: { type: String },
    rejectedByName: { type: String },
    rejectedAt: { type: Date },
    rejectionReason: { type: String },
    targetType: {
      type: String,
      enum: ['ORGANIZATION', 'USER', 'STORE', 'PAYOUT', 'SYSTEM', 'EXPORT', 'PRODUCT'],
      required: true,
    },
    targetId: { type: Schema.Types.ObjectId, required: true },
    requestData: { type: Schema.Types.Mixed, required: true },
    requiresSecondFactor: { type: Boolean, default: true },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      index: true,
    },
    notes: { type: String },
    creatorCanApprove: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

approvalSchema.index({ type: 1, status: 1 });
approvalSchema.index({ requestedBy: 1, status: 1 });
approvalSchema.index({ targetType: 1, targetId: 1 });

// Auto-expire pending approvals
approvalSchema.index({ expiresAt: 1, status: 1 }, {
  partialFilterExpression: { status: ApprovalStatus.PENDING },
});

export default model<IApproval>('Approval', approvalSchema);