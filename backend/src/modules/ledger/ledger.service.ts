import LedgerEntry, { LedgerEntryType } from './ledger.model.js';
import Payment from '../payments/payment.model.js';
import Order from '../orders/order.model.js';
import Store from '../stores/store.model.js';
import Organization from '../organizations/organization.model.js';

/**
 * Ledger Service - Double-Entry Accounting
 * 
 * This service handles all ledger entries ensuring:
 * 1. Every transaction has balanced debits and credits
 * 2. Entries are idempotent via uniqueKey
 * 3. Entries are append-only (never modified)
 */

export interface LedgerTransaction {
  uniqueKey: string;
  entries: {
    entryType: LedgerEntryType;
    amountMinor: number;
    isDebit: boolean;
    accountCode: string;
    description: string;
    metadata?: any;
  }[];
  paymentId?: string;
  orderId?: string;
  storeId?: string;
  organizationId?: string;
}

/**
 * Account Codes (Simplified Chart of Accounts)
 */
export const AccountCodes = {
  CASH: '1000',              // Cash/M-Pesa funds
  ACCOUNTS_RECEIVABLE: '1100', // Money owed to platform
  PLATFORM_REVENUE: '2000',   // Platform fee income
  STORES_PAYABLE: '3000',     // Money owed to stores
  CUSTOMER_REFUNDS: '4000',   // Refunds to customers
  ADJUSTMENTS: '5000',        // Manual adjustments
};

/**
 * Fee configuration (can be made configurable per organization)
 */
const DEFAULT_FEE_PERCENTAGE = 0.05; // 5% platform fee
const DEFAULT_STORE_SHARE = 0.95; // 95% goes to store

/**
 * Create a balanced ledger transaction
 * All entries in a transaction share the same uniqueKey for idempotency
 */
export async function createLedgerTransaction(transaction: LedgerTransaction): Promise<boolean> {
  try {
    // Check idempotency - if any entry with this uniqueKey exists, skip
    const existing = await LedgerEntry.findOne({ uniqueKey: transaction.uniqueKey });
    if (existing) {
      console.log(`[Ledger] Transaction with key ${transaction.uniqueKey} already exists, skipping`);
      return false;
    }

    // Validate transaction is balanced (debits = credits)
    const totalDebits = transaction.entries
      .filter(e => e.isDebit)
      .reduce((sum, e) => sum + e.amountMinor, 0);
    
    const totalCredits = transaction.entries
      .filter(e => !e.isDebit)
      .reduce((sum, e) => sum + e.amountMinor, 0);

    if (totalDebits !== totalCredits) {
      throw new Error(`Transaction not balanced: debits=${totalDebits}, credits=${totalCredits}`);
    }

    // Create all entries
    const entries = transaction.entries.map(entry => ({
      uniqueKey: transaction.uniqueKey,
      entryType: entry.entryType,
      amountMinor: entry.amountMinor,
      paymentId: transaction.paymentId,
      orderId: transaction.orderId,
      storeId: transaction.storeId,
      organizationId: transaction.organizationId,
      isDebit: entry.isDebit,
      accountCode: entry.accountCode,
      description: entry.description,
      metadata: entry.metadata,
    }));

    await LedgerEntry.insertMany(entries);
    console.log(`[Ledger] Created ${entries.length} entries for transaction ${transaction.uniqueKey}`);
    return true;
  } catch (error: any) {
    console.error('[Ledger] Error creating transaction:', error);
    throw error;
  }
}

/**
 * Record a successful payment with platform fee split
 * 
 * Flow:
 * 1. Debit Cash (payment received)
 * 2. Credit Store's Payable (store's share)
 * 3. Credit Platform Revenue (platform fee)
 */
