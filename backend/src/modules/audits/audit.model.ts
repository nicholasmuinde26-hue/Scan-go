import { Schema, model, Document } from 'mongoose';
import crypto from 'crypto';

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
  // Cryptographic chaining fields
  prevHash: string;
  hash: string;
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
    // chaining fields (filled in pre‑save hook)
    prevHash: { type: String, default: '' },
    hash: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Runs at pre('validate') — before schema validation — because `hash` is a
// required field and must exist by the time validators run. pre('save') would
// be too late: validation happens first and rejects docs with no hash.
auditLogSchema.pre('validate', async function (next) {
  const doc: any = this;
  // Fetch most recent audit entry (excluding the one being saved)
  const last = await (doc.constructor as any).findOne({}).sort({ createdAt: -1 }).lean();
  const previousHash = last?.hash ?? '';
  doc.prevHash = previousHash;
  const payload = JSON.stringify({
    actorId: doc.actorId?.toString(),
    actorRole: doc.actorRole,
    actorName: doc.actorName,
    action: doc.action,
    entityType: doc.entityType,
    entityId: doc.entityId,
    storeId: doc.storeId?.toString(),
    previousValue: doc.previousValue,
    newValue: doc.newValue,
    details: doc.details,
    reason: doc.reason,
    ipAddress: doc.ipAddress,
    createdAt: doc.createdAt?.toISOString(),
    prevHash: previousHash,
  });
  doc.hash = crypto.createHash('sha256').update(payload).digest('hex');
  next();
});

export default model<IAuditLog>('AuditLog', auditLogSchema);
