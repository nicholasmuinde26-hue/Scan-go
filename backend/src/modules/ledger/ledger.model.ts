import { Schema, model, Document } from 'mongoose';

/**
 * Ledger Entry Types for Double-Entry Accounting
 * 
 * Double-entry rules:
 * - Every transaction has at least 2 entries (debit and credit)
 * - Total debits must equal total credits
 * - Entries are append-only (never modified, only reversed)
 * - Unique payment key prevents double-posting from webhook retries
 */

export enum LedgerEntryType {
  // Platform wallet entries
  PLATFORM_DEBIT = 'PLATFORM_DEBIT',
  PLATFORM_CREDIT = 'PLATFORM_CREDIT',
  
  // Fee income
  FEE_INCOME = 'FEE_INCOME',
  
  // Supermarket payout
  STORE_PAYOUT = 'STORE_PAYOUT',
  
  // Refunds
  REFUND_CUSTOMER = 'REFUND_CUSTOMER',
  REFUND_PLATFORM = 'REFUND_PLATFORM',
  REFUND_STORE = 'REFUND_STORE',
  
  // Adjustments
  ADJUSTMENT_DEBIT = 'ADJUSTMENT_DEBIT',
  ADJUSTMENT_CREDIT = 'ADJUSTMENT_CREDIT',
}

export interface ILedgerEntry extends Document {
  // Unique key per payment for idempotency (e.g., "payment-{paymentId}-{checkoutRequestId}")
  uniqueKey: string;
  
  // Entry type
  entryType: LedgerEntryType;
  
  // Amount in cents (minor units)
  amountMinor: number;
  
  // Reference to related entities
  paymentId?: Schema.Types.ObjectId;
  orderId?: Schema.Types.ObjectId;
  storeId?: Schema.Types.ObjectId;
  organizationId?: Schema.Types.ObjectId;
  
  // Debit/Credit flag
  isDebit: boolean;
  
  // Account codes (simplified chart of accounts)
  accountCode: string; // e.g., "1000" for Cash, "2000" for Revenue, "3000" for Accounts Payable
  
  // Description
  description: string;
  
  // Metadata for audit
  metadata?: {
    mpesaReceiptNumber?: string;
    feePercentage?: number;
    feeAmountMinor?: number;
    storeSharePercentage?: number;
    storeShareAmountMinor?: number;
    platformShareAmountMinor?: number;
    reversalOf?: Schema.Types.ObjectId; // If this is a reversal entry
  };
  
  // Timestamp
  createdAt: Date;
}

const ledgerEntrySchema = new Schema<ILedgerEntry>(
  {
    uniqueKey: { 
      type: String, 
      required: true, 
      unique: true, 
      index: true 
    },
    entryType: { 
      type: String, 
      enum: Object.values(LedgerEntryType),
      required: true 
    },
    amountMinor: { 
      type: Number, 
      required: true,
      min: 0 
    },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
    isDebit: { type: Boolean, required: true },
    accountCode: { type: String, required: true },
    description: { type: String, required: true },
    metadata: {
      mpesaReceiptNumber: String,
      feePercentage: Number,
      feeAmountMinor: Number,
      storeSharePercentage: Number,
      storeShareAmountMinor: Number,
      platformShareAmountMinor: Number,
      reversalOf: { type: Schema.Types.ObjectId, ref: 'LedgerEntry' },
    },
  },
  { 
    timestamps: true,
  }
);

// Prevent updates to enforce append-only ledger
ledgerEntrySchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (next) {
  next(new Error('Ledger entries are immutable and cannot be updated'));
});

// Compound index for efficient queries
ledgerEntrySchema.index({ paymentId: 1, entryType: 1 });
ledgerEntrySchema.index({ storeId: 1, createdAt: -1 });
ledgerEntrySchema.index({ organizationId: 1, createdAt: -1 });

export default model<ILedgerEntry>('LedgerEntry', ledgerEntrySchema);
