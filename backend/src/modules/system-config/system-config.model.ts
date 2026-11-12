import { Schema, model, Document } from 'mongoose';

export interface ISystemConfig extends Document {
  platformName: string;
  // Daraja secrets removed - use environment variables only
  // darajaConfig moved to ENV
  globalFraudDefaults: {
    randomAuditPercentage: number;
    largeBasketMinor: number;
    mediumBasketMinor: number;
    fullCheckBasketMinor: number;
    amberTimeoutSeconds: number;
    qrTokenLifetimeSeconds: number;
  };
  securityPolicies: {
    enforceStoreBoundaries: boolean;
    blockScreenshotsWithRotatingQr: boolean;
    strictDarajaVerification: boolean;
  };
  maintenanceMode: boolean;
  updatedBy?: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const systemConfigSchema = new Schema<ISystemConfig>(
  {
    platformName: { type: String, default: 'Scan & Go Retail Cloud' },
    // Daraja configuration removed - secrets are now in environment variables only
    globalFraudDefaults: {
      randomAuditPercentage: { type: Number, default: 5 },
      largeBasketMinor: { type: Number, default: 1000000 }, // KES 10,000
      mediumBasketMinor: { type: Number, default: 500000 },  // KES 5,000
      fullCheckBasketMinor: { type: Number, default: 1500000 }, // KES 15,000
      amberTimeoutSeconds: { type: Number, default: 15 },
      qrTokenLifetimeSeconds: { type: Number, default: 30 },
    },
    securityPolicies: {
      enforceStoreBoundaries: { type: Boolean, default: true },
      blockScreenshotsWithRotatingQr: { type: Boolean, default: true },
      strictDarajaVerification: { type: Boolean, default: true },
    },
    maintenanceMode: { type: Boolean, default: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default model<ISystemConfig>('SystemConfig', systemConfigSchema);
