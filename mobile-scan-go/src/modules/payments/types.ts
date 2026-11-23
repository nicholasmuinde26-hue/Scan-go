export type PaymentStatus='PENDING'|'SUCCESS'|'FAILED'|'TIMED_OUT'|'HELD';
export type PaymentState={paymentId:string;status:PaymentStatus;timedOut:boolean;message?:string;orderId:string};