export async function recordPaymentRevenue(
  paymentId: string,
  orderId: string,
  storeId: string,
  totalAmountMinor: number,
  mpesaReceiptNumber?: string
): Promise<void> {
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    throw new Error('Payment not found');
  }

  const store = await Store.findById(storeId);
  if (!store) {
    throw new Error('Store not found');
  }

  const organizationId = store.organizationId?.toString();

  // Calculate fee split
  const feeAmountMinor = Math.round(totalAmountMinor * DEFAULT_FEE_PERCENTAGE);
  const storeShareAmountMinor = totalAmountMinor - feeAmountMinor;

  const uniqueKey = `payment-${paymentId}-${payment.checkoutRequestId}`;

  await createLedgerTransaction({
    uniqueKey,
    entries: [
      {
        entryType: LedgerEntryType.PLATFORM_DEBIT,
        amountMinor: totalAmountMinor,
        isDebit: true,
        accountCode: AccountCodes.CASH,
        description: `Payment received for order ${orderId}`,
        metadata: { mpesaReceiptNumber },
      },
      {
        entryType: LedgerEntryType.STORE_PAYOUT,
        amountMinor: storeShareAmountMinor,
        isDebit: false,
        accountCode: AccountCodes.STORES_PAYABLE,
        description: `Store share for order ${orderId}`,
        metadata: {
          storeSharePercentage: DEFAULT_STORE_SHARE,
          storeShareAmountMinor,
        },
      },
      {
        entryType: LedgerEntryType.FEE_INCOME,
        amountMinor: feeAmountMinor,
        isDebit: false,
        accountCode: AccountCodes.PLATFORM_REVENUE,
        description: `Platform fee for order ${orderId}`,
        metadata: {
          feePercentage: DEFAULT_FEE_PERCENTAGE,
          feeAmountMinor,
        },
      },
    ],
    paymentId,
    orderId,
    storeId,
    organizationId,
  });
}

/**
 * Record a refund (reverse the original payment entries)
 */
export async function recordRefund(
  originalPaymentId: string,
  refundAmountMinor: number,
  reason: string
): Promise<void> {
  const originalPayment = await Payment.findById(originalPaymentId);
  if (!originalPayment) {
    throw new Error('Original payment not found');
  }

  const uniqueKey = `refund-${originalPaymentId}-${Date.now()}`;

  // Find original ledger entries for this payment
  const originalEntries = await LedgerEntry.find({ paymentId: originalPaymentId });

  // Create reversal entries (opposite of original)
  const reversalEntries = originalEntries.map(entry => ({
    entryType: entry.isDebit ? LedgerEntryType.REFUND_PLATFORM : LedgerEntryType.REFUND_CUSTOMER,
    amountMinor: refundAmountMinor, // Partial refunds use the refund amount
    isDebit: !entry.isDebit, // Flip debit/credit
    accountCode: entry.accountCode,
    description: `Refund for ${entry.description}`,
    metadata: {
      reversalOf: entry._id,
      originalAmountMinor: entry.amountMinor,
      refundAmountMinor,
      reason,
    },
  }));

  await createLedgerTransaction({
    uniqueKey,
    entries: reversalEntries,
    paymentId: originalPaymentId,
    orderId: originalPayment.orderId?.toString(),
    storeId: originalPayment.storeId?.toString(),
  });
}

/**
 * Get store balance (total payable to store)
 */
export async function getStoreBalance(storeId: string): Promise<number> {
  const credits = await LedgerEntry.aggregate([
    { $match: { storeId, accountCode: AccountCodes.STORES_PAYABLE, isDebit: false } },
    { $group: { _id: null, total: { $sum: '$amountMinor' } } },
  ]);

  const debits = await LedgerEntry.aggregate([
    { $match: { storeId, accountCode: AccountCodes.STORES_PAYABLE, isDebit: true } },
    { $group: { _id: null, total: { $sum: '$amountMinor' } } },
  ]);

  const totalCredits = credits[0]?.total || 0;
  const totalDebits = debits[0]?.total || 0;

  return totalCredits - totalDebits;
}

/**
 * Get platform revenue total
 */
export async function getPlatformRevenue(organizationId?: string): Promise<number> {
  const match: any = { accountCode: AccountCodes.PLATFORM_REVENUE, isDebit: false };
  if (organizationId) {
    match.organizationId = organizationId;
  }

  const result = await LedgerEntry.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amountMinor' } } },
  ]);

  return result[0]?.total || 0;
}

/**
 * Verify ledger integrity (sum of all debits should equal sum of all credits)
 * This is a nightly reconciliation check
 */
export async function verifyLedgerIntegrity(): Promise<{ balanced: boolean; difference: number }> {
  const totalDebits = await LedgerEntry.aggregate([
    { $match: { isDebit: true } },
    { $group: { _id: null, total: { $sum: '$amountMinor' } } },
  ]);

  const totalCredits = await LedgerEntry.aggregate([
    { $match: { isDebit: false } },
    { $group: { _id: null, total: { $sum: '$amountMinor' } } },
  ]);

  const debits = totalDebits[0]?.total || 0;
  const credits = totalCredits[0]?.total || 0;
  const difference = Math.abs(debits - credits);

  return {
    balanced: difference === 0,
    difference,
  };
}
