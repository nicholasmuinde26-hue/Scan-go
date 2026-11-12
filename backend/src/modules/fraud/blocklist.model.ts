import { Schema, model, Document } from 'mongoose';

export interface IBlocklistEntry extends Document {
  identifier: string; // phone number or national ID
  type: 'PHONE' | 'NATIONAL_ID' | 'DEVICE_ID';
  name?: string;
  reason: string;
  riskScore: number;
  addedBy?: Schema.Types.ObjectId;
  addedByName: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const blocklistSchema = new Schema<IBlocklistEntry>(
  {
    identifier: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ['PHONE', 'NATIONAL_ID', 'DEVICE_ID'], default: 'PHONE' },
    name: String,
    reason: { type: String, required: true },
    riskScore: { type: Number, default: 90 },
    addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    addedByName: { type: String, default: 'System Security' },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export default model<IBlocklistEntry>('BlocklistEntry', blocklistSchema);
