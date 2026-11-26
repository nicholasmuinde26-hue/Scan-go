// Permission model – single capability token
import { Schema, model, Document } from 'mongoose';

export interface IPermission extends Document {
  key: string; // e.g. 'staff:manage'
  description?: string;
}

const PermissionSchema = new Schema<IPermission>({
  key: { type: String, required: true, unique: true },
  description: { type: String },
});

export const Permission = model<IPermission>('Permission', PermissionSchema);
