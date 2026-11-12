import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, ChevronDown, Loader2, RefreshCw, ShoppingBag } from 'lucide-react';
import { formatKes } from '../../api.js';
import {
  AWAITING_PAYMENT,
  CustomerOrder,
  PendingSubstitution,
  TONE_CLASSES,
  hasPass,
  isActiveOrder,
  statusLabel,
  statusTone,
  amountDueNow, balanceDueMinor, showsPickupNumber } from './customerTypes.js';

interface Props {
  orders: CustomerOrder[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  pendingSubs: PendingSubstitution[];
  onRespond: (sub: PendingSubstitution, decision: 'APPROVED' | 'REJECTED') => Promise<void>;
  onPay: (order: CustomerOrder) => void;
  goShop: () => void;
}

export const OrdersSection: React.FC<Props> = ({ orders, loading, error, onRefresh, pendingSubs, onRespond, onPay, goShop }) => {
  const [tab, setTab] = useState<'ACTIVE' | 'PAST'>('ACTIVE');
  const [responding, setResponding] = useState<string | null>(null);

  const shown = orders.filter((o) => (tab === 'ACTIVE' ? isActiveOrder(o) : !isActiveOrder(o)));

  const respond = async (sub: PendingSubstitution, d: 'APPROVED' | 'REJECTED') => {
    const key = `${sub.orderId}:${sub.productId}`;
    setResponding(key);
    try {
      await onRespond(sub, d);
    } finally {
      setResponding(null);
    }
  };

  return (
    <div className="space-y-5">
      {pendingSubs.map((sub) => {
        const key = `${sub.orderId}:${sub.productId}`;
        return (
          <div key={key} className="bg-white p-5 rounded-2xl border border-amber-300 shadow-sm flex flex-col md:flex-row justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-700">
                  Your reply is needed{sub.orderNumber ? ` · order #${sub.orderNumber}` : ''}
                </span>
                <h4 className="font-bold text-sm text-navy-700 mt-0.5">{sub.originalName} is out of stock.</h4>
                <p className="text-xs text-slate-600">
                  The picker suggests <strong>{sub.replacementName}</strong> at {formatKes(sub.replacementPriceMinor)}.
                  {typeof sub.priceDifferenceMinor === 'number' && sub.priceDifferenceMinor !== 0 && (
                    <>
                      {' '}
                      Your total changes by {sub.priceDifferenceMinor > 0 ? '+' : '-'}
                      {formatKes(Math.abs(sub.priceDifferenceMinor))}.
                    </>
                  )}{' '}
                  If you decline, that item is removed and refunded.
                </p>
              </div>
            </div>
            <div className="flex gap-2 md:self-center">
              <button
                disabled={responding === key}
                onClick={() => respond(sub, 'REJECTED')}
                className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 disabled:opacity-60 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold"
              >
                Decline
              </button>
              <button
                disabled={responding === key}
                onClick={() => respond(sub, 'APPROVED')}
                className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold"
              >
                Approve replacement
              </button>
            </div>
          </div>
        );
      })}

      <div className="flex items-center justify-between">
        <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1">
          {(['ACTIVE', 'PAST'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-xs font-bold ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {t === 'ACTIVE' ? 'Active' : 'Past orders'}
            </button>
          ))}
        </div>
        <button onClick={onRefresh} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-700">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>}

      {loading && orders.length === 0 ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      ) : shown.length === 0 ? (
        <div className="py-16 bg-white rounded-2xl border border-slate-200 text-center text-slate-400 space-y-2">
          <ShoppingBag className="w-10 h-10 mx-auto stroke-1" />
          <p className="text-sm font-bold">{tab === 'ACTIVE' ? 'No active orders.' : 'No past orders yet.'}</p>
          {tab === 'ACTIVE' && (
            <button onClick={goShop} className="text-xs font-bold text-brand-700 hover:underline">
              Start shopping
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5">
          {shown.map((o) => (
            <article key={o._id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col gap-4">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <span className="text-sm font-black text-navy-700">#{o.orderNumber}</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {o.orderType === 'SCAN_AND_GO'
                      ? 'Scan & Go'
                      : `Pickup ${o.pickupSlot?.date || ''} ${o.pickupSlot?.timeWindow || ''}`.trim()}
                  </p>
                  <p className="text-[11px] text-slate-400">{new Date(o.createdAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${TONE_CLASSES[statusTone(o.status)]}`}>
                  {statusLabel(o.status)}
                </span>
              </div>

              {hasPass(o) && (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center space-y-3">
                  {o.collectionQrToken && (
                    <div className="bg-white p-3 rounded-2xl inline-block border border-slate-200">
                      <QRCodeSVG value={o.collectionQrToken} size={140} level="H" />
                    </div>
                  )}
                  {o.collectionCode && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Collection code</span>
                      <span className="text-xl font-black font-mono tracking-widest text-brand-700">{o.collectionCode}</span>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500">Show this at the exit lane or collection counter. Don&apos;t share it.</p>
                </div>
              )}

              {showsPickupNumber(o) && (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center space-y-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Pickup order number</span>
                  <span className="text-xl font-black font-mono tracking-wider text-brand-700">{o.orderNumber}</span>
                  {balanceDueMinor(o) > 0 && (
                    <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-1.5">
                      Balance at pickup: {formatKes(balanceDueMinor(o))}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500">Give this number at the collection counter. A one-time code goes to your phone; bring your ID.</p>
                </div>
              )}

              <div className="text-xs text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span>Items</span>
                  <span className="font-bold text-navy-700">{o.totalItems}</span>
                </div>
                <div className="flex justify-between">
                  <span>{AWAITING_PAYMENT.includes(o.status) ? (o.status === 'AWAITING_FINAL_PAYMENT' ? 'Balance to pay' : o.paymentPlan === 'DEPOSIT' ? 'Deposit to pay' : 'To pay') : 'Total'}</span>
                  <span className="font-bold text-brand-700">{formatKes(AWAITING_PAYMENT.includes(o.status) ? amountDueNow(o) : o.totalMinor)}</span>
                </div>
                {AWAITING_PAYMENT.includes(o.status) && o.totalMinor !== amountDueNow(o) && (
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Order total</span>
                    <span>{formatKes(o.totalMinor)}</span>
                  </div>
                )}
              </div>

              {o.items && o.items.length > 0 && (
                <details className="text-xs group">
                  <summary className="cursor-pointer font-semibold text-slate-500 hover:text-navy-700 flex items-center gap-1 list-none">
                    <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition" /> View items
                  </summary>
                  <ul className="mt-2 space-y-1 text-slate-600">
                    {o.items.map((i, idx) => (
                      <li key={idx} className="flex justify-between gap-2">
                        <span className="truncate">
                          {i.quantity} × {i.productName}
                        </span>
                        <span className="font-semibold">{formatKes(i.lineTotalMinor)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {AWAITING_PAYMENT.includes(o.status) && (
                <button onClick={() => onPay(o)} className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-2.5 rounded-xl text-xs">
                  {o.status === 'AWAITING_FINAL_PAYMENT' ? 'Pay balance' : o.paymentPlan === 'DEPOSIT' ? 'Pay deposit' : 'Pay now'}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
};