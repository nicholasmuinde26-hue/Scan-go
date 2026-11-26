export type OrderStatus='PAYMENT_PENDING'|'AWAITING_FINAL_PAYMENT'|'PAID'|'PICKING'|'AWAITING_CUSTOMER_APPROVAL'|'READY_FOR_VERIFICATION'|'VERIFIED_AND_PACKED'|'READY_FOR_PICKUP'|'HELD'|'REFUND_PENDING'|'COLLECTED'|'EXITED'|'CANCELLED'|'EXPIRED';
export type Order={_id:string;orderNumber:string;orderType:'SCAN_AND_GO'|'CLICK_AND_COLLECT';status:OrderStatus;totalMinor:number;totalItems?:number;paidMinor?:number;paymentPlan?:'FULL'|'DEPOSIT';depositMinor?:number;collectionCode?:string;collectionQrToken?:string;pickupSlot?:{slotId:string;date:string;timeWindow:string};createdAt:string;items:{productId:string;productName:string;quantity:number;unitPriceMinor:number;lineTotalMinor:number}[]};
export type Substitution={orderId:string;orderNumber:string;productId:string;originalName:string;replacementName:string;replacementPriceMinor:number;priceDifferenceMinor:number};

export const AWAITING_PAYMENT:OrderStatus[]=['PAYMENT_PENDING','AWAITING_FINAL_PAYMENT'];

const LABELS:Record<string,string>={
  PAYMENT_PENDING:'Awaiting payment',
  AWAITING_FINAL_PAYMENT:'Final payment due',
  AWAITING_CUSTOMER_APPROVAL:'Needs your reply',
  READY_FOR_VERIFICATION:'Being checked',
  VERIFIED_AND_PACKED:'Packed',
  READY_FOR_PICKUP:'Ready for pickup',
  PICKING:'Being picked',
  PAID:'Paid',
  COLLECTED:'Collected',
  EXITED:'Completed',
  HELD:'On hold - see staff',
  REFUND_PENDING:'Refund pending',
};

export const statusLabel=(s:string)=>LABELS[s]||s.replace(/_/g,' ').toLowerCase().replace(/^\w/,c=>c.toUpperCase());

export type OrderTone='green'|'amber'|'slate'|'rose'|'blue';
export const statusTone=(s:string):OrderTone=>{
  if(['READY_FOR_PICKUP','VERIFIED_AND_PACKED','PAID'].includes(s))return 'green';
  if(['AWAITING_CUSTOMER_APPROVAL','HELD','AWAITING_FINAL_PAYMENT','PAYMENT_PENDING'].includes(s))return 'amber';
  if(['CANCELLED','EXPIRED','REFUND_PENDING'].includes(s))return 'rose';
  if(['PICKING','READY_FOR_VERIFICATION'].includes(s))return 'blue';
  return 'slate';
};

export const TONE_COLORS:Record<OrderTone,{bg:string;text:string;border:string}>={
  green:{bg:'#ECFDF5',text:'#065F46',border:'#A7F3D0'},
  amber:{bg:'#FFFBEB',text:'#92400E',border:'#FDE68A'},
  rose:{bg:'#FFF1F2',text:'#BE123C',border:'#FECDD3'},
  blue:{bg:'#EFF6FF',text:'#1E40AF',border:'#BFDBFE'},
  slate:{bg:'#F1F5F9',text:'#475569',border:'#E2E8F0'},
};

export const balanceDueMinor=(o:{totalMinor:number;paidMinor?:number})=>Math.max(0,o.totalMinor-(o.paidMinor||0));

// Mirrors the server: share of the total, rounded UP to a whole shilling. Server is authoritative.
export function depositFor(totalMinor:number,percent=50):number{
  const raw=Math.ceil((totalMinor*percent)/100);
  return Math.min(totalMinor,Math.max(100,Math.ceil(raw/100)*100));
}

export function amountDueNow(o:Order,percent=50):number{
  if(o.status==='PAYMENT_PENDING'&&o.paymentPlan==='DEPOSIT'&&!(o.paidMinor||0))return depositFor(o.totalMinor,percent);
  return balanceDueMinor(o);
}
