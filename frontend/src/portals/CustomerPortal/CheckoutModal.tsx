import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Smartphone, X, AlertTriangle, CreditCard } from 'lucide-react';
import { apiRequest, formatKes } from '../../api.js';
import { CartLine } from './useCart.js';
import { CustomerOrder, amountDueNow, depositFor, normalizeKenyanPhone } from './customerTypes.js';

export interface NewOrderRequest {
  mode: 'SHOP' | 'SCAN_GO';
  storeId: string;
  lines: CartLine[];
  pickup?: { slotId: string; date: string; timeWindow: string };
  substitutionsAllowed: boolean;
  paymentPlan?: 'FULL' | 'DEPOSIT';
  depositPercent?: number;
}

interface Props {
  onClose: () => void;
  onOrderCreated: () => void; // the cart has become an order: caller should empty it
  onPaid: (order: CustomerOrder) => void;
  defaultPhone: string;
  defaultEmail?: string;
  totalMinor: number;
  newOrder?: NewOrderRequest;
  existingOrder?: CustomerOrder; // paying an order that is still awaiting payment
}

type Phase = 'form' | 'working' | 'waiting' | 'failed';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const CheckoutModal: React.FC<Props> = ({
  onClose,
  onOrderCreated,
  onPaid,
  defaultPhone,
  defaultEmail = '',
  totalMinor: liveTotalMinor,
  newOrder,
  existingOrder,
}) => {
  // Snapshot the amounts: the cart is emptied as soon as the order is created, but they must stay on screen.
  const [totalMinor] = useState(existingOrder?.totalMinor ?? liveTotalMinor);
  const percent = newOrder?.depositPercent ?? 50;
  const [dueNowMinor] = useState(() => {
    if (existingOrder) return amountDueNow(existingOrder, percent);
    return newOrder?.mode === 'SHOP' && newOrder.paymentPlan === 'DEPOSIT' ? depositFor(liveTotalMinor, percent) : liveTotalMinor;
  });
  const balanceLaterMinor = Math.max(0, totalMinor - (existingOrder?.paidMinor || 0) - dueNowMinor);
  const isBalancePayment = Boolean(existingOrder && (existingOrder.paidMinor || 0) > 0);
  const [phone, setPhone] = useState(defaultPhone);
  const [email, setEmail] = useState(defaultEmail);
  const [method, setMethod] = useState<'MPESA' | 'CARD'>('MPESA');
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState('');
  const orderIdRef = useRef<string | null>(existingOrder?._id ?? null); // reuse the order on retry: never double-create
  const stopped = useRef(false);
  const stopWaiting = useRef(false); // customer chose "stop waiting"
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    stopped.current = false; // React StrictMode mounts twice in development
    return () => {
      stopped.current = true;
    };
  }, []);

  const createOrder = async (): Promise<string> => {
    if (!newOrder) throw new Error('Nothing to pay for.');
    let orderRes: any;
    if (newOrder.mode === 'SCAN_GO') {
      const basketRes = await apiRequest('/baskets', {
        method: 'POST',
        body: JSON.stringify({ storeId: newOrder.storeId }),
      });
      try {
        for (const line of newOrder.lines) {
          await apiRequest(`/baskets/${basketRes.basket._id}/scan`, {
            method: 'POST',
            body: JSON.stringify({ barcode: line.product.barcode, quantity: line.quantity }),
          });
        }
      } catch (scanError) {
        // A refused scan (for example the check-in limit) must not leave a half-filled basket that a retry would add to.
        await apiRequest(`/baskets/${basketRes.basket._id}/clear`, { method: 'DELETE' }).catch(() => {});
        throw scanError;
      }
      orderRes = await apiRequest('/orders/checkout-basket', {
        method: 'POST',
        body: JSON.stringify({ basketId: basketRes.basket._id }),
      });
    } else {
      orderRes = await apiRequest('/orders/click-and-collect', {
        method: 'POST',
        body: JSON.stringify({
          storeId: newOrder.storeId,
          items: newOrder.lines.map((l) => ({ productId: l.product._id, quantity: l.quantity })),
          pickupSlot: newOrder.pickup,
          substitutionsAllowed: newOrder.substitutionsAllowed,
          paymentPlan: newOrder.paymentPlan || 'FULL',
        }),
      });
    }
    return orderRes.order._id;
  };

  const fetchOrder = async (id: string): Promise<CustomerOrder> => {
    const r = await apiRequest(`/orders/${id}`);
    return (r.order || r) as CustomerOrder;
  };

  // Wait until the server resolves the payment. The server asks M-Pesa itself, so this works even if the callback is delayed.
  // The server marks an unanswered prompt TIMED_OUT after ~150s, so we poll slightly longer than that.
  const waitForPayment = async (paymentId: string, orderId: string, windowMs: number): Promise<CustomerOrder | null> => {
    const startedAt = Date.now();
    const deadline = startedAt + windowMs + 20_000;
    while (!stopped.current && !stopWaiting.current && Date.now() < deadline) {
      setSecondsLeft(Math.max(0, Math.ceil((startedAt + windowMs - Date.now()) / 1000)));
      await sleep(3000);
      let p: any;
      try {
        p = await apiRequest(`/payments/${paymentId}/status`);
      } catch {
        // transient network error: keep polling
      }
      if (p?.status === 'SUCCESS') return fetchOrder(orderId);
      if (p?.status === 'HELD') throw new Error('Your payment needs support review. Please contact the store.');
      if (p?.status === 'FAILED' || p?.status === 'TIMED_OUT') {
        throw new Error(p.message || (p.status === 'TIMED_OUT' ? 'The M-Pesa prompt timed out. You can retry.' : 'Payment was not completed. You can retry.'));
      }
    }
    return null;
  };

  const pay = async () => {
    setError('');
    stopWaiting.current = false;
    const normalized = method === 'MPESA' ? normalizeKenyanPhone(phone) : '';
    if (method === 'MPESA' && !normalized) {
      setError('Enter a valid Safaricom number, e.g. 0712 345 678.');
      return;
    }
    try {
      setPhase('working');
      if (!orderIdRef.current) {
        orderIdRef.current = await createOrder();
        onOrderCreated();
      }
      const orderId = orderIdRef.current;

      if (method === 'CARD') {
        if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error('Enter a valid email address for card checkout.');
        const checkout = await apiRequest('/payments/card/checkout', { method: 'POST', body: JSON.stringify({ orderId, email: email.trim() }) });
        window.location.assign(checkout.checkoutUrl);
        return;
      }
      let paymentId: string;
      let windowMs = 150_000;
      try {
        const started = await apiRequest('/payments/mpesa/stk-push', {
          method: 'POST',
          body: JSON.stringify({ orderId, phone: normalized }),
        });
        paymentId = started.paymentId;
        if (started.expiresInSeconds) windowMs = started.expiresInSeconds * 1000;
      } catch (e: any) {
        // A live prompt already exists for this order: resume watching it instead of sending a second one.
        if (e?.data?.code === 'PAYMENT_IN_PROGRESS' && e?.data?.paymentId && e?.data?.method === 'MPESA') {
          paymentId = e.data.paymentId;
          windowMs = 90_000;
        } else throw e;
      }

      setPhase('waiting');
      const paid = await waitForPayment(paymentId!, orderId, windowMs);
      if (stopped.current) return;
      if (paid) {
        onPaid(paid);
      } else {
        setError(
          stopWaiting.current
            ? 'Stopped waiting. If you already entered your PIN, the payment will still be matched to your order, so check My Orders before paying again.'
            : "We haven't received confirmation from M-Pesa yet. If you entered your PIN, your order will update shortly, so check My Orders before paying again. Otherwise tap Retry."
        );
        setPhase('failed');
      }
    } catch (e: any) {
      if (stopped.current) return;
      const code = e?.data?.code;
      setError(
        code === 'FEATURE_UNAVAILABLE' || code === 'PLAN_FEATURE_UNAVAILABLE'
          ? `${e.message || 'Shop & Collect is unavailable for this supermarket.'} Nothing was charged. You can choose another store, or use Scan & Go in the store.`
          : code === 'DEPOSIT_NOT_AVAILABLE'
          ? e.message
          : e.message || 'Payment failed. Please try again.'
      );
      setPhase('failed');
    }
  };

  const busy = phase === 'working' || phase === 'waiting';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <h3 className="font-bold text-base text-navy-700">Secure checkout</h3>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            {isBalancePayment ? 'Balance to pay' : balanceLaterMinor > 0 ? 'Deposit to pay now' : 'To pay now'}
          </p>
          <span className="text-3xl font-black text-navy-800 tracking-tight">{formatKes(dueNowMinor)}</span>
          {balanceLaterMinor > 0 ? (
            <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800 text-left space-y-0.5">
              <div className="flex justify-between"><span>Order total</span><strong>{formatKes(totalMinor)}</strong></div>
              <div className="flex justify-between"><span>Balance to pay at pickup</span><strong>{formatKes(balanceLaterMinor)}</strong></div>
              <p className="pt-1 text-amber-700">The deposit is not refundable if the order is not collected in its pickup window.</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500 mt-0.5">Final price is confirmed by the store at payment</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMethod('MPESA')} className={`rounded-xl border p-2 text-xs font-bold ${method === 'MPESA' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}><Smartphone className="w-4 h-4 inline mr-1"/>M-Pesa</button>
          <button type="button" onClick={() => setMethod('CARD')} className={`rounded-xl border p-2 text-xs font-bold ${method === 'CARD' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}><CreditCard className="w-4 h-4 inline mr-1"/>Card</button>
        </div>
        {phase === 'waiting' ? (
          <div className="text-center space-y-3 py-4">
            <Smartphone className="w-10 h-10 mx-auto text-brand-600" />
            <p className="text-sm font-bold text-navy-700">Check your phone</p>
            <p className="text-xs text-slate-500">
              Enter your M-Pesa PIN on the prompt sent to {phone}. This screen updates automatically.
            </p>
            <Loader2 className="w-5 h-5 mx-auto animate-spin text-brand-600" />
            {secondsLeft > 0 && <p className="text-[11px] text-slate-400">Prompt expires in about {secondsLeft}s</p>}
            <button type="button" onClick={() => { stopWaiting.current = true; }} className="text-[11px] font-bold text-slate-500 underline">
              Didn't get a prompt? Stop waiting
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {method === 'CARD' ? <div className="space-y-1"><label htmlFor="card-email" className="text-xs font-bold text-slate-700">Email for receipt</label><input id="card-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" placeholder="you@example.com" /></div> : (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1.5 text-xs">
              <label htmlFor="mpesa-phone" className="font-bold text-slate-700 block">
                Safaricom number to charge
              </label>
              <input
                id="mpesa-phone"
                inputMode="tel"
                value={phone}
                disabled={busy}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-navy-800 font-mono font-bold"
              />
              <p className="text-[11px] text-slate-500">You will enter your PIN on your own phone, never in this app.</p>
            </div>
            )}

            {error && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-3 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              disabled={busy}
              onClick={pay}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-2xl text-xs transition shadow-md shadow-brand-600/20 flex items-center justify-center gap-2"
            >
              {phase === 'working' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Preparing your order...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> {phase === 'failed' ? 'Retry payment' : method === 'CARD' ? 'Continue to card payment' : 'Send M-Pesa prompt'}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
