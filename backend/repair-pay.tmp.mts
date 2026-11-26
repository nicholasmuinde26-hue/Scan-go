import mongoose from 'mongoose';
const { default: Payment } = await import('./src/modules/payments/payment.model.js');
const { default: Order } = await import('./src/modules/orders/order.model.js');
const { queryDarajaStkStatus } = await import('./src/modules/payments/daraja.service.js');
const { resolvePendingPayment } = await import('./src/modules/payments/reconciliation.job.js');
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/scan_and_go_db');

const suspects = await Payment.find({ method:'MPESA', checkoutRequestId:{$exists:true,$ne:null}, status:{$in:['FAILED','TIMED_OUT']} }).sort({createdAt:-1}).limit(10);
for (const p of suspects) {
  const q = await queryDarajaStkStatus(p.checkoutRequestId);
  console.log(p._id.toString(), p.checkoutRequestId, '=>', q.resultCode, q.resultDesc);
  await new Promise(r=>setTimeout(r,2500));
  if (q.isCompleted && q.resultCode === 0) {
    // Reset to PENDING and let the shared resolver finalize it (idempotent).
    await Payment.updateOne({_id:p._id},{$set:{status:'PENDING'},$unset:{errorMessage:1}});
    const fresh: any = await Payment.findById(p._id);
    const after = await resolvePendingPayment(fresh, {minIntervalMs:0});
    const order: any = await Order.findById(p.orderId).select('orderNumber status');
    console.log('  REPAIRED ->', after, '| order', order?.orderNumber, order?.status);
  }
}
await mongoose.disconnect();
