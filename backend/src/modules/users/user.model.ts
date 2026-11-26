import { Schema, model, Document } from 'mongoose';
import { UserRole } from '../../shared/types/index.js';
import { Permission } from '../../middleware/auth.js';

export interface IStaffAssignment {
  storeId?: Schema.Types.ObjectId;
  departmentId?: Schema.Types.ObjectId;
  role: UserRole;
  employeeId?: string;
  reportsTo?: Schema.Types.ObjectId;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: Date;
}

export interface IUser extends Document {
  name: string;
  phone: string;
  email?: string;
  googleId?: string;
  avatarUrl?: string;
  passwordHash: string;
  role: UserRole;
  storeId?: Schema.Types.ObjectId;
  organizationId?: Schema.Types.ObjectId;
  // Multi-branch / multi-org scoping. Empty arrays mean "unrestricted within scope rules"
  // only for platform roles; for REGION_MANAGER/BRANCH_MANAGER an empty list falls back
  // to storeId (branch) or denies store access (region must always list stores).
  managedStoreIds?: Schema.Types.ObjectId[];
  managedOrganizationIds?: Schema.Types.ObjectId[];
  // Org-structure fields (optional): employee number, department, reporting line.
  employeeId?: string;
  jobTitle?: string;
  departmentId?: Schema.Types.ObjectId;
  reportsTo?: Schema.Types.ObjectId;
  // Additional branch/department assignments beyond the home storeId+role.
  assignments?: IStaffAssignment[];
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
  status: 'ACTIVE' | 'SUSPENDED' | 'ON_LEAVE' | 'DEACTIVATED';
  // Shadow account created by a guest pass/kiosk — can transact via the guest
  // token but has no password login and should be hidden from staff directories.
  isGuest?: boolean;
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
  deviceTokens?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true, index: true },
    email: { type: String, sparse: true },
    googleId: { type: String, sparse: true, index: true },
    avatarUrl: { type: String },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: [
        // Platform roles
        'PLATFORM_OWNER',
        'PLATFORM_ADMIN',
        'PLATFORM_SUBADMIN',
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
        'GENERAL_MANAGER',
        'FINANCE_OFFICER',
        'CATALOGUE_INVENTORY_MANAGER',
        'MARKETING_MANAGER',
        'LOSS_PREVENTION_MANAGER',
        'ORG_AUDITOR',
        // Branch roles
        'REGION_MANAGER',
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
    managedStoreIds: [{ type: Schema.Types.ObjectId, ref: 'Store' }],
    managedOrganizationIds: [{ type: Schema.Types.ObjectId, ref: 'Organization' }],
    employeeId: { type: String, trim: true },
    jobTitle: { type: String, trim: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
    reportsTo: { type: Schema.Types.ObjectId, ref: 'User' },
    assignments: [{
      storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
      departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
      role: { type: String },
      employeeId: { type: String },
      reportsTo: { type: Schema.Types.ObjectId, ref: 'User' },
      status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE' },
      createdAt: { type: Date, default: Date.now },
    }],
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
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'ON_LEAVE', 'DEACTIVATED'], default: 'ACTIVE' },
    isGuest: { type: Boolean, default: false },
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
    deviceTokens: { type: [String], default: [] },
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
