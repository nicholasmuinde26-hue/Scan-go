import { Schema, model, Document } from 'mongoose';

export interface IApiKey extends Document {
  name: string;
  keyPrefix: string;
  keyHash: string;
  permissions: string[];
  organizationId?: Schema.Types.ObjectId;
  storeId?: Schema.Types.ObjectId;
  rateLimitPerMin: number;
  active: boolean;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdBy?: Schema.Types.ObjectId;
  createdByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const apiKeySchema = new Schema<IApiKey>(
  {
    name: { type: String, required: true },
    keyPrefix: { type: String, required: true, index: true },
    keyHash: { type: String, required: true },
    permissions: [{ type: String }],
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
    rateLimitPerMin: { type: Number, default: 120 },
    active: { type: Boolean, default: true, index: true },
    lastUsedAt: Date,
    expiresAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: String,
  },
  { timestamps: true }
);

export default model<IApiKey>('ApiKey', apiKeySchema);
