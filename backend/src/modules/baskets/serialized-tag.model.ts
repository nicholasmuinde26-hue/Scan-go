import { Schema, model, Document, Types } from 'mongoose';

export type SerializedTagStatus = 'IN_STORE' | 'IN_BASKET' | 'PAID' | 'ARCHIVED';
export interface ISerializedTag extends Document {
  tagSerial: string;
  productId: Types.ObjectId;
  storeId: Types.ObjectId;
  status: SerializedTagStatus;
  basketId?: Types.ObjectId;
  orderId?: Types.ObjectId;
  updatedAt: Date;
}

const serializedTagSchema = new Schema<ISerializedTag>({
  tagSerial: { type: String, required: true, unique: true, trim: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  status: { type: String, enum: ['IN_STORE', 'IN_BASKET', 'PAID', 'ARCHIVED'], default: 'IN_STORE', index: true },
  basketId: { type: Schema.Types.ObjectId, ref: 'Basket' },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
}, { timestamps: true });

serializedTagSchema.index({ storeId: 1, productId: 1, status: 1 });
export default model<ISerializedTag>('SerializedTag', serializedTagSchema);
