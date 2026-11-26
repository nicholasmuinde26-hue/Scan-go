// Role model – defines a canonical role name and optional description
import { Schema, model, Document } from 'mongoose';

export interface IRole extends Document {
  name: string; // e.g. 'BRANCH_MANAGER'
  description?: string;
  // true for platform‑level roles (PLATFORM_OWNER, PLATFORM_ADMIN)
  isPlatform?: boolean;
}

const RoleSchema = new Schema<IRole>({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  isPlatform: { type: Boolean, default: false },
});

export const Role = model<IRole>('Role', RoleSchema);
