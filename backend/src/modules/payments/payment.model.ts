import { Schema, model, Document } from 'mongoose';
import { PaymentMethod, PaymentStatus } from '../../shared/types/index.js';

export interface IPayment extends Document {
  orderId: Schema.Types.ObjectId;
  storeId: Schema.Types.ObjectId;
  customerId: Schema.Types.ObjectId;
  method: PaymentMethod;
  kind: 'FULL' | 'DEPOSIT' | 'BALANCE' | 'TOP_UP';
  status: PaymentStatus;
  amountMinor: number;
  expectedAmountMinor: number;
  phone?: string;
  checkoutRequestId?: string;
  merchantRequestId?: string;
  mpesaReceiptNumber?: string;
  providerTransactionId?: string;
  providerReference?: string;
  errorMessage?: string;
  callbackData?: Record<string, any>;
  verifiedAt?: Date;
  lastQueriedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    method: { type: String, enum: ['MPESA', 'CARD', 'CASH'], default: 'MPESA' },
    kind: { type: String, enum: ['FULL', 'DEPOSIT', 'BALANCE', 'TOP_UP'], default: 'FULL' },
    status: { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED', 'TIMED_OUT', 'HELD'], default: 'PENDING', index: true },
    amountMinor: { type: Number, required: true },
    expectedAmountMinor: { type: Number, required: true },
    phone: { type: String },
    checkoutRequestId: { type: String, unique: true, sparse: true, index: true },
    merchantRequestId: { type: String, sparse: true },
    mpesaReceiptNumber: { type: String, unique: true, sparse: true, index: true },
    providerTransactionId: { type: String, sparse: true, index: true },
    providerReference: { type: String, sparse: true, index: true },
    errorMessage: String,
    callbackData: Schema.Types.Mixed,
    verifiedAt: Date,
    lastQueriedAt: Date,
  },
  { timestamps: true }
);

export default model<IPayment>('Payment', paymentSchema);
