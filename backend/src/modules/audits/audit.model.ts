import { Schema, model, Document } from 'mongoose';

export interface IAuditLog extends Document {
  actorId?: Schema.Types.ObjectId;
  actorRole?: string;
  actorName?: string;
  action: string;
  entityType: 'BASKET' | 'ORDER' | 'PAYMENT' | 'PICKING' | 'EXIT' | 'DISCREPANCY' | 'PRODUCT' | 'STORE' | 'SYSTEM_CONFIG' | 'ORGANIZATION' | 'SUBSCRIPTION' | 'USER' | 'SYSTEM';
  entityId: string;
  storeId?: Schema.Types.ObjectId;
  previousValue?: any;
  newValue?: any;
  details?: any;
  reason?: string;
  ipAddress?: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorRole: String,
    actorName: String,
    action: { type: String, required: true, index: true },
    entityType: {
      type: String,
      enum: ['BASKET', 'ORDER', 'PAYMENT', 'PICKING', 'EXIT', 'DISCREPANCY', 'PRODUCT', 'STORE', 'SYSTEM_CONFIG', 'ORGANIZATION', 'SUBSCRIPTION', 'USER', 'SYSTEM'],
      required: true,
      index: true,
    },
    entityId: { type: String, required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
    previousValue: Schema.Types.Mixed,
    newValue: Schema.Types.Mixed,
    details: Schema.Types.Mixed,
    reason: String,
    ipAddress: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default model<IAuditLog>('AuditLog', auditLogSchema);
