import { Schema, model, Document } from 'mongoose';
import { UserRole } from '../../shared/types/index.js';
import { Permission } from '../../middleware/auth.js';

export interface IUser extends Document {
  name: string;
  phone: string;
  email?: string;
  passwordHash: string;
  role: UserRole;
  storeId?: Schema.Types.ObjectId;
  organizationId?: Schema.Types.ObjectId;
  mustChangePassword?: boolean;
  tripsCompleted: number;
  totalSpentMinor: number;
  cleanTrips: number;
  confirmedDiscrepancies: number;
  // Permission overrides for Phase 5
  permissionOverrides?: {
    granted: Permission[];
    revoked: Permission[];
  };
  // Workspace switcher context for platform roles
  actingAsOrganizationId?: Schema.Types.ObjectId;
  actingAsStoreId?: Schema.Types.ObjectId;
  // MFA settings
  mfaEnabled?: boolean;
  mfaSecret?: string;
  mfaBackupCodes?: string[];
  // Time-limited "act as" sessions (for support leads)
  actAsSessions?: Array<{
    targetOrganizationId: Schema.Types.ObjectId;
    targetStoreId?: Schema.Types.ObjectId;
    reason: string;
    expiresAt: Date;
    createdAt: Date;
  }>;
  // Break-glass emergency access
  breakGlassAccess?: {
    active: boolean;
    reason: string;
    expiresAt: Date;
    grantedBy: Schema.Types.ObjectId;
    grantedAt: Date;
  };
  // Permission expiry (for temporary grants)
  permissionExpiry?: Date;
  // Account status
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  // Last activity tracking
  lastLoginAt?: Date;
  lastPasswordChangeAt?: Date;
  // Security & Session additions
  active?: boolean;
  failedLoginAttempts?: number;
  lockoutUntil?: Date;
  sessions?: Array<{
    sessionId: string;
    refreshTokenHash: string;
    userAgent?: string;
    ip?: string;
    createdAt: Date;
    lastActiveAt: Date;
    expiresAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true, index: true },
    email: { type: String, sparse: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: [
        // Platform roles
        'PLATFORM_OWNER',
        'PLATFORM_ADMIN',
        'FINANCE_ADMIN',
        'FINANCE_APPROVER',
        'SUPPORT_AGENT_TIER1',
        'SUPPORT_LEAD_TIER2',
        'RISK_FRAUD_ANALYST',
        'COMPLIANCE_AUDITOR',
        'PLATFORM_ENGINEER',
        'CUSTOMER_SUCCESS',
        // Organization roles
        'ORG_OWNER',
        'ORG_ADMIN',
        'FINANCE_OFFICER',
        'CATALOGUE_INVENTORY_MANAGER',
        'MARKETING_MANAGER',
        'LOSS_PREVENTION_MANAGER',
        'ORG_AUDITOR',
        // Branch roles
        'BRANCH_MANAGER',
        'STOCK_CONTROLLER',
        'SUPERVISOR',
        'CASHIER_CUSTOMER_SERVICE',
        'PICKER',
        'PACKER_VERIFIER',
        'EXIT_OFFICER',
        'DELIVERY_COLLECTION_HANDOVER',
        'CUSTOMER',
        // Legacy roles (for backward compatibility, will be migrated)
        'EXIT_STAFF',
        'STORE_MANAGER',
        'SYSTEM_ADMIN',
      ],
      default: 'CUSTOMER',
      required: true,
    },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
    mustChangePassword: { type: Boolean, default: false },
    tripsCompleted: { type: Number, default: 0 },
    totalSpentMinor: { type: Number, default: 0 },
    cleanTrips: { type: Number, default: 0 },
    confirmedDiscrepancies: { type: Number, default: 0 },
    permissionOverrides: {
      granted: [{ type: String }],
      revoked: [{ type: String }],
    },
    actingAsOrganizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
    actingAsStoreId: { type: Schema.Types.ObjectId, ref: 'Store' },
    // MFA settings
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String },
    mfaBackupCodes: [{ type: String }],
    // Time-limited "act as" sessions
    actAsSessions: [{
      targetOrganizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
      targetStoreId: { type: Schema.Types.ObjectId, ref: 'Store' },
      reason: { type: String, required: true },
      expiresAt: { type: Date, required: true },
      createdAt: { type: Date, default: Date.now },
    }],
    // Break-glass emergency access
    breakGlassAccess: {
      active: { type: Boolean, default: false },
      reason: { type: String },
      expiresAt: { type: Date },
      grantedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      grantedAt: { type: Date },
    },
    // Permission expiry
    permissionExpiry: { type: Date },
    // Account status
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'], default: 'ACTIVE' },
    active: { type: Boolean, default: true, index: true },
    failedLoginAttempts: { type: Number, default: 0 },
    lockoutUntil: { type: Date },
    sessions: [
      {
        sessionId: { type: String, required: true },
        refreshTokenHash: { type: String, required: true },
        userAgent: String,
        ip: String,
        createdAt: { type: Date, default: Date.now },
        lastActiveAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, required: true },
      },
    ],
    // Last activity tracking
    lastLoginAt: { type: Date },
    lastPasswordChangeAt: { type: Date },
  },
  { timestamps: true }
);

// Create indexes
userSchema.index({ organizationId: 1, role: 1 });
userSchema.index({ storeId: 1, role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ 'actAsSessions.expiresAt': 1 });
userSchema.index({ 'breakGlassAccess.expiresAt': 1 });
userSchema.index({ permissionExpiry: 1 });

export default model<IUser>('User', userSchema);