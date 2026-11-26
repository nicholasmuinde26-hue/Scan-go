import { Schema, model, Document, Types } from 'mongoose';

/**
 * A guest pass lets a shopper without an account (or a kiosk device) start a
 * Scan & Go visit. Issued either by staff ("guest card") or by a registered
 * KIOSK device. The plaintext token is shown once; only its sha256 is stored.
 * Redeeming a pass provisions a shadow guest User + StoreSession so the rest
 * of the pipeline (basket, order, payment, exit) works unchanged.
 */
export type GuestPassStatus = 'ACTIVE' | 'REDEEMED' | 'EXPIRED' | 'REVOKED';

export interface IGuestPass extends Document {
  passId: string; // public identifier printed/shown on the card
  tokenHash: string; // sha256 of the bearer token
  storeId: Types.ObjectId;
  trustTier: 1 | 2;
  label?: string;
  issuedByUserId?: Types.ObjectId;
  issuedByDeviceId?: string;
  guestUserId?: Types.ObjectId;
  status: GuestPassStatus;
  expiresAt: Date;
  redeemedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const guestPassSchema = new Schema<IGuestPass>(
  {
    passId: { type: String, required: true, unique: true, index: true },
    tokenHash: { type: String, required: true, select: false },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    trustTier: { type: Number, enum: [1, 2], default: 2 },
    label: String,
    issuedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    issuedByDeviceId: String,
    guestUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['ACTIVE', 'REDEEMED', 'EXPIRED', 'REVOKED'], default: 'ACTIVE', index: true },
    expiresAt: { type: Date, required: true },
    redeemedAt: Date,
    revokedAt: Date,
  },
  { timestamps: true }
);

guestPassSchema.index({ storeId: 1, status: 1, createdAt: -1 });

export default model<IGuestPass>('GuestPass', guestPassSchema);
