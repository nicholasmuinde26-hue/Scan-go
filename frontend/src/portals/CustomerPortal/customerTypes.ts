// Shared types and helpers for the Customer portal.

export type CustomerSection = 'SHOP' | 'ORDERS' | 'STORES' | 'SUPPORT' | 'ACCOUNT';

export type OrderTone = 'green' | 'amber' | 'slate' | 'rose' | 'blue';

export interface CustomerOrder {
  _id: string;
  orderNumber: string;
  orderType: 'SCAN_AND_GO' | 'CLICK_AND_COLLECT';
  status: string;
  totalMinor: number;
  totalItems: number;
  pickupSlot?: { slotId: string; date: string; timeWindow: string };
  collectionCode?: string;
  collectionQrToken?: string;
  paymentPlan?: 'FULL' | 'DEPOSIT';
  depositMinor?: number;
  paidMinor?: number;
  items?: { productName: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number }[];
  createdAt: string;
}

export interface PendingSubstitution {
  orderId: string;
  orderNumber?: string;
  productId: string;
  originalName: string;
  replacementName: string;
  replacementPriceMinor: number;
  priceDifferenceMinor?: number;
}

export const AWAITING_PAYMENT = ['PAYMENT_PENDING', 'AWAITING_FINAL_PAYMENT'];
const FINISHED = ['COLLECTED', 'EXITED', 'CANCELLED', 'EXPIRED', 'REFUNDED'];
const PAID_OR_LATER = [
  'PAID',
  'PICKING',
  'AWAITING_CUSTOMER_APPROVAL',
  'READY_FOR_VERIFICATION',
  'VERIFIED_AND_PACKED',
  'READY_FOR_PICKUP',
];

export const isActiveOrder = (o: CustomerOrder) => !FINISHED.includes(o.status) && o.status !== 'DRAFT';

// Scan & Go: a QR exit pass, shown only once the server has issued one.
export const hasPass = (o: CustomerOrder) =>
  o.orderType === 'SCAN_AND_GO' && PAID_OR_LATER.includes(o.status) && Boolean(o.collectionQrToken);

// Shop & Collect: no QR. The customer quotes the order number and confirms with an SMS code at the counter.
const COLLECT_WAITING = ['PAID', 'PICKING', 'AWAITING_CUSTOMER_APPROVAL', 'READY_FOR_VERIFICATION', 'VERIFIED_AND_PACKED', 'READY_FOR_PICKUP', 'AWAITING_FINAL_PAYMENT'];
export const showsPickupNumber = (o: CustomerOrder) =>
  o.orderType === 'CLICK_AND_COLLECT' && COLLECT_WAITING.includes(o.status) && (o.paidMinor || 0) > 0;

export const balanceDueMinor = (o: { totalMinor: number; paidMinor?: number }) => Math.max(0, o.totalMinor - (o.paidMinor || 0));

// Mirrors the server: share of the total, rounded UP to a whole shilling (M-Pesa cannot charge cents). The server is authoritative.
export function depositFor(totalMinor: number, percent = 50): number {
  const raw = Math.ceil((totalMinor * percent) / 100);
  return Math.min(totalMinor, Math.max(100, Math.ceil(raw / 100) * 100));
}

// What the next payment on an order will charge.
export function amountDueNow(o: CustomerOrder, percent = 50): number {
  if (o.status === 'PAYMENT_PENDING' && o.paymentPlan === 'DEPOSIT' && !(o.paidMinor || 0)) return depositFor(o.totalMinor, percent);
  return balanceDueMinor(o);
}

const LABELS: Record<string, string> = {
  PAYMENT_PENDING: 'Awaiting payment',
  AWAITING_FINAL_PAYMENT: 'Final payment due',
  AWAITING_CUSTOMER_APPROVAL: 'Needs your reply',
  READY_FOR_VERIFICATION: 'Being checked',
  VERIFIED_AND_PACKED: 'Packed',
  READY_FOR_PICKUP: 'Ready for pickup',
  PICKING: 'Being picked',
  PAID: 'Paid',
  COLLECTED: 'Collected',
  EXITED: 'Completed',
  HELD: 'On hold - see staff',
  REFUND_PENDING: 'Refund pending',
};

export const statusLabel = (s: string) =>
  LABELS[s] || s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function statusTone(s: string): OrderTone {
  if (['READY_FOR_PICKUP', 'VERIFIED_AND_PACKED', 'PAID'].includes(s)) return 'green';
  if (['AWAITING_CUSTOMER_APPROVAL', 'HELD', 'AWAITING_FINAL_PAYMENT', 'PAYMENT_PENDING'].includes(s)) return 'amber';
  if (['CANCELLED', 'EXPIRED', 'REFUND_PENDING'].includes(s)) return 'rose';
  if (['PICKING', 'READY_FOR_VERIFICATION'].includes(s)) return 'blue';
  return 'slate';
}

export const TONE_CLASSES: Record<OrderTone, string> = {
  green: 'bg-brand-50 text-brand-800 border-brand-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  blue: 'bg-azure-50 text-azure-800 border-azure-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
};

// Safaricom numbers: 07xx / 01xx / +2547xx / 2547xx  ->  2547XXXXXXXX
export function normalizeKenyanPhone(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, '');
  const m = digits.match(/^(?:\+?254|0)?([71]\d{8})$/);
  return m ? `254${m[1]}` : null;
}

export const IS_DEV = Boolean((import.meta as any).env?.DEV);

export const todayISO = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

export function categoryIcon(name: string): string {
  const n = name.toLowerCase();
  if (/produce|fruit|veg/.test(n)) return '🥦';
  if (/dairy|egg|milk/.test(n)) return '🥛';
  if (/bak|bread/.test(n)) return '🍞';
  if (/meat|poultry|fish/.test(n)) return '🍗';
  if (/bever|tea|drink|juice/.test(n)) return '🧃';
  if (/clean|household|home/.test(n)) return '🧼';
  if (/personal|baby|care|beauty/.test(n)) return '🪥';
  if (/grain|oil|pantry|flour|rice|cereal/.test(n)) return '🌾';
  return '🛒';
}