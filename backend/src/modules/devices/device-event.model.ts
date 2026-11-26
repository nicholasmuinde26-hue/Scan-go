import { Schema, model, Document, Types } from 'mongoose';

/**
 * Immutable log of every event a registered device reports. Events carry a
 * client-supplied `eventId` so retries over flaky store networks are
 * idempotent — the same physical scan can never be applied twice.
 */
export type DeviceEventType =
  | 'HEARTBEAT'
  | 'BASKET_BOUND'
  | 'BASKET_UNBOUND'
  | 'PRODUCT_SCAN'
  | 'ITEM_REMOVED'
  | 'QUANTITY_CHANGE'
  | 'WEIGHT_READING'
  | 'RFID_READ'
  | 'CAMERA_OBSERVATION'
  | 'SCALE_LABEL'
  | 'ERROR';

export type DeviceEventStatus = 'RECEIVED' | 'APPLIED' | 'REJECTED' | 'DUPLICATE';

export interface IDeviceEvent extends Document {
  eventId: string;
  deviceId: string;
  storeId: Types.ObjectId;
  type: DeviceEventType;
  sessionId?: Types.ObjectId;
  basketId?: Types.ObjectId;
  payload: Record<string, any>;
  occurredAt: Date;
  status: DeviceEventStatus;
  result?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const deviceEventSchema = new Schema<IDeviceEvent>(
  {
    eventId: { type: String, required: true },
    deviceId: { type: String, required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    type: {
      type: String,
      enum: ['HEARTBEAT', 'BASKET_BOUND', 'BASKET_UNBOUND', 'PRODUCT_SCAN', 'ITEM_REMOVED', 'QUANTITY_CHANGE', 'WEIGHT_READING', 'RFID_READ', 'CAMERA_OBSERVATION', 'SCALE_LABEL', 'ERROR'],
      required: true,
      index: true,
    },
    sessionId: { type: Schema.Types.ObjectId, ref: 'StoreSession' },
    basketId: { type: Schema.Types.ObjectId, ref: 'Basket' },
    payload: { type: Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['RECEIVED', 'APPLIED', 'REJECTED', 'DUPLICATE'], default: 'RECEIVED', index: true },
    result: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Idempotent ingestion: one physical event applies once per device.
deviceEventSchema.index({ deviceId: 1, eventId: 1 }, { unique: true });
deviceEventSchema.index({ storeId: 1, type: 1, createdAt: -1 });
deviceEventSchema.index({ basketId: 1, createdAt: -1 });
deviceEventSchema.index({ sessionId: 1, createdAt: -1 });

export default model<IDeviceEvent>('DeviceEvent', deviceEventSchema);
