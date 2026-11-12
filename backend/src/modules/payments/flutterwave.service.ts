import crypto from 'crypto';
import { ENV } from '../../config/environment.js';

const FLUTTERWAVE_API = 'https://api.flutterwave.com/v3';

export interface FlutterwaveTransaction {
  id: string | number;
  tx_ref: string;
  status: string;
  amount: number;
  currency: string;
  [key: string]: any;
}

export function verifyFlutterwaveWebhookSignature(signature: string | undefined, secretHash = ENV.FLUTTERWAVE_WEBHOOK_SECRET): boolean {
  if (!signature || !secretHash) return false;
  const expected = Buffer.from(secretHash);
  const received = Buffer.from(signature);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

export function isFlutterwavePaymentValid(
  transaction: Partial<FlutterwaveTransaction> | null | undefined,
  expected: { reference: string; amountMinor: number }
): boolean {
  if (!transaction) return false;
  const amountMinor = Math.round(Number(transaction.amount) * 100);
  return transaction.status === 'successful'
    && transaction.tx_ref === expected.reference
    && String(transaction.currency).toUpperCase() === 'KES'
    && Number.isFinite(amountMinor)
    && amountMinor === expected.amountMinor;
}

async function flutterwaveRequest<T>(path: string, init: RequestInit): Promise<T> {
  if (!ENV.FLUTTERWAVE_SECRET_KEY) throw new Error('Card payments are not configured.');
  const response = await fetch(`${FLUTTERWAVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ENV.FLUTTERWAVE_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data.status !== 'success') {
    throw new Error(data.message || `Card provider request failed (${response.status}).`);
  }
  return data as T;
}

export async function createFlutterwaveCheckout(input: {
  reference: string;
  amountMinor: number;
  email: string;
  name: string;
  phone?: string;
  redirectUrl: string;
  orderNumber: string;
}): Promise<string> {
  const response = await flutterwaveRequest<{ data?: { link?: string } }>('/payments', {
    method: 'POST',
    body: JSON.stringify({
      tx_ref: input.reference,
      amount: (input.amountMinor / 100).toFixed(2),
      currency: 'KES',
      redirect_url: input.redirectUrl,
      customer: { email: input.email, name: input.name, phonenumber: input.phone },
      customizations: { title: 'Scan & Go', description: `Order ${input.orderNumber}` },
      payment_options: 'card',
      meta: { orderNumber: input.orderNumber },
    }),
  });
  const link = response.data?.link;
  if (!link) throw new Error('Card provider did not return a checkout link.');
  const checkout = new URL(link);
  if (checkout.protocol !== 'https:' || checkout.hostname !== 'checkout.flutterwave.com') {
    throw new Error('Card provider returned an invalid checkout link.');
  }
  return checkout.toString();
}

export async function verifyFlutterwaveTransaction(transactionId: string | number): Promise<FlutterwaveTransaction> {
  const response = await flutterwaveRequest<{ data: FlutterwaveTransaction }>(`/transactions/${encodeURIComponent(String(transactionId))}/verify`, {
    method: 'GET',
  });
  if (!response.data) throw new Error('Card provider returned no transaction details.');
  return response.data;
}

/**
 * Look a transaction up by our own tx_ref. Used when the customer closed the card page or was redirected back
 * without a transaction_id (cancelled/abandoned). Returns null when the provider has no such attempt yet.
 */
export async function verifyFlutterwaveByReference(txRef: string): Promise<FlutterwaveTransaction | null> {
  try {
    const response = await flutterwaveRequest<{ data?: FlutterwaveTransaction }>(
      `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`,
      { method: 'GET' }
    );
    return response.data || null;
  } catch (error: any) {
    if (/no transaction/i.test(String(error?.message))) return null;
    throw error;
  }
}
