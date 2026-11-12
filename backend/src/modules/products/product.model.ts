import { Schema, model, Document } from 'mongoose';

export interface IProduct extends Document {
  storeId: Schema.Types.ObjectId;
  catalogueProductId?: Schema.Types.ObjectId;
  name: string;
  category: string;
  barcode: string;
  barcodeAliases: string[];
  pluCode?: string;
  vatRateBps: number;
  sku: string;
  priceMinor: number; // in cents (KES 100 = 10,000 cents)
  priceVersion: number;
  weightGrams?: number;
  isWeighted: boolean; // e.g. produce weighed at scale (tomatoes, onions, meat)
  pricePerKgMinor?: number;
  soldBy: 'unit' | 'weight';
  requiresSerializedTag: boolean;
  highTheft: boolean; // e.g., baby formula, electronics, whiskey, meat
  image?: string; // public URL served by GET /products/:id/image
  imageData?: string; // compressed photo (data URL); never returned in list queries
  compareAtPriceMinor?: number;
  stock: number;
  active: boolean;
}

const productSchema = new Schema<IProduct>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    catalogueProductId: { type: Schema.Types.ObjectId, ref: 'CatalogueProduct', index: true },
    name: { type: String, required: true },
    category: { type: String, required: true, index: true },
    barcode: { type: String, required: true, index: true },
    barcodeAliases: { type: [String], default: [], index: true },
    pluCode: { type: String, index: true },
    vatRateBps: { type: Number, default: 0, min: 0, max: 10000 },
    sku: { type: String, required: true },
    priceMinor: { type: Number, required: true, min: 0 },
    priceVersion: { type: Number, default: 1 },
    weightGrams: { type: Number },
    isWeighted: { type: Boolean, default: false },
    pricePerKgMinor: { type: Number },
    soldBy: { type: String, enum: ['unit', 'weight'], default: 'unit', index: true },
    requiresSerializedTag: { type: Boolean, default: false, index: true },
    highTheft: { type: Boolean, default: false, index: true },
    image: { type: String },
    imageData: { type: String, select: false },
    compareAtPriceMinor: {
      type: Number,
      min: 0,
      validate: {
        validator: function (this: any, value: number | null | undefined) {
          return value == null || value > this.priceMinor;
        },
        message: 'Was price must be higher than the selling price.',
      },
    },
    stock: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.index({ storeId: 1, barcode: 1 }, { unique: true });

export default model<IProduct>('Product', productSchema);
