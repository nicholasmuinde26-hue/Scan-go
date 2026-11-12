import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { ENV } from '../../config/environment.js';

export type PaymentPlan = 'FULL' | 'DEPOSIT';
export type PaymentKind = 'FULL' | 'DEPOSIT' | 'BALANCE' | 'TOP_UP';

// No 0/O/1/I/L so an order number read aloud or typed on a till cannot be mistaken.
const ORDER_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Shop & Collect order numbers carry ~30 bits of randomness (the old 4-digit suffix was guessable). */
export function generateCollectOrderNumber(): string {
  const bytes = crypto.randomBytes(6);
  const part = (from: number) => Array.from(bytes.subarray(from, from + 3) as ArrayLike<number>, (b: number) => ORDER_ALPHABET[b % ORDER_ALPHABET.length]).join('');
  return `CC-${part(0)}-${part(3)}`;
}

/** Deposit = configured share of the total, rounded UP to a whole shilling (M-Pesa STK cannot charge cents). */
export function computeDepositMinor(totalMinor: number): number {
  const raw = Math.ceil((totalMinor * ENV.CC_DEPOSIT_PERCENT) / 100);
  const wholeShilling = Math.ceil(raw / 100) * 100;
  return Math.min(totalMinor, Math.max(100, wholeShilling));
}

// Orders paid before deposits existed carry paidAt but no paidMinor: they were paid in full.
export function paidMinorOf(order: { paidMinor?: number; paidAt?: Date; totalMinor?: number }): number {
  if (!order.paidMinor && order.paidAt && order.totalMinor !== undefined) return order.totalMinor;
  return order.paidMinor || 0;
}

export function balanceMinorOf(order: { totalMinor: number; paidMinor?: number; paidAt?: Date }): number {
  return Math.max(0, order.totalMinor - paidMinorOf(order));
}

/** What the next payment attempt for this order must charge. */
export function amountDueMinor(order: { totalMinor: number; paidMinor?: number; paidAt?: Date; paymentPlan?: PaymentPlan; status: string }): number {
  if (order.status === 'PAYMENT_PENDING' && order.paymentPlan === 'DEPOSIT' && !paidMinorOf(order)) {
    return computeDepositMinor(order.totalMinor);
  }
  return balanceMinorOf(order);
}

export function paymentKindFor(order: { totalMinor: number; paidMinor?: number; paymentPlan?: PaymentPlan; status: string; handoverVerifiedAt?: Date }): PaymentKind {
  if (order.status === 'PAYMENT_PENDING') return order.paymentPlan === 'DEPOSIT' ? 'DEPOSIT' : 'FULL';
  // At the counter, after OTP verification, the remainder is the pickup balance. Any other later charge (e.g. a substitution price difference) is a top-up.
  return order.handoverVerifiedAt ? 'BALANCE' : 'TOP_UP';
}

/** Six-digit pickup OTP, stored only as a hash. */
export async function createPickupOtp(): Promise<{ code: string; hash: string; expiresAt: Date }> {
  const code = crypto.randomInt(100000, 1000000).toString();
  return { code, hash: await bcrypt.hash(code, 10), expiresAt: new Date(Date.now() + ENV.CC_PICKUP_OTP_TTL_MS) };
}

export async function checkPickupOtp(code: string, hash?: string): Promise<boolean> {
  if (!hash || !/^\d{6}$/.test(code)) return false;
  return bcrypt.compare(code, hash);
}

/** When an uncollected order becomes a no-show: end of its pickup window + grace. */
export function collectDeadline(pickupDate: string, timeWindow: string): Date {
  // timeWindow looks like "10:00 – 12:00"; use the end time, falling back to end of day.
  const end = (timeWindow.match(/(\d{1,2}):(\d{2})\s*$/) || []);
  const hh = end[1] ? end[1].padStart(2, '0') : '23';
  const mm = end[2] || '59';
  // Kenya has no DST: EAT is a fixed UTC+3.
  const base = new Date(`${pickupDate}T${hh}:${mm}:00+03:00`);
  const valid = Number.isNaN(base.getTime()) ? new Date(Date.now() + 24 * 3600 * 1000) : base;
  return new Date(valid.getTime() + ENV.CC_NOSHOW_GRACE_HOURS * 3600 * 1000);
}

export function maskPhone(phone?: string): string {
  if (!phone) return '';
  return `${phone.slice(0, 5)}***${phone.slice(-3)}`;
}
