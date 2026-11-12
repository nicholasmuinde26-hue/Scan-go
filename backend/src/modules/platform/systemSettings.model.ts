import { Schema, model, Document } from 'mongoose';

// Singleton document (key = 'global'). Holds platform-wide, NON-SECRET configuration.
// Secrets (JWT_SECRET, M-Pesa keys, HMAC secrets) must stay in environment variables, never in the database.
export interface ISystemSettings extends Document {
  key: string;
  platformName?: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  allowPublicRegistration: boolean;
  maxStoresPerOrg: number;
  announcement?: {
    active: boolean;
    message: string;
    level: 'INFO' | 'WARNING' | 'CRITICAL';
  };
  taxAndFees?: {
    vatPercentage: number;
    platformFeeType: 'FIXED' | 'PERCENT';
    platformFeeValue: number;
    bagFeeMinor: number;
  };
  featureFlags?: {
    scanAndGoEnabled: boolean;
    clickAndCollectEnabled: boolean;
    biometricVerification: boolean;
    autoReconcileSTK: boolean;
  };
  notificationTemplates?: {
    customerOtp: string;
    orderReceipt: string;
    pickupReady: string;
    fraudAlert: string;
  };
  defaultFraudConfig: Record<string, number>;
  defaultPickupSlots: { slotId: string; startTime: string; endTime: string; capacity: number; active: boolean }[];
  defaultExitLanes: { laneId: string; name: string; active: boolean }[];
  updatedBy?: Schema.Types.ObjectId;
}

const settingsSchema = new Schema<ISystemSettings>(
  {
    key: { type: String, default: 'global', unique: true },
    platformName: { type: String, default: 'Scan & Go Enterprise Retail Cloud' },
    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: { type: String, default: 'The system is under maintenance. Please try again shortly.' },
    allowPublicRegistration: { type: Boolean, default: true },
    maxStoresPerOrg: { type: Number, default: 10 },
    announcement: {
      active: { type: Boolean, default: false },
      message: { type: String, default: 'Scheduled platform maintenance window at midnight Sunday.' },
      level: { type: String, enum: ['INFO', 'WARNING', 'CRITICAL'], default: 'INFO' },
    },
    taxAndFees: {
      vatPercentage: { type: Number, default: 16 },
      platformFeeType: { type: String, enum: ['FIXED', 'PERCENT'], default: 'PERCENT' },
      platformFeeValue: { type: Number, default: 1.5 },
      bagFeeMinor: { type: Number, default: 1000 }, // KES 10
    },
    featureFlags: {
      scanAndGoEnabled: { type: Boolean, default: true },
      clickAndCollectEnabled: { type: Boolean, default: true },
      biometricVerification: { type: Boolean, default: false },
      autoReconcileSTK: { type: Boolean, default: true },
    },
    notificationTemplates: {
      customerOtp: {
        type: String,
        default: 'Your Scan & Go verification code is {{otp}}. Valid for 5 minutes. Do not share this code.',
      },
      orderReceipt: {
        type: String,
        default: 'Scan & Go receipt: Order #{{orderNumber}} of {{amount}} confirmed. Show exit token at gate.',
      },
      pickupReady: {
        type: String,
        default: 'Your Shop & Collect order #{{orderNumber}} is ready at {{storeName}}, slot {{slot}}. PIN: {{pin}}',
      },
      fraudAlert: {
        type: String,
        default: 'Exit discrepancy flagged at lane {{lane}}. Supervisor inspection initiated.',
      },
    },
    defaultFraudConfig: {
      type: Schema.Types.Mixed,
      default: {
        largeBasketMinor: 1000000,
        mediumBasketMinor: 500000,
        fullCheckBasketMinor: 1500000,
        maxItemsWithoutFullCheck: 25,
        manualEntryAmberThreshold: 4,
        randomAuditPercentage: 5,
        amberScoreThreshold: 30,
        amberFullScoreThreshold: 60,
        amberTimeoutSeconds: 15,
      },
    },
    defaultPickupSlots: [
      {
        slotId: { type: String, required: true },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        capacity: { type: Number, default: 20 },
        active: { type: Boolean, default: true },
      },
    ],
    defaultExitLanes: [
      {
        laneId: { type: String, required: true },
        name: { type: String, required: true },
        active: { type: Boolean, default: true },
      },
    ],
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const SystemSettings = model<ISystemSettings>('SystemSettings', settingsSchema);

// Tiny in-memory cache so the maintenance gate doesn't hit Mongo on every request.
let cache: { value: ISystemSettings; at: number } | null = null;

export async function getSettings(): Promise<ISystemSettings> {
  if (cache && Date.now() - cache.at < 10_000) return cache.value;
  const value = await SystemSettings.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: { key: 'global' } },
    { upsert: true, new: true }
  );
  cache = { value: value!, at: Date.now() };
  return value!;
}

const EDITABLE = [
  'platformName',
  'maintenanceMode',
  'maintenanceMessage',
  'allowPublicRegistration',
  'maxStoresPerOrg',
  'announcement',
  'taxAndFees',
  'featureFlags',
  'notificationTemplates',
  'defaultFraudConfig',
  'defaultPickupSlots',
  'defaultExitLanes',
] as const;

export async function updateSettings(patch: Record<string, any>, userId?: string): Promise<ISystemSettings> {
  const $set: Record<string, any> = { updatedBy: userId };
  for (const k of EDITABLE) if (patch[k] !== undefined) $set[k] = patch[k];
  const value = await SystemSettings.findOneAndUpdate({ key: 'global' }, { $set }, { upsert: true, new: true });
  cache = { value: value!, at: Date.now() };
  return value!;
}

export default SystemSettings;
