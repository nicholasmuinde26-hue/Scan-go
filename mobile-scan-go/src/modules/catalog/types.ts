export type Product = {
  _id: string;
  name: string;
  barcode: string;
  category?: string;
  priceMinor: number;
  pricePerKgMinor?: number;
  soldBy?: 'unit' | 'weight';
  weightGrams?: number;
  stock?: number;
  image?: string;
  sku?: string;
  active: boolean;
  available?: boolean;
  unitsSold30d?: number;
};
