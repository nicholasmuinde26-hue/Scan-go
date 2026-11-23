import { Schema, model, Document } from 'mongoose';
import { Permission } from '../../middleware/auth.js';

// Optional organizational layers inside a supermarket. A small shop simply
// never creates these; a chain uses them to group branches and staff.

export interface IRegion extends Document {
  organizationId: Schema.Types.ObjectId;
  name: string;
  code: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const regionSchema = new Schema<IRegion>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
regionSchema.index({ organizationId: 1, code: 1 }, { unique: true });
export const Region = model<IRegion>('Region', regionSchema);

export interface IDepartment extends Document {
  organizationId: Schema.Types.ObjectId;
  name: string;
  code: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const departmentSchema = new Schema<IDepartment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
departmentSchema.index({ organizationId: 1, code: 1 }, { unique: true });
export const Department = model<IDepartment>('Department', departmentSchema);

// Org-defined job roles. Permissions are bounded by the same ceiling that
// applies to built-in roles (filterGrantablePermissions), so a custom role can
// never exceed what the org scope is allowed to hold.
export interface ICustomRole extends Document {
  organizationId: Schema.Types.ObjectId;
  name: string;
  description?: string;
  scope: 'ORG' | 'BRANCH' | 'REGION';
  permissions: Permission[];
  active: boolean;
  createdBy?: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const customRoleSchema = new Schema<ICustomRole>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    scope: { type: String, enum: ['ORG', 'BRANCH', 'REGION'], required: true },
    permissions: [{ type: String }],
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
customRoleSchema.index({ organizationId: 1, name: 1 }, { unique: true });
export const CustomRole = model<ICustomRole>('CustomRole', customRoleSchema);
