import { Schema, model, Document, Types } from 'mongoose';

/**
 * Registered physical devices that talk to the Retail Device Gateway:
 * smart baskets, exit cameras, entrance scanners, kiosks, scales, RFID
 * readers and POS bridges. Each device authenticates with its own credential
 * — a random Bluetooth device can never impersonate a registered basket.
 */
export type DeviceKind =
  | 'BASKET_LITE'
  | 'BASKET_PRO'
  | 'EXIT_CAMERA'
  | 'ENTRANCE_SCANNER'
  | 'KIOSK'
  | 'POS_BRIDGE'
  | 'SCALE'
  | 'RFID_READER';

export type DeviceStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export interface IDeviceCapabilities {
  scanner?: boolean;
  weightSensor?: boolean;
  rfid?: boolean;
  camera?: boolean;
  ble?: boolean;
  touchscreen?: boolean;
}

export interface IRetailDevice extends Document {
  deviceId: string; // hardware serial / UUID chosen at registration
  storeId: Types.ObjectId;
  kind: DeviceKind;
  label?: string;
  credentialHash: string; // sha256 of the device secret; secret shown once at registration
  status: DeviceStatus;
  capabilities: IDeviceCapabilities;
  firmwareVersion?: string;
  boundBasketId?: Types.ObjectId;
  lastSeenAt?: Date;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const retailDeviceSchema = new Schema<IRetailDevice>(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    kind: {
      type: String,
      enum: ['BASKET_LITE', 'BASKET_PRO', 'EXIT_CAMERA', 'ENTRANCE_SCANNER', 'KIOSK', 'POS_BRIDGE', 'SCALE', 'RFID_READER'],
      required: true,
    },
    label: String,
    credentialHash: { type: String, required: true, select: false },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'REVOKED'], default: 'ACTIVE', index: true },
    capabilities: {
      scanner: { type: Boolean, default: false },
      weightSensor: { type: Boolean, default: false },
      rfid: { type: Boolean, default: false },
      camera: { type: Boolean, default: false },
      ble: { type: Boolean, default: false },
      touchscreen: { type: Boolean, default: false },
    },
    firmwareVersion: String,
    boundBasketId: { type: Schema.Types.ObjectId, ref: 'Basket' },
    lastSeenAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

retailDeviceSchema.index({ storeId: 1, kind: 1, status: 1 });

export default model<IRetailDevice>('RetailDevice', retailDeviceSchema);
