import crypto from 'crypto';
import { Schema, model, Document } from 'mongoose';

export interface IPresenceTierPolicy {
  enabled: boolean;
  requireSoftSignal: boolean; // at least one of GPS or Wi-Fi must pass
  maxBasketMinor: number; // 0 means no limit
  maxItems: number; // 0 means no limit
  auditPercentage: number; // random spot-check rate (%) applied at exit for this tier
}

export interface IStore extends Document {
  name: string;
  code: string;
  location: string;
  active: boolean;
  organizationId?: Schema.Types.ObjectId;
  regionId?: Schema.Types.ObjectId;
  managerId?: Schema.Types.ObjectId;
  openHours?: {
    openingTime: string;
    closingTime: string;
    daysDescription: string;
  };
  mpesaConfig?: {
    shortcode?: string;
    tillNumber?: string;
    storeIdentifier?: string;
  };
  pickupSlots: {
    slotId: string;
    startTime: string;
    endTime: string;
    capacity: number;
    active: boolean;
  }[];
  exitLanes: {
    laneId: string;
    name: string;
    active: boolean;
  }[];
  fraudConfig: {
    largeBasketMinor: number; // e.g. 1,000,000 (KES 10,000)
    mediumBasketMinor: number; // e.g. 500,000 (KES 5,000)
    fullCheckBasketMinor: number; // e.g. 1,500,000 (KES 15,000)
    maxItemsWithoutFullCheck: number; // e.g. 25
    manualEntryAmberThreshold: number; // e.g. 4
    randomAuditPercentage: number; // e.g. 5%
    amberScoreThreshold: number; // e.g. 30
    amberFullScoreThreshold: number; // e.g. 60
    amberTimeoutSeconds: number; // e.g. 15s staff time limit for AMBER inspection
  };
  // --- In-store presence (pilot: printed QR posters plus soft signals) ---
  // GeoJSON point (longitude first) of the store entrance; indexed 2dsphere. Not set until the manager configures it.
  geo?: { type: 'Point'; coordinates: [number, number] };
  geoRadiusMetres?: number;
  // Per-store secret used to sign poster codes. Rotating it invalidates every printed poster at once. Never returned by default.
  entrySecret?: string;
  // Public IP addresses of the store Wi-Fi, for the optional Wi-Fi soft signal. Never returned by default.
  allowedPublicIps?: string[];
  presencePolicy?: {
    enforced: boolean; // when false, Scan & Go baskets can be created without a store session
    sessionTtlMinutes: number; // clamped to 120-240
    maxGpsAccuracyMetres: number;
    tier1: IPresenceTierPolicy;
    tier2: IPresenceTierPolicy;
  };
  variableMeasureBarcode?: {
    enabled: boolean;
    prefix: string;
    pluStart: number;
    pluLength: number;
    valueStart: number;
    valueLength: number;
    valueType: 'PRICE' | 'WEIGHT';
    scaleId: string;
    storeCodeStart?: number;
    storeCodeLength?: number;
    internalCheckDigitIndex?: number;
    internalCheckAlgorithm?: 'MOD10' | 'LUHN';
    toleranceMinor?: number;
    toleranceGrams?: number;
    exitWeightToleranceGrams?: number;
  };
}

const storeSchema = new Schema<IStore>(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    location: { type: String, required: true },
    active: { type: Boolean, default: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
    regionId: { type: Schema.Types.ObjectId, ref: 'Region' },
    managerId: { type: Schema.Types.ObjectId, ref: 'User' },
    openHours: {
      openingTime: { type: String, default: '08:00' },
      closingTime: { type: String, default: '21:00' },
      daysDescription: { type: String, default: 'Mon - Sun' },
    },
    mpesaConfig: {
      shortcode: { type: String, default: '' },
      tillNumber: { type: String, default: '' },
      storeIdentifier: { type: String, default: '' },
    },
    pickupSlots: [
      {
        slotId: { type: String, required: true },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        capacity: { type: Number, default: 20 },
        active: { type: Boolean, default: true },
      },
    ],
    exitLanes: [
      {
        laneId: { type: String, required: true },
        name: { type: String, required: true },
        active: { type: Boolean, default: true },
      },
    ],
    fraudConfig: {
      largeBasketMinor: { type: Number, default: 1000000 },
      mediumBasketMinor: { type: Number, default: 500000 },
      fullCheckBasketMinor: { type: Number, default: 1500000 },
      maxItemsWithoutFullCheck: { type: Number, default: 25 },
      manualEntryAmberThreshold: { type: Number, default: 4 },
      randomAuditPercentage: { type: Number, default: 5 },
      amberScoreThreshold: { type: Number, default: 30 },
      amberFullScoreThreshold: { type: Number, default: 60 },
      amberTimeoutSeconds: { type: Number, default: 15 },
    },
    geo: {
      type: new Schema(
        {
          type: { type: String, enum: ['Point'], required: true },
          coordinates: { type: [Number], required: true },
        },
        { _id: false }
      ),
    },
    geoRadiusMetres: { type: Number, default: 150, min: 20, max: 2000 },
    entrySecret: { type: String, select: false, default: () => crypto.randomBytes(32).toString('hex') },
    allowedPublicIps: { type: [String], select: false, default: [] },
    presencePolicy: {
      enforced: { type: Boolean, default: true },
      sessionTtlMinutes: { type: Number, default: 180, min: 120, max: 240 },
      maxGpsAccuracyMetres: { type: Number, default: 100, min: 10, max: 500 },
      tier1: {
        enabled: { type: Boolean, default: true },
        requireSoftSignal: { type: Boolean, default: true },
        maxBasketMinor: { type: Number, default: 0, min: 0 },
        maxItems: { type: Number, default: 0, min: 0 },
        auditPercentage: { type: Number, default: 5, min: 0, max: 100 },
      },
      tier2: {
        enabled: { type: Boolean, default: true },
        requireSoftSignal: { type: Boolean, default: true },
        maxBasketMinor: { type: Number, default: 500000, min: 0 }, // KES 5,000
        maxItems: { type: Number, default: 20, min: 0 },
        auditPercentage: { type: Number, default: 20, min: 0, max: 100 },
      },
    },
    variableMeasureBarcode: {
      enabled: { type: Boolean, default: false },
      prefix: { type: String, default: '' },
      pluStart: { type: Number, default: 2 },
      pluLength: { type: Number, default: 4 },
      valueStart: { type: Number, default: 6 },
      valueLength: { type: Number, default: 5 },
      valueType: { type: String, enum: ['PRICE', 'WEIGHT'], default: 'PRICE' },
      scaleId: { type: String, default: '' },
      storeCodeStart: Number,
      storeCodeLength: Number,
      internalCheckDigitIndex: Number,
      internalCheckAlgorithm: { type: String, enum: ['MOD10', 'LUHN'], default: 'MOD10' },
      toleranceMinor: { type: Number, default: 2 },
      toleranceGrams: { type: Number, default: 5 },
      exitWeightToleranceGrams: { type: Number, default: 20 },
    },
  },
  { timestamps: true }
);

storeSchema.index({ geo: '2dsphere' });

export default model<IStore>('Store', storeSchema);
