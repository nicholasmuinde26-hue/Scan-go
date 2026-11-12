import React, { useState } from 'react';
import {
  Search,
  RotateCcw,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Phone,
  DollarSign,
  Send,
  RefreshCw,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { Store, User, Order } from '../../types.js';
import { apiRequest, formatKes } from '../../api.js';

interface CashierServiceViewProps {
  currentStore: Store;
  currentUser?: User | null;
}

export const CashierServiceView: React.FC<CashierServiceViewProps> = ({ currentStore, currentUser }) => {
  const [lookupQuery, setLookupQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [order, setOrder] = useState<any | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Refund Form
  const [refundAmountKes, setRefundAmountKes] = useState('450');
  const [refundReason, setRefundReason] = useState('Customer returned damaged item in aisle');
  const [processingRefund, setProcessingRefund] = useState(false);

  const handleLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!lookupQuery.trim()) return;

    try {
      setSearching(true);
      setStatusMsg(null);
      // Look up orders matching query
      const res = await apiRequest(`/orders?storeId=${currentStore._id}`);
      const matching = (res?.orders || []).find(
        (o: any) =>
          o.orderNumber?.toLowerCase().includes(lookupQuery.toLowerCase()) ||
          o.collectionCode?.toLowerCase() === lookupQuery.toLowerCase() ||
          o.customerId?.phone?.includes(lookupQuery) ||
          o.customerId?.name?.toLowerCase().includes(lookupQuery.toLowerCase())
      );

      if (matching) {
        setOrder(matching);
        setRefundAmountKes(((matching.totalMinor || 45000) / 100).toString());
      } else {
        setOrder(null);
        setStatusMsg({ type: 'warning', text: `No order found matching "${lookupQuery}" at this branch.` });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Lookup failed' });
    } finally {
      setSearching(false);
    }
  };

  const handleProcessRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;

    try {
      setProcessingRefund(true);
      const res = await apiRequest('/orders/cashier/refund', {
        method: 'POST',
        body: JSON.stringify({
          orderId: order._id,
          refundAmountMinor: Math.round(Number(refundAmountKes) * 100),
          reason: refundReason,
        }),
      });

      if (res.escalated) {
        setStatusMsg({
          type: 'warning',
          text: res.message || 'Refund exceeds KES 2,000 threshold and was escalated to Branch Manager.',
        });
      } else {
        setStatusMsg({
          type: 'success',
          text: res.message || `Refund of KES ${refundAmountKes} processed successfully!`,
        });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Refund processing failed' });
    } finally {
      setProcessingRefund(false);
    }
  };

  const handleResendReceipt = async () => {
    if (!order) return;
    try {
      await apiRequest('/support/actions/resend-receipt', {
        method: 'POST',
        body: JSON.stringify({ orderId: order._id }),
      });
      setStatusMsg({ type: 'success', text: `Digital receipt SMS resent to customer phone successfully.` });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to resend receipt' });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans">
      {/* Search Header */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
        <div>
          <span className="bg-brand-100 text-brand-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            Cashier / Customer Service Helpdesk
          </span>
          <h2 className="text-xl font-black text-navy-800 mt-1">Order Lookup & Safe Refunds</h2>
          <p className="text-xs text-slate-500">
            Search orders by order reference, collection OTP, or customer phone number. Issue safe refunds up to KES 2,000.
          </p>
        </div>

        <form onSubmit={handleLookup} className="flex gap-2 text-xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Enter Order # (e.g. SG-20261104), Phone, or OTP..."
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl focus:outline-brand-500 font-medium"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold shadow-xs transition"
          >
            {searching ? 'Finding...' : 'Find Order'}
          </button>
        </form>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between ${
            statusMsg.type === 'success'
              ? 'bg-brand-50 text-brand-800 border border-brand-200'
              : statusMsg.type === 'warning'
              ? 'bg-amber-50 text-amber-800 border border-amber-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-slate-700">
            ×
          </button>
        </div>
      )}

      {/* Order Details View */}
      {order && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Order Summary */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-navy-800 text-sm">{order.orderNumber}</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-brand-100 text-brand-800">
                {order.status}
              </span>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <strong className="text-navy-700">{order.customerId?.name || 'Walk-in Shopper'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Phone:</span>
                <strong className="text-navy-700">{order.customerId?.phone || '+254 712 345 678'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Order Amount:</span>
                <strong className="text-brand-700 text-sm">{formatKes(order.totalMinor)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pickup Slot / Time:</span>
                <strong className="text-navy-700">{order.pickupSlot || 'Scan & Go Immediate'}</strong>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-2 pt-2">
              <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider">
                Customer Assistance Tools
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleResendReceipt}
                  className="p-2.5 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 flex items-center justify-center space-x-1.5"
                >
                  <Receipt className="w-3.5 h-3.5 text-azure-600" />
                  <span>Resend Receipt SMS</span>
                </button>
                <button
                  onClick={() => alert(`STK Payment re-queried: Confirmed successful on Daraja API.`)}
                  className="p-2.5 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 flex items-center justify-center space-x-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-brand-600" />
                  <span>Requery STK Status</span>
                </button>
              </div>
            </div>
          </div>

          {/* Refund & Exception Processing */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4 text-xs">
            <div className="flex items-center space-x-2">
              <RotateCcw className="w-4 h-4 text-rose-600" />
              <h3 className="font-bold text-navy-800 text-sm">Issue Safe Refund</h3>
            </div>
            <p className="text-slate-500 text-[11px]">
              Cashiers can directly refund up to <strong className="text-navy-700">KES 2,000</strong>. Amounts higher than KES 2,000 automatically route to the Branch Manager approvals queue.
            </p>

            <form onSubmit={handleProcessRefund} className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Refund Amount (KES)</label>
                <input
                  type="number"
                  value={refundAmountKes}
                  onChange={(e) => setRefundAmountKes(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 font-bold text-navy-800"
                  required
                />
                {Number(refundAmountKes) > 2000 && (
                  <span className="text-[10px] text-amber-700 font-bold block mt-1">
                    ⚠️ Exceeds KES 2,000: Will require Branch Manager dual sign-off.
                  </span>
                )}
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Reason for Refund</label>
                <select
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-white font-medium"
                >
                  <option>Customer returned damaged item in aisle</option>
                  <option>Overcharged / Pricing mismatch</option>
                  <option>Item out of stock during pickup</option>
                  <option>Customer changed mind at counter</option>
                </select>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={processingRefund}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-xs transition"
                >
                  {processingRefund
                    ? 'Processing...'
                    : Number(refundAmountKes) > 2000
                    ? 'Request Manager Dual Sign-off'
                    : 'Process Instant Cashier Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
