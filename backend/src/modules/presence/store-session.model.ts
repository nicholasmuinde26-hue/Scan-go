import { Schema, model, Document, Types } from 'mongoose';

/**
 * How the shopper proved they are physically inside the store.
 * - STATIC_QR_GPS / STATIC_QR_WIFI / STATIC_QR_ONLY are used by the pilot (printed posters).
 * - ROTATING_QR and STAFF_ISSUED_HANDHELD are reserved for the production design and are not issued yet.
 */
export type PresenceMethod =
  | 'ROTATING_QR'
  | 'STATIC_QR_GPS'
  | 'STATIC_QR_WIFI'
  | 'STATIC_QR_ONLY'
  | 'STAFF_ISSUED_HANDHELD'
  | 'KIOSK';

export type SessionEndReason = 'PAID_AND_EXITED' | 'EXPIRED' | 'STAFF_ENDED' | 'REPLACED';

export interface IStoreSession extends Document {
  userId: Types.ObjectId;
  storeId: Types.ObjectId;
  entryPointId?: Types.ObjectId;
  deviceId: string;
  trustTier: 1 | 2;
  presenceMethod: PresenceMethod;
  // Only whether each soft signal passed is kept. Raw coordinates are never stored.
  softSignals: { gps: boolean; wifi: boolean };
  status: 'ACTIVE' | 'ENDED';
  expiresAt: Date;
  // Sliding-renewal bookkeeping: expiresAt moves forward on activity, but never
  // past createdAt + SESSION_HARD_CAP_HOURS, so a session can't live forever.
  ttlMinutes: number;
  lastActivityAt?: Date;
  activityCount: number;
  endedAt?: Date;
  endReason?: SessionEndReason;
  endedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const storeSessionSchema = new Schema<IStoreSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    entryPointId: { type: Schema.Types.ObjectId, ref: 'EntryPoint' },
    deviceId: { type: String, default: 'WEB_CLIENT' },
    trustTier: { type: Number, enum: [1, 2], required: true },
    presenceMethod: {
      type: String,
      enum: ['ROTATING_QR', 'STATIC_QR_GPS', 'STATIC_QR_WIFI', 'STATIC_QR_ONLY', 'STAFF_ISSUED_HANDHELD', 'KIOSK'],
      required: true,
    },
    softSignals: {
      gps: { type: Boolean, default: false },
      wifi: { type: Boolean, default: false },
    },
    status: { type: String, enum: ['ACTIVE', 'ENDED'], default: 'ACTIVE' },
    expiresAt: { type: Date, required: true },
    ttlMinutes: { type: Number, required: true },
    lastActivityAt: Date,
    activityCount: { type: Number, default: 0 },
    endedAt: Date,
    endReason: { type: String, enum: ['PAID_AND_EXITED', 'EXPIRED', 'STAFF_ENDED', 'REPLACED'] },
    endedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// One active session per user at a time, enforced by the database and not only by application code.
storeSessionSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' }, name: 'one_active_session_per_user' }
);
storeSessionSchema.index({ status: 1, expiresAt: 1 });

export default model<IStoreSession>('StoreSession', storeSessionSchema);
