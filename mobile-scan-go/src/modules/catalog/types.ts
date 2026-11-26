export type Product = {
  _id: string;
  name: string;
  barcode: string;
  category?: string;
  priceMinor: number;
  compareAtPriceMinor?: number;
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

export type ProductSort = 'recommended' | 'price-low' | 'price-high' | 'name';
