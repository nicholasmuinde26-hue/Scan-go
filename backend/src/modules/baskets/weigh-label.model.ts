import { Schema, model, Document, Types } from 'mongoose';

export interface IWeighLabel extends Document {
  barcode: string;
  storeId: Types.ObjectId;
  scaleId: string;
  productId: Types.ObjectId;
  basketId: Types.ObjectId;
  firstSeenAt: Date;
  weightGrams: number;
  priceMinor: number;
}

const weighLabelSchema = new Schema<IWeighLabel>({
  barcode: { type: String, required: true, unique: true, trim: true },
  storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  scaleId: { type: String, required: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  basketId: { type: Schema.Types.ObjectId, ref: 'Basket', required: true },
  firstSeenAt: { type: Date, default: Date.now, required: true },
  weightGrams: { type: Number, min: 1, required: true },
  priceMinor: { type: Number, min: 1, required: true },
}, { timestamps: true });

export default model<IWeighLabel>('WeighLabel', weighLabelSchema);
