import { Schema, model, Document } from 'mongoose';

export interface IPickedItem {
  productId: Schema.Types.ObjectId;
  barcode: string;
  name: string;
  requiredQuantity: number;
  scannedQuantity: number;
  isWeighted: boolean;
  expectedWeightGrams?: number;
  actualWeightGrams?: number;
  isVerified: boolean;
  status: 'PENDING' | 'VERIFIED' | 'OUT_OF_STOCK' | 'SUBSTITUTED';
  scannedAt?: Date;
  substitution?: {
    originalProductId: Schema.Types.ObjectId;
    replacementProductId: Schema.Types.ObjectId;
    replacementName: string;
    replacementBarcode: string;
    replacementPriceMinor: number;
    priceDifferenceMinor: number;
    customerApproval: 'PENDING' | 'APPROVED' | 'REJECTED';
    requestedAt: Date;
    respondedAt?: Date;
  };
}

export interface IPickingTask extends Document {
  orderId: Schema.Types.ObjectId;
  storeId: Schema.Types.ObjectId;
  pickerId: Schema.Types.ObjectId;
  status: 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'AWAITING_APPROVAL' | 'PACKED';
  items: IPickedItem[];
  startedAt?: Date;
  completedAt?: Date;

  // Dual verification & Packing
  verifierId?: Schema.Types.ObjectId;
  verifiedAt?: Date;
  packageSealNumber?: string;
  totalBagsOrContainers?: number;
  verificationNotes?: string;
}

const pickedItemSchema = new Schema<IPickedItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    barcode: { type: String, required: true },
    name: { type: String, required: true },
    requiredQuantity: { type: Number, required: true },
    scannedQuantity: { type: Number, default: 0 },
    isWeighted: { type: Boolean, default: false },
    expectedWeightGrams: Number,
    actualWeightGrams: Number,
    isVerified: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'OUT_OF_STOCK', 'SUBSTITUTED'],
      default: 'PENDING',
    },
    scannedAt: Date,
    substitution: {
      originalProductId: { type: Schema.Types.ObjectId, ref: 'Product' },
      replacementProductId: { type: Schema.Types.ObjectId, ref: 'Product' },
      replacementName: String,
      replacementBarcode: String,
      replacementPriceMinor: Number,
      priceDifferenceMinor: Number,
      customerApproval: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED'],
        default: 'PENDING',
      },
      requestedAt: Date,
      respondedAt: Date,
    },
  },
  { _id: false }
);

const pickingTaskSchema = new Schema<IPickingTask>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    pickerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      enum: ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'AWAITING_APPROVAL', 'PACKED'],
      default: 'ASSIGNED',
      index: true,
    },
    items: [pickedItemSchema],
    startedAt: Date,
    completedAt: Date,
    verifierId: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: Date,
    packageSealNumber: String,
    totalBagsOrContainers: { type: Number, default: 1 },
    verificationNotes: String,
  },
  { timestamps: true }
);

export default model<IPickingTask>('PickingTask', pickingTaskSchema);
