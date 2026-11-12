import { Schema, model, Document, Types } from 'mongoose';
import { OrderStatus, OrderType } from '../../shared/types/index.js';

export interface IOrderItem {
  productId: Types.ObjectId;
  productName: string;
  barcode: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  priceVersion: number;
  weightGrams?: number;
  isWeighted?: boolean;
  highTheft?: boolean;
  labelBarcode?: string;
  unitPriceAtScan?: number;
  scaleId?: string;
  tagSerial?: string;
}

export interface IOrder extends Document {
  orderNumber: string;
  orderType: OrderType;
  storeId: Types.ObjectId;
  customerId: Types.ObjectId;
  basketId?: Types.ObjectId;
  // Copied from the basket at checkout so the exit check can use the trust tier.
  storeSessionId?: Types.ObjectId;
  trustTier?: 1 | 2;
  presenceMethod?: string;
  items: IOrderItem[];
  totalMinor: number;
  totalItems: number;
  expectedWeightGrams: number;
  basketHash: string;
  status: OrderStatus;
  statusHistory: {
    status: OrderStatus;
    changedAt: Date;
    changedBy?: Schema.Types.ObjectId;
    note?: string;
  }[];

  // Click & Collect specific fields
  pickupSlot?: {
    slotId: string;
    date: string;
    timeWindow: string;
  };
  substitutionsAllowed: boolean;
  collectionCode?: string; // legacy 6-digit PIN (no longer issued; pickup now uses order number + SMS OTP)
  collectionQrToken?: string; // Signed receipt token (Scan & Go exit lane only)

  // Shop & Collect payment plan: FULL up front, or a DEPOSIT now and the balance at pickup
  paymentPlan: 'FULL' | 'DEPOSIT';
  depositMinor: number;
  paidMinor: number;
  collectBy?: Date;
  depositForfeitedAt?: Date;

  // Pickup identity check: order number + one-time code sent to the customer's registered phone
  handoverOtpHash?: string;
  handoverOtpExpiresAt?: Date;
  handoverOtpAttempts?: number;
  handoverVerifiedAt?: Date;
  handoverVerifiedBy?: Schema.Types.ObjectId;
  assignedPickerId?: Schema.Types.ObjectId;
  verifiedPackerId?: Schema.Types.ObjectId;
  pickedAt?: Date;
  verifiedAt?: Date;
  collectedAt?: Date;
  exitedAt?: Date;

  // Add-on transaction tracking
  parentOrderId?: Schema.Types.ObjectId;
  isAddon: boolean;

  // Timestamps
  lockedAt: Date;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    barcode: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPriceMinor: { type: Number, required: true },
    lineTotalMinor: { type: Number, required: true },
    priceVersion: { type: Number, default: 1 },
    weightGrams: Number,
    isWeighted: Boolean,
    highTheft: Boolean,
    labelBarcode: String,
    unitPriceAtScan: Number,
    scaleId: String,
    tagSerial: String,
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    orderType: { type: String, enum: ['SCAN_AND_GO', 'CLICK_AND_COLLECT'], required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    basketId: { type: Schema.Types.ObjectId, ref: 'Basket' },
    storeSessionId: { type: Schema.Types.ObjectId, ref: 'StoreSession' },
    trustTier: { type: Number, enum: [1, 2] },
    presenceMethod: { type: String },
    items: [orderItemSchema],
    totalMinor: { type: Number, required: true, min: 0 },
    totalItems: { type: Number, required: true },
    expectedWeightGrams: { type: Number, default: 0 },
    basketHash: { type: String, required: true },
    status: {
      type: String,
      enum: [
        'DRAFT',
        'SUBMITTED',
        'PAYMENT_PENDING',
        'PAID',
        'PICKING',
        'AWAITING_CUSTOMER_APPROVAL',
        'AWAITING_FINAL_PAYMENT',
        'READY_FOR_VERIFICATION',
        'VERIFIED_AND_PACKED',
        'READY_FOR_PICKUP',
        'COLLECTED',
        'EXITED',
        'HELD',
        'CANCELLED',
        'EXPIRED',
        'REFUND_PENDING',
        'REFUNDED',
      ],
      default: 'SUBMITTED',
      index: true,
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        note: String,
      },
    ],
    pickupSlot: {
      slotId: String,
      date: String,
      timeWindow: String,
    },
    substitutionsAllowed: { type: Boolean, default: true },
    collectionCode: { type: String, index: true },
    collectionQrToken: { type: String, index: true },
    paymentPlan: { type: String, enum: ['FULL', 'DEPOSIT'], default: 'FULL' },
    depositMinor: { type: Number, default: 0, min: 0 },
    paidMinor: { type: Number, default: 0, min: 0 },
    collectBy: { type: Date, index: true },
    depositForfeitedAt: Date,
    handoverOtpHash: { type: String, select: false },
    handoverOtpExpiresAt: Date,
    handoverOtpAttempts: { type: Number, default: 0 },
    handoverVerifiedAt: Date,
    handoverVerifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedPickerId: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedPackerId: { type: Schema.Types.ObjectId, ref: 'User' },
    pickedAt: Date,
    verifiedAt: Date,
    collectedAt: Date,
    exitedAt: Date,
    parentOrderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    isAddon: { type: Boolean, default: false },
    lockedAt: { type: Date, default: Date.now },
    paidAt: Date,
  },
  { timestamps: true }
);

export default model<IOrder>('Order', orderSchema);
