// User‑role assignment with optional scope fields
import { Schema, model, Document, Types } from 'mongoose';

export interface IUserRoleAssignment extends Document {
  userId: Types.ObjectId;
  roleId: Types.ObjectId;
  // Scope – at least organizationId is required for any assignment
  organizationId: Types.ObjectId;
  storeId?: Types.ObjectId;      // branch level
  regionId?: Types.ObjectId;     // region level (optional)
  departmentId?: Types.ObjectId; // department level (optional)
}

const UserRoleAssignmentSchema = new Schema<IUserRoleAssignment>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
  regionId: { type: Schema.Types.ObjectId, ref: 'Region' },
  departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
});

// A user can have multiple assignments, but the same (user,role,scope) combo must be unique
UserRoleAssignmentSchema.index(
  { userId: 1, roleId: 1, organizationId: 1, storeId: 1, regionId: 1, departmentId: 1 },
  { unique: true },
);

export const UserRoleAssignment = model<IUserRoleAssignment>('UserRoleAssignment', UserRoleAssignmentSchema);
