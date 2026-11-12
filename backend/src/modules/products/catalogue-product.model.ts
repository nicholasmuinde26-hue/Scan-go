import { Schema, model, Document } from 'mongoose';

export interface ICatalogueProduct extends Document {
  organizationId: Schema.Types.ObjectId;
  name: string;
  category: string;
  barcode: string;
  barcodeAliases: string[];
  pluCode?: string;
  sku: string;
  priceMinor: number;
  compareAtPriceMinor?: number;
  vatRateBps: number;
  isWeighted: boolean;
  soldBy: 'unit' | 'weight';
  pricePerKgMinor?: number;
  requiresSerializedTag: boolean;
  highTheft: boolean;
  imageData?: string;
  active: boolean;
}

const catalogueProductSchema = new Schema<ICatalogueProduct>({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true, index: true },
  barcode: { type: String, required: true, trim: true },
  barcodeAliases: { type: [String], default: [] },
  pluCode: { type: String, trim: true },
  sku: { type: String, required: true },
  priceMinor: { type: Number, required: true, min: 0 },
  compareAtPriceMinor: { type: Number, min: 0 },
  vatRateBps: { type: Number, default: 0, min: 0, max: 10000 },
  isWeighted: { type: Boolean, default: false },
  soldBy: { type: String, enum: ['unit', 'weight'], default: 'unit' },
  pricePerKgMinor: { type: Number, min: 1 },
  requiresSerializedTag: { type: Boolean, default: false },
  highTheft: { type: Boolean, default: false },
  imageData: { type: String, select: false },
  active: { type: Boolean, default: true },
}, { timestamps: true });

catalogueProductSchema.index({ organizationId: 1, barcode: 1 }, { unique: true });

export default model<ICatalogueProduct>('CatalogueProduct', catalogueProductSchema);
