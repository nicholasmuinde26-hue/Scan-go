// Mapping between Role and Permission
import { Schema, model, Document, Types } from 'mongoose';

export interface IRolePermission extends Document {
  roleId: Types.ObjectId;
  permissionId: Types.ObjectId;
}

const RolePermissionSchema = new Schema<IRolePermission>({
  roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
  permissionId: { type: Schema.Types.ObjectId, ref: 'Permission', required: true },
});

// Ensure a role can be linked to a permission only once
RolePermissionSchema.index({ roleId: 1, permissionId: 1 }, { unique: true });

export const RolePermission = model<IRolePermission>('RolePermission', RolePermissionSchema);
