import { Schema, model, Document } from 'mongoose';
import { UserRole } from '../../shared/types/index.js';

export interface IInvite extends Document {
  tokenHash: string;
  role: UserRole;
  organizationId?: Schema.Types.ObjectId;
  storeId?: Schema.Types.ObjectId;
  phone: string;
  email?: string;
  name: string;
  invitedBy: Schema.Types.ObjectId;
  expiresAt: Date;
  usedAt?: Date;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  createdAt: Date;
  updatedAt: Date;
}

const inviteSchema = new Schema<IInvite>(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    role: { type: String, required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
    phone: { type: String, required: true, index: true },
    email: { type: String, sparse: true },
    name: { type: String, required: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date },
    status: {
      type: String,
      enum: ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'],
      default: 'PENDING',
      index: true,
    },
  },
  { timestamps: true }
);

export default model<IInvite>('Invite', inviteSchema);
