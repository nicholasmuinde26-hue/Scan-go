import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, PackageCheck, Search, ShieldCheck, Smartphone } from 'lucide-react';
import { Store, User } from '../types.js';
import { apiRequest, formatKes } from '../api.js';

interface HandoverCollectionViewProps {
  currentStore: Store;
  currentUser?: User | null;
}

interface HandoverOrder {
  _id: string;
  orderNumber: string;
  status: string;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
  paymentPlan?: 'FULL' | 'DEPOSIT';
  totalItems: number;
  pickupSlot?: { date: string; timeWindow: string };
  customerName?: string;
  customerPhoneMasked?: string;
  verified: boolean;
}

type Step = 'LOOKUP' | 'VERIFY' | 'BALANCE' | 'DONE';
type Notice = { type: 'success' | 'error'; text: string } | null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const HandoverCollectionView: React.FC<HandoverCollectionViewProps> = ({ currentStore, currentUser }) => {
  const [step, setStep] = useState<Step>('LOOKUP');
  const [orderNumber, setOrderNumber] = useState('');
  const [order, setOrder] = useState<HandoverOrder | null>(null);
  const [otp, setOtp] = useState('');
  const [idChecked, setIdChecked] = useState(false);
  const [otpSentTo, setOtpSentTo] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [promptState, setPromptState] = useState<'IDLE' | 'WAITING' | 'FAILED'>('IDLE');
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const fail = (e: any, fallback: string) => setNotice({ type: 'error', text: e?.message || fallback });

  const reset = () => {
    setStep('LOOKUP');
    setOrderNumber('');
    setOrder(null);
    setOtp('');
    setIdChecked(false);
    setOtpSentTo('');
    setDevOtp('');
    setPromptState('IDLE');
    setNotice(null);
  };

  const lookup = async (number: string) => {
    const res = await apiRequest('/orders/handover/lookup', { method: 'POST', body: JSON.stringify({ orderNumber: number }) });
    return res.order as HandoverOrder;
  };

  const onLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim()) return;
    try {
      setBusy(true);
      setNotice(null);
      const found = await lookup(orderNumber.trim());
      setOrder(found);
      // Resume mid-way if the customer already got through verification (e.g. came back after paying).
      if (found.verified && found.status === 'AWAITING_FINAL_PAYMENT') setStep('BALANCE');
      else if (found.verified && found.status === 'READY_FOR_PICKUP' && found.balanceMinor === 0) setStep('BALANCE');
      else setStep('VERIFY');
    } catch (err: any) {
      fail(err, 'Could not find that order.');
    } finally {
      setBusy(false);
    }
  };

  const sendOtp = async () => {
    if (!order) return;
    try {
      setBusy(true);
      setNotice(null);
      const res = await apiRequest(`/orders/handover/${order._id}/send-otp`, { method: 'POST' });
      setOtpSentTo(res.sentTo || '');
      setDevOtp(res.devOtpCode || '');
      setNotice({
        type: res.delivered ? 'success' : 'error',
        text: res.delivered
          ? `Code sent to ${res.sentTo}. Ask the customer to read it out.`
          : 'The SMS could not be delivered. Check that SMS is configured, then send again.',
      });
    } catch (err: any) {
      fail(err, 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    try {
      setBusy(true);
      setNotice(null);
      const res = await apiRequest(`/orders/handover/${order._id}/verify-otp`, {
        method: 'POST',
        body: JSON.stringify({ otp: otp.trim(), idChecked }),
      });
      setOrder(res.order);
      setOtp('');
      if (res.completed) {
        setStep('DONE');
        setNotice({ type: 'success', text: res.message || 'Order handed over.' });
      } else {
        setStep('BALANCE');
        setNotice(null);
      }
    } catch (err: any) {
      const left = err?.data?.attemptsLeft;
      setNotice({ type: 'error', text: `${err?.message || 'Verification failed.'}${typeof left === 'number' ? ` ${left} attempt(s) left.` : ''}` });
    } finally {
      setBusy(false);
    }
  };

  // Prompt goes to the customer's registered phone; staff never types a number here.
  const sendBalancePrompt = async () => {
    if (!order) return;
    setNotice(null);
    setPromptState('WAITING');
    try {
      let paymentId: string;
      try {
        const started = await apiRequest('/payments/mpesa/stk-push', { method: 'POST', body: JSON.stringify({ orderId: order._id }) });
        paymentId = started.paymentId;
      } catch (e: any) {
        if (e?.data?.code === 'PAYMENT_IN_PROGRESS' && e?.data?.paymentId) paymentId = e.data.paymentId;
        else throw e;
      }
      const deadline = Date.now() + 170_000;
      while (alive.current && Date.now() < deadline) {
        await sleep(3000);
        let p: any;
        try {
          p = await apiRequest(`/payments/${paymentId}/status`);
        } catch {
          continue; // transient: keep polling
        }
        if (p?.status === 'SUCCESS') {
          const fresh = await lookup(order.orderNumber);
          if (alive.current) {
            setOrder(fresh);
            setPromptState('IDLE');
            setNotice({ type: 'success', text: 'Balance received. You can release the order.' });
          }
          return;
        }
        if (p?.status === 'FAILED' || p?.status === 'TIMED_OUT' || p?.status === 'HELD') {
          throw new Error(p.message || 'The customer did not complete the payment.');
        }
      }
      if (alive.current) {
        setPromptState('FAILED');
        setNotice({ type: 'error', text: 'No confirmation yet. If the customer entered their PIN, tap “Check payment”.' });
      }
    } catch (err: any) {
      if (!alive.current) return;
      setPromptState('FAILED');
      fail(err, 'Could not send the payment prompt.');
    }
  };

  const refreshOrder = async () => {
    if (!order) return;
    try {
      setBusy(true);
      const fresh = await lookup(order.orderNumber);
      setOrder(fresh);
      if (fresh.balanceMinor === 0 && fresh.status === 'READY_FOR_PICKUP') {
        setPromptState('IDLE');
        setNotice({ type: 'success', text: 'Balance received. You can release the order.' });
      } else {
        setNotice({ type: 'error', text: 'Payment not received yet.' });
      }
    } catch (err: any) {
      fail(err, 'Could not refresh the order.');
    } finally {
      setBusy(false);
    }
  };

  const release = async () => {
    if (!order) return;
    try {
      setBusy(true);
      const res = await apiRequest(`/orders/handover/${order._id}/complete`, { method: 'POST' });
      setOrder(res.order);
      setStep('DONE');
      setNotice({ type: 'success', text: res.message || 'Order handed over.' });
    } catch (err: any) {
      fail(err, 'Could not release the order.');
    } finally {
      setBusy(false);
    }
  };

  const abort = async () => {
    if (!order) return;
    try {
      setBusy(true);
      await apiRequest(`/orders/handover/${order._id}/abort`, { method: 'POST' });
      reset();
      setNotice({ type: 'success', text: 'Order kept aside. The customer can return to pay the balance.' });
    } catch (err: any) {
      fail(err, 'Could not cancel.');
    } finally {
      setBusy(false);
    }
  };

  const paidUp = order ? order.balanceMinor === 0 : false;

  return (
    <div className="max-w-2xl mx-auto space-y-6 font-sans">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-3">
        <div className="flex items-center space-x-2.5">
          <span className="bg-azure-100 text-azure-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            Shop &amp; Collect Counter
          </span>
          <span className="text-xs text-slate-400">Station • {currentStore.name}</span>
        </div>
        <h2 className="text-xl font-black text-navy-800">Order Handover</h2>
        <p className="text-xs text-slate-500">
          1) Enter the order number the customer gives you. 2) Send a code to their registered phone and check their ID. 3) Collect any balance. 4) Release the order.
        </p>
      </div>

      {notice && (
        <div
          role="status"
          className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between ${
            notice.type === 'success' ? 'bg-brand-50 text-brand-800 border border-brand-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="text-slate-400 hover:text-slate-700">×</button>
        </div>
      )}

      {step === 'LOOKUP' && (
        <form onSubmit={onLookup} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4 text-xs">
          <label htmlFor="order-number" className="font-bold text-slate-700 block">Order number</label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              id="order-number"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
              placeholder="CC-XXX-XXX"
              autoComplete="off"
              className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl font-mono text-sm uppercase font-bold tracking-wider focus:outline-azure-500"
              required
            />
          </div>
          <button disabled={busy} className="w-full py-3 bg-azure-600 hover:bg-azure-700 disabled:opacity-60 text-white rounded-xl font-bold flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Find order
          </button>
        </form>
      )}

      {order && step !== 'LOOKUP' && step !== 'DONE' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs text-xs space-y-1.5">
          <div className="flex justify-between"><span className="text-slate-500">Order</span><strong className="font-mono text-navy-800">{order.orderNumber}</strong></div>
          <div className="flex justify-between"><span className="text-slate-500">Customer</span><strong className="text-navy-800">{order.customerName || '—'} · {order.customerPhoneMasked}</strong></div>
          <div className="flex justify-between"><span className="text-slate-500">Items</span><strong className="text-navy-800">{order.totalItems}</strong></div>
          <div className="flex justify-between"><span className="text-slate-500">Total / paid</span><strong className="text-navy-800">{formatKes(order.totalMinor)} / {formatKes(order.paidMinor)}</strong></div>
          <div className={`flex justify-between rounded-lg px-2 py-1 ${paidUp ? 'bg-brand-50 text-brand-800' : 'bg-amber-50 text-amber-800'}`}>
            <span className="font-bold">{paidUp ? 'Fully paid' : 'Balance due at pickup'}</span>
            <strong>{paidUp ? formatKes(0) : formatKes(order.balanceMinor)}</strong>
          </div>
        </div>
      )}

      {order && step === 'VERIFY' && (
        <form onSubmit={verify} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4 text-xs">
          <div className="flex items-center gap-2 font-bold text-slate-700"><ShieldCheck className="w-4 h-4 text-azure-600" /> Verify the customer</div>
          <button type="button" onClick={sendOtp} disabled={busy} className="w-full py-2.5 border border-azure-300 text-azure-700 hover:bg-azure-50 disabled:opacity-60 rounded-xl font-bold flex items-center justify-center gap-2">
            <Smartphone className="w-4 h-4" /> {otpSentTo ? 'Send a new code' : `Send code to ${order.customerPhoneMasked}`}
          </button>
          {devOtp && <p className="text-[11px] text-slate-400">Test mode (no SMS provider configured): code is <span className="font-mono font-bold text-slate-600">{devOtp}</span></p>}
          <div>
            <label htmlFor="otp" className="font-bold text-slate-700 block mb-1">Code the customer reads out</label>
            <input
              id="otp"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="6-digit code"
              autoComplete="one-time-code"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono text-lg tracking-[0.4em] text-center font-bold focus:outline-azure-500"
            />
          </div>
          <label className="flex items-start gap-2 text-slate-600 cursor-pointer">
            <input type="checkbox" checked={idChecked} onChange={(e) => setIdChecked(e.target.checked)} className="mt-0.5 rounded text-azure-600" />
            <span>I have checked the customer’s ID and the name matches the account holder.</span>
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="px-4 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold">Back</button>
            <button disabled={busy || otp.length !== 6 || !idChecked} className="flex-1 py-3 bg-azure-600 hover:bg-azure-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Verify
            </button>
          </div>
        </form>
      )}

      {order && step === 'BALANCE' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4 text-xs">
          {paidUp ? (
            <>
              <div className="flex items-center gap-2 font-bold text-brand-800"><CheckCircle2 className="w-4 h-4" /> Customer verified and fully paid</div>
              <button onClick={release} disabled={busy} className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />} Release order to customer
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 font-bold text-amber-800"><AlertTriangle className="w-4 h-4" /> Collect balance of {formatKes(order.balanceMinor)} before release</div>
              {promptState === 'WAITING' ? (
                <div className="text-center space-y-2 py-2">
                  <Loader2 className="w-6 h-6 mx-auto animate-spin text-azure-600" />
                  <p className="text-slate-600">M-Pesa prompt sent to {order.customerPhoneMasked}. Waiting for the customer to enter their PIN…</p>
                </div>
              ) : (
                <button onClick={sendBalancePrompt} className="w-full py-3 bg-azure-600 hover:bg-azure-700 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                  <Smartphone className="w-4 h-4" /> Send M-Pesa prompt to customer
                </button>
              )}
              <div className="flex gap-2">
                <button onClick={refreshOrder} disabled={busy} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold">Check payment</button>
                <button onClick={abort} disabled={busy || promptState === 'WAITING'} className="flex-1 py-2.5 rounded-xl border border-rose-200 text-rose-700 font-bold disabled:opacity-50">Customer can’t pay now</button>
              </div>
              <p className="text-[11px] text-slate-400">Goods stay with the store until the balance is received.</p>
            </>
          )}
        </div>
      )}

      {step === 'DONE' && order && (
        <div className="bg-brand-50/80 border-2 border-brand-300 rounded-3xl p-6 space-y-4 text-xs">
          <div className="flex items-center gap-2 text-brand-900 font-black text-sm"><CheckCircle2 className="w-5 h-5 text-brand-600" /> Handover complete and logged</div>
          <div className="bg-white p-4 rounded-2xl border border-brand-200 text-slate-700 space-y-2">
            <div className="flex justify-between"><span>Order</span><strong className="font-mono text-navy-800">{order.orderNumber}</strong></div>
            <div className="flex justify-between"><span>Customer</span><strong className="text-navy-800">{order.customerName || 'Customer'}</strong></div>
            <div className="flex justify-between"><span>Total paid</span><strong className="text-navy-800">{formatKes(order.paidMinor)}</strong></div>
            <div className="flex justify-between"><span>Handed over by</span><strong className="text-navy-800">{currentUser?.name || 'Staff member'}</strong></div>
          </div>
          <button onClick={reset} className="w-full py-2.5 bg-brand-700 hover:bg-brand-800 text-white rounded-xl font-bold">Next collection</button>
        </div>
      )}
    </div>
  );
};

