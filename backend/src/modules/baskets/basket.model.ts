import { Schema, model, Document, Types } from 'mongoose';
import { BasketStatus } from '../../shared/types/index.js';

export interface IBasketEvent {
  eventType: 'SCAN' | 'MANUAL_ENTRY' | 'QUANTITY_CHANGE' | 'REMOVAL' | 'UNKNOWN_BARCODE';
  barcode?: string;
  productId?: Types.ObjectId;
  quantity?: number;
  timestamp: Date;
  details?: string;
}

export interface IBasketItem {
  productId: Types.ObjectId;
  barcode: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  priceVersion: number;
  weightGrams?: number;
  isWeighted?: boolean;
  highTheft?: boolean;
  labelBarcode?: string;
  unitPriceAtScan?: number;
  scaleId?: string;
  tagSerial?: string;
  addedAt: Date;
}

export interface IBasket extends Document {
  storeId: Types.ObjectId;
  customerId: Types.ObjectId;
  deviceId?: string;
  // In-store presence: which session and trust tier this basket was started under (set by the server only).
  storeSessionId?: Types.ObjectId;
  trustTier?: 1 | 2;
  presenceMethod?: string;
  status: BasketStatus;
  items: IBasketItem[];
  manualEntryCount: number;
  removalCount: number;
  unknownBarcodeCount: number;
  totalMinor: number;
  totalItems: number;
  expectedWeightGrams: number;
  basketHash: string;
  events: IBasketEvent[];
  startedAt: Date;
  lastActivityAt: Date;
}

const basketEventSchema = new Schema<IBasketEvent>(
  {
    eventType: {
      type: String,
      enum: ['SCAN', 'MANUAL_ENTRY', 'QUANTITY_CHANGE', 'REMOVAL', 'UNKNOWN_BARCODE'],
      required: true,
    },
    barcode: String,
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    quantity: Number,
    timestamp: { type: Date, default: Date.now },
    details: String,
  },
  { _id: false }
);

const basketItemSchema = new Schema<IBasketItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    barcode: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPriceMinor: { type: Number, required: true, min: 0 },
    priceVersion: { type: Number, default: 1 },
    weightGrams: Number,
    isWeighted: Boolean,
    highTheft: Boolean,
    labelBarcode: String,
    unitPriceAtScan: Number,
    scaleId: String,
    tagSerial: String,
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const basketSchema = new Schema<IBasket>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deviceId: { type: String },
    storeSessionId: { type: Schema.Types.ObjectId, ref: 'StoreSession', index: true },
    trustTier: { type: Number, enum: [1, 2] },
    presenceMethod: { type: String },
    status: { type: String, enum: ['OPEN', 'ABANDONED', 'CONVERTED'], default: 'OPEN' },
    items: [basketItemSchema],
    manualEntryCount: { type: Number, default: 0 },
    removalCount: { type: Number, default: 0 },
    unknownBarcodeCount: { type: Number, default: 0 },
    totalMinor: { type: Number, default: 0 },
    totalItems: { type: Number, default: 0 },
    expectedWeightGrams: { type: Number, default: 0 },
    basketHash: { type: String, default: '' },
    events: [basketEventSchema],
    startedAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default model<IBasket>('Basket', basketSchema);
