import { Schema, model, Document } from 'mongoose';

export interface IGoodsReceipt extends Document {
  storeId: Schema.Types.ObjectId;
  productId: Schema.Types.ObjectId;
  barcode: string;
  quantity: number;
  supplier?: string;
  deliveryReference?: string;
  receivedBy: Schema.Types.ObjectId;
  receivedByName: string;
  notes?: string;
  createdAt: Date;
}

const goodsReceiptSchema = new Schema<IGoodsReceipt>({
  storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  barcode: { type: String, required: true, index: true },
  quantity: { type: Number, required: true, min: 1 },
  supplier: String,
  deliveryReference: String,
  receivedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  receivedByName: { type: String, required: true },
  notes: String,
}, { timestamps: { createdAt: true, updatedAt: false } });

export const GoodsReceipt = model<IGoodsReceipt>('GoodsReceipt', goodsReceiptSchema);

export interface IUnknownBarcode extends Document {
  storeId: Schema.Types.ObjectId;
  barcode: string;
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
  source: 'RECEIVING' | 'CUSTOMER_SCAN' | 'STAFF_SCAN';
  seenCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  reportedBy?: Schema.Types.ObjectId;
  reportedByName?: string;
  productId?: Schema.Types.ObjectId;
  pendingReceiveQuantity: number;
  pendingSupplier?: string;
  pendingDeliveryReference?: string;
  pendingReceiveNotes?: string;
}

const unknownBarcodeSchema = new Schema<IUnknownBarcode>({
  storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  barcode: { type: String, required: true },
  status: { type: String, enum: ['OPEN', 'RESOLVED', 'DISMISSED'], default: 'OPEN', index: true },
  source: { type: String, enum: ['RECEIVING', 'CUSTOMER_SCAN', 'STAFF_SCAN'], required: true },
  seenCount: { type: Number, default: 1 },
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  reportedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reportedByName: String,
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  pendingReceiveQuantity: { type: Number, default: 0, min: 0 },
  pendingSupplier: String,
  pendingDeliveryReference: String,
  pendingReceiveNotes: String,
}, { timestamps: true });
unknownBarcodeSchema.index({ storeId: 1, barcode: 1, status: 1 });
export const UnknownBarcode = model<IUnknownBarcode>('UnknownBarcode', unknownBarcodeSchema);
