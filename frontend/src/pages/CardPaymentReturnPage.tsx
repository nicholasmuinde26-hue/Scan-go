import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../api.js';

export const CardPaymentReturnPage: React.FC = () => {
  const [params] = useSearchParams();
  const [state, setState] = useState<'checking' | 'success' | 'pending' | 'failed'>('checking');
  const [message, setMessage] = useState('Verifying your card payment securely…');

  useEffect(() => {
    let active = true;
    const txRef = params.get('tx_ref') || '';
    const transactionId = params.get('transaction_id') || '';
    const returnStatus = params.get('status') || '';
    // A cancelled checkout comes back with a tx_ref but no transaction_id: the server settles it by reference.
    if (!txRef) {
      setState('failed'); setMessage('Payment reference is missing. Check your orders for the latest status.');
      return;
    }
    apiRequest('/payments/card/verify-return', {
      method: 'POST', body: JSON.stringify({ txRef, transactionId, status: returnStatus }),
    }).then((result) => {
      if (!active) return;
      if (result.status === 'SUCCESS') { setState('success'); setMessage('Your payment is confirmed.'); }
      else { setState('pending'); setMessage('The provider has not confirmed the payment yet. Check Orders again shortly.'); }
    }).catch((error: any) => {
      if (!active) return;
      setState(error?.data?.status === 'FAILED' ? 'failed' : 'pending');
      setMessage(error?.message || 'Payment is still being verified.');
    });
    return () => { active = false; };
  }, [params]);

  return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-5"><section className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-lg border border-slate-200">
    <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-xl">{state === 'checking' ? '…' : state === 'success' ? '✓' : state === 'failed' ? '!' : '⌛'}</div>
    <h1 className="text-lg font-black text-navy-800">{state === 'success' ? 'Payment confirmed' : state === 'failed' ? 'Payment not completed' : 'Checking payment'}</h1>
    <p className="mt-2 text-sm text-slate-600">{message}</p>
    <Link to="/app" className="mt-6 inline-flex rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white">{state === 'failed' ? 'Back to my orders' : 'Go to Scan & Go'}</Link>
  </section></main>;
};
