import React, { useRef, useState } from 'react';
import {
  ScanLine,
  Plus,
  Minus,
  Trash2,
  Receipt,
  Banknote,
  CreditCard,
  CheckCircle2,
  UserPlus,
  Search,
  Loader2,
} from 'lucide-react';
import { Store } from '../../types.js';
import { apiRequest, formatKes } from '../../api.js';

interface PosTillViewProps {
  currentStore: Store;
}

interface BasketItem {
  productId: string;
  barcode: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  isWeighted?: boolean;
  weightGrams?: number;
  tagSerial?: string;
}

interface TillBasket {
  id: string;
  status: string;
  totalMinor: number;
  totalItems: number;
  expectedWeightGrams?: number;
  trustTier?: number;
  items: BasketItem[];
  customer?: { name?: string; phone?: string; isGuest?: boolean } | null;
  guestPass?: { passId?: string; label?: string } | null;
}

interface TillOrder {
  _id: string;
  orderNumber?: string;
  totalMinor: number;
  status: string;
}

/**
 * Cashier POS till: walk-in sales and assisted checkout for Scan & Go baskets.
 * All mutations go through the same backend engine as customer self-checkout.
 */
export const PosTillView: React.FC<PosTillViewProps> = ({ currentStore }) => {
  const [basket, setBasket] = useState<TillBasket | null>(null);
  const [order, setOrder] = useState<TillOrder | null>(null);
  const [paid, setPaid] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const [lookupQuery, setLookupQuery] = useState('');
  const [scanInput, setScanInput] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  const flash = (type: 'success' | 'error' | 'info', text: string) => setMsg({ type, text });

  const applyBasketResponse = (data: any) => {
    if (data?.basket) {
      const b = data.basket;
      setBasket({
        id: b._id || b.id,
        status: b.status,
        totalMinor: b.totalMinor,
        totalItems: b.totalItems,
        expectedWeightGrams: b.expectedWeightGrams,
        trustTier: b.trustTier,
        items: b.items || [],
        customer: b.customer,
        guestPass: b.guestPass || (data.guestPass ? { passId: data.guestPass.passId } : null),
      });
    }
  };

  const newWalkIn = async () => {
    try {
      setBusy('walkin');
      setMsg(null);
      setOrder(null);
      setPaid(false);
      const res = await apiRequest('/pos/baskets/walkin', {
        method: 'POST',
        body: JSON.stringify({ storeId: currentStore._id, label: 'POS walk-in' }),
      });
      applyBasketResponse(res);
      flash('success', `Walk-in basket ready — ${res.guestPass?.passId || ''}`);
      setTimeout(() => scanRef.current?.focus(), 50);
    } catch (err: any) {
      flash('error', err.message || 'Could not start walk-in basket');
    } finally {
      setBusy(null);
    }
  };

  const lookupBasket = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!lookupQuery.trim()) return;
    try {
      setBusy('lookup');
      setMsg(null);
      const res = await apiRequest(`/pos/baskets/lookup?storeId=${currentStore._id}&q=${encodeURIComponent(lookupQuery.trim())}`);
      applyBasketResponse(res);
      flash('success', 'Basket loaded.');
    } catch (err: any) {
      setBasket(null);
      flash('error', err.message || 'No open basket found');
    } finally {
      setBusy(null);
    }
  };

  const scanItem = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const barcode = scanInput.trim();
    if (!basket || !barcode) return;
    try {
      setBusy('scan');
      setMsg(null);
      const res = await apiRequest(`/pos/baskets/${basket.id}/scan`, {
        method: 'POST',
        body: JSON.stringify({ barcode }),
      });
      applyBasketResponse(res);
      if (res?.scannedProduct?.name) flash('info', `Added: ${res.scannedProduct.name}`);
      else if (res?.code === 'UNKNOWN_BARCODE') flash('error', 'Unknown barcode — not in catalogue.');
      else flash('error', res?.error || 'Scan rejected');
      setScanInput('');
      scanRef.current?.focus();
    } catch (err: any) {
      const d = err.data || {};
      flash('error', d.error || err.message || 'Scan failed');
      setScanInput('');
    } finally {
      setBusy(null);
    }
  };

  const setQty = async (item: BasketItem, quantity: number) => {
    if (!basket || quantity < 0) return;
    try {
      setBusy(`qty-${item.productId}`);
      const res = await apiRequest(`/pos/baskets/${basket.id}/items/${item.productId}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity }),
      });
      applyBasketResponse(res);
    } catch (err: any) {
      flash('error', err.message || 'Quantity update failed');
    } finally {
      setBusy(null);
    }
  };

  const checkout = async () => {
    if (!basket) return;
    try {
      setBusy('checkout');
      const res = await apiRequest(`/pos/baskets/${basket.id}/checkout`, { method: 'POST', body: '{}' });
      setOrder(res.order);
      flash('success', `Order ${res.order?.orderNumber || ''} created — take payment below.`);
    } catch (err: any) {
      flash('error', err.message || 'Checkout failed');
    } finally {
      setBusy(null);
    }
  };

  const takePayment = async (method: 'CASH' | 'CARD') => {
    if (!order) return;
    try {
      setBusy('pay');
      const res = await apiRequest(`/pos/orders/${order._id}/cash-payment`, {
        method: 'POST',
        body: JSON.stringify({ method }),
      });
      setPaid(true);
      flash('success', `Paid KES ${formatKes(order.totalMinor)} via ${method}. Customer can exit.`);
    } catch (err: any) {
      flash('error', err.message || 'Payment failed');
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setBasket(null);
    setOrder(null);
    setPaid(false);
    setMsg(null);
    setLookupQuery('');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 font-sans">
      {/* Header + actions */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <span className="bg-brand-100 text-brand-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            Cashier POS Till
          </span>
          <h2 className="text-lg font-black text-navy-800 mt-1">Scan & Go Assisted Checkout</h2>
          <p className="text-xs text-slate-500">
            Walk-in sales, guest baskets and phone-assisted checkout — same prices as self-checkout.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={newWalkIn}
            disabled={!!busy}
            className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5"
          >
            {busy === 'walkin' ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            <span>New Walk-in Sale</span>
          </button>
          {(basket || order) && (
            <button onClick={reset} className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Lookup existing basket */}
      <form onSubmit={lookupBasket} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Find open basket: GP-XXXX pass, customer phone, or basket ID…"
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
            className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-xs font-medium focus:outline-brand-500"
          />
        </div>
        <button type="submit" disabled={!!busy} className="px-5 py-2.5 bg-navy-700 hover:bg-navy-800 text-white rounded-xl text-xs font-bold">
          {busy === 'lookup' ? 'Finding…' : 'Load Basket'}
        </button>
      </form>

      {msg && (
        <div className={`p-3.5 rounded-2xl text-xs font-bold ${
          msg.type === 'success' ? 'bg-brand-50 text-brand-800 border border-brand-200'
          : msg.type === 'info' ? 'bg-azure-50 text-azure-800 border border-azure-200'
          : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          {msg.text}
        </div>
      )}

      {/* Paid confirmation */}
      {paid && order && (
        <div className="bg-brand-50 border-2 border-brand-300 rounded-3xl p-6 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-brand-600 mx-auto" />
          <h3 className="text-base font-black text-navy-800">Sale Complete</h3>
          <p className="text-xs text-slate-600">
            Order <strong className="font-mono">{order.orderNumber || order._id}</strong> — {formatKes(order.totalMinor)} paid.
            The customer may now leave via the exit lane.
          </p>
          <button onClick={reset} className="mt-2 px-5 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold">
            Start Next Sale
          </button>
        </div>
      )}

      {/* Basket + payment grid */}
      {!paid && (basket || order) && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Items column */}
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-navy-800 text-sm">
                  {basket?.customer?.name || 'Walk-in customer'}
                  {basket?.customer?.isGuest && (
                    <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-black">GUEST</span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {basket?.guestPass?.passId || basket?.id}
                  {basket?.trustTier === 2 && ' · Tier 2 (staff-assisted)'}
                </p>
              </div>
              <span className="text-xs font-black text-brand-700">{formatKes(basket?.totalMinor || 0)}</span>
            </div>

            {/* Scan input */}
            {basket && !order && (
              <form onSubmit={scanItem} className="flex gap-2">
                <div className="relative flex-1">
                  <ScanLine className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    ref={scanRef}
                    type="text"
                    placeholder="Scan or type barcode…"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:outline-brand-500"
                    autoFocus
                  />
                </div>
                <button type="submit" disabled={!!busy || !scanInput.trim()} className="px-4 py-2.5 bg-azure-600 hover:bg-azure-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold">
                  {busy === 'scan' ? '…' : 'Add'}
                </button>
              </form>
            )}

            {/* Items */}
            <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
              {(basket?.items || []).length === 0 && (
                <p className="text-xs text-slate-400 text-center py-8">Basket is empty — scan the first item.</p>
              )}
              {(basket?.items || []).map((item) => (
                <div key={item.productId} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-navy-800 truncate">{item.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {item.barcode}
                      {item.isWeighted && item.weightGrams ? ` · ${(item.weightGrams / 1000).toFixed(2)}kg` : ''}
                      {item.tagSerial ? ' · serialized' : ''}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {basket && !order ? (
                      <>
                        <button onClick={() => setQty(item, item.quantity - 1)} className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center font-bold">{item.quantity}</span>
                        <button onClick={() => setQty(item, item.quantity + 1)} className="w-6 h-6 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
                          <Plus className="w-3 h-3" />
                        </button>
                        <button onClick={() => setQty(item, 0)} className="w-6 h-6 rounded-lg border border-rose-200 text-rose-500 flex items-center justify-center hover:bg-rose-50">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <span className="font-bold w-6 text-center">×{item.quantity}</span>
                    )}
                    <span className="w-20 text-right font-bold text-navy-800">
                      {formatKes(item.unitPriceMinor * item.quantity)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500">
                {basket?.totalItems ?? 0} items
                {basket?.expectedWeightGrams ? ` · est. ${(basket.expectedWeightGrams / 1000).toFixed(2)}kg` : ''}
              </span>
              <span className="text-base font-black text-navy-800">{formatKes(basket?.totalMinor || 0)}</span>
            </div>
          </div>

          {/* Payment column */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4">
            {!order ? (
              <>
                <h3 className="font-bold text-navy-800 text-sm flex items-center space-x-2">
                  <Receipt className="w-4 h-4 text-brand-600" />
                  <span>Checkout</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Converts the basket into an order. Payment is then recorded at the till — the customer pays cash or card here, no M-Pesa prompt needed.
                </p>
                <button
                  onClick={checkout}
                  disabled={!!busy || !basket || (basket?.items || []).length === 0}
                  className="w-full py-3 bg-navy-700 hover:bg-navy-800 disabled:opacity-40 text-white rounded-xl text-sm font-bold"
                >
                  {busy === 'checkout' ? 'Creating order…' : `Checkout — ${formatKes(basket?.totalMinor || 0)}`}
                </button>
              </>
            ) : !paid ? (
              <>
                <h3 className="font-bold text-navy-800 text-sm flex items-center space-x-2">
                  <Banknote className="w-4 h-4 text-brand-600" />
                  <span>Take Payment</span>
                </h3>
                <div className="bg-slate-50 rounded-2xl p-4 text-center">
                  <p className="text-[10px] uppercase font-black text-slate-400">Amount due</p>
                  <p className="text-2xl font-black text-navy-800">{formatKes(order.totalMinor)}</p>
                  <p className="text-[11px] font-mono text-slate-400">{order.orderNumber || order._id}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => takePayment('CASH')}
                    disabled={!!busy}
                    className="py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center justify-center space-x-2"
                  >
                    <Banknote className="w-4 h-4" />
                    <span>{busy === 'pay' ? '…' : 'Cash'}</span>
                  </button>
                  <button
                    onClick={() => takePayment('CARD')}
                    disabled={!!busy}
                    className="py-3 bg-azure-600 hover:bg-azure-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center justify-center space-x-2"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>{busy === 'pay' ? '…' : 'Card'}</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 text-center">
                  Records a verified till payment — order goes PAID and the exit QR is issued.
                </p>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!basket && !order && !paid && (
        <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-10 text-center space-y-3">
          <ScanLine className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-500">No basket loaded</p>
          <p className="text-xs text-slate-400">
            Start a <strong>New Walk-in Sale</strong> for a customer without the app, or look up an existing basket by guest pass / phone.
          </p>
        </div>
      )}
    </div>
  );
};
