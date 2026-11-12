import { Schema, model, Document, Types } from 'mongoose';

/**
 * One printed poster. The QR on the poster carries only a signed code that identifies this record.
 * The tier, store and limits are always decided by the server from this record, never by the URL.
 */
export interface IEntryPoint extends Document {
  storeId: Types.ObjectId;
  label: string; // e.g. "Main entrance", "Aisle 4 poster"
  tier: 1 | 2;
  active: boolean;
  createdBy?: Types.ObjectId;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const entryPointSchema = new Schema<IEntryPoint>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    tier: { type: Number, enum: [1, 2], required: true },
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    revokedAt: Date,
  },
  { timestamps: true }
);

export default model<IEntryPoint>('EntryPoint', entryPointSchema);
