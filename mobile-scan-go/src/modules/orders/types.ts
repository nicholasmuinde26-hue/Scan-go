export type OrderStatus='PAYMENT_PENDING'|'PAID'|'PICKING'|'AWAITING_CUSTOMER_APPROVAL'|'READY_FOR_PICKUP'|'COLLECTED'|'EXITED'|'CANCELLED';
export type Order={_id:string;orderNumber:string;orderType:'SCAN_AND_GO'|'CLICK_AND_COLLECT';status:OrderStatus;totalMinor:number;paidMinor?:number;createdAt:string;items:{productId:string;productName:string;quantity:number;unitPriceMinor:number;lineTotalMinor:number}[]};
export type Substitution={orderId:string;orderNumber:string;productId:string;originalName:string;replacementName:string;replacementPriceMinor:number;priceDifferenceMinor:number};
