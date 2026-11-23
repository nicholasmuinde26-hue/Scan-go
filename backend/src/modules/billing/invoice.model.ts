import { Schema, model, Document } from 'mongoose';

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'PARTIAL' | 'OVERDUE' | 'VOID';

export interface IInvoiceLineItem {
  label: string;
  quantity: number;
  unitAmountMinor: number;
  amountMinor: number;
}

export interface IInvoicePayment {
  amountMinor: number;
  method: 'MPESA' | 'CARD' | 'BANK' | 'CASH' | 'MANUAL';
  reference?: string;
  receivedBy?: Schema.Types.ObjectId;
  receivedAt: Date;
}

export interface IInvoice extends Document {
  organizationId: Schema.Types.ObjectId;
  subscriptionId?: Schema.Types.ObjectId;
  invoiceNumber: string;
  periodStart: Date;
  periodEnd: Date;
  currency: 'KES';
  billingInterval: 'MONTHLY' | 'ANNUAL';
  lineItems: IInvoiceLineItem[];
  usageSnapshot: {
    activeBranches: number;
    activeStaff: number;
    transactions: number;
  };
  subtotalMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  status: InvoiceStatus;
  dueDate: Date;
  issuedAt?: Date;
  paidAt?: Date;
  payments: IInvoicePayment[];
  notes?: string;
  createdBy?: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const invoiceSchema = new Schema<IInvoice>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    currency: { type: String, enum: ['KES'], default: 'KES' },
    billingInterval: { type: String, enum: ['MONTHLY', 'ANNUAL'], default: 'MONTHLY' },
    lineItems: [{
      label: { type: String, required: true },
      quantity: { type: Number, required: true },
      unitAmountMinor: { type: Number, required: true },
      amountMinor: { type: Number, required: true },
    }],
    usageSnapshot: {
      activeBranches: { type: Number, default: 0 },
      activeStaff: { type: Number, default: 0 },
      transactions: { type: Number, default: 0 },
    },
    subtotalMinor: { type: Number, required: true, min: 0 },
    totalMinor: { type: Number, required: true, min: 0 },
    amountPaidMinor: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['DRAFT', 'ISSUED', 'PAID', 'PARTIAL', 'OVERDUE', 'VOID'], default: 'DRAFT', index: true },
    dueDate: { type: Date, required: true },
    issuedAt: { type: Date },
    paidAt: { type: Date },
    payments: [{
      amountMinor: { type: Number, required: true, min: 1 },
      method: { type: String, enum: ['MPESA', 'CARD', 'BANK', 'CASH', 'MANUAL'], required: true },
      reference: String,
      receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      receivedAt: { type: Date, default: Date.now },
    }],
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

invoiceSchema.index({ organizationId: 1, periodStart: 1, periodEnd: 1 });

export default model<IInvoice>('Invoice', invoiceSchema);
