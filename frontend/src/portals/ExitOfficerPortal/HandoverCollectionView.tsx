import React, { useState } from 'react';
import {
  PackageCheck,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Search,
  Check,
  ArrowRight,
  Clock,
  Printer,
} from 'lucide-react';
import { Store, User } from '../../types.js';
import { apiRequest, formatKes } from '../../api.js';

interface HandoverCollectionViewProps {
  currentStore: Store;
  currentUser?: User | null;
}

export const HandoverCollectionView: React.FC<HandoverCollectionViewProps> = ({
  currentStore,
  currentUser,
}) => {
  const [identifier, setIdentifier] = useState('');
  const [nationalIdLast4, setNationalIdLast4] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifiedOrder, setVerifiedOrder] = useState<any | null>(null);
  const [completed, setCompleted] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Simulation quick fill
  const handleQuickFill = () => {
    setIdentifier('CC-20261104-9812');
    setNationalIdLast4('7890');
  };

  const handleVerifyLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;

    try {
      setLoading(true);
      setStatusMsg(null);
      setCompleted(false);

      // Verify and handover
      const res = await apiRequest('/orders/handover/verify', {
        method: 'POST',
        body: JSON.stringify({
          identifier: identifier.trim(),
          customerNationalIdLast4: nationalIdLast4.trim(),
        }),
      });

      if (res?.order) {
        setVerifiedOrder(res.order);
        setCompleted(true);
        setStatusMsg({ type: 'success', text: res.message || 'Handover successfully recorded!' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Handover verification failed' });
      setVerifiedOrder(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 font-sans">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-3">
        <div className="flex items-center space-x-2.5">
          <span className="bg-azure-100 text-azure-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            Shop & Collect Collection Counter
          </span>
          <span className="text-xs text-slate-400">Station • {currentStore.name}</span>
        </div>
        <h2 className="text-xl font-black text-navy-800">Order Handover & ID Verification</h2>
        <p className="text-xs text-slate-500">
          Verify customer pickup OTP / Single-Use QR code, confirm government ID last 4 digits, and record legal proof of collection.
        </p>

        <button
          onClick={handleQuickFill}
          className="text-xs text-azure-600 font-bold hover:underline inline-block pt-1"
        >
          ⚡ Load Test Shop & Collect Order (Code: CC-20261104-9812)
        </button>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between ${
            statusMsg.type === 'success'
              ? 'bg-brand-50 text-brand-800 border border-brand-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-slate-700">
            ×
          </button>
        </div>
      )}

      {/* Handover Form */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
        <form onSubmit={handleVerifyLookup} className="space-y-4 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">
              Customer Pickup Code (OTP) or Single-Use QR Token
            </label>
            <div className="relative">
              <QrCode className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="e.g. 849201 or Order Number / Scanned QR..."
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl font-mono text-sm uppercase focus:outline-azure-500 font-bold"
                required
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">
              Customer Government ID Check (Last 4 Digits of National ID or Passport)
            </label>
            <div className="relative">
              <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                maxLength={4}
                placeholder="e.g. 7890"
                value={nationalIdLast4}
                onChange={(e) => setNationalIdLast4(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl font-mono text-sm focus:outline-azure-500 font-bold tracking-widest"
              />
            </div>
            <span className="text-[10px] text-slate-400 block mt-1">
              Visual verification against physical Kenyan National ID card or driving license.
            </span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-azure-600 hover:bg-azure-700 text-white rounded-xl font-bold shadow-xs transition flex items-center justify-center space-x-2"
          >
            {loading ? (
              <span>Verifying Handover...</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Verify & Complete Order Handover</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Handover Completed Receipt Card */}
      {completed && verifiedOrder && (
        <div className="bg-brand-50/80 border-2 border-brand-300 rounded-3xl p-6 shadow-sm space-y-4 text-xs animate-fadeIn">
          <div className="flex items-center space-x-2 text-brand-900 font-black text-sm">
            <CheckCircle2 className="w-5 h-5 text-brand-600" />
            <span>Proof of Collection Verified & Logged</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-brand-200 text-slate-700 space-y-2">
            <div className="flex justify-between">
              <span>Order Reference:</span>
              <strong className="font-mono text-navy-800">{verifiedOrder.orderNumber}</strong>
            </div>
            <div className="flex justify-between">
              <span>Customer Name:</span>
              <strong className="text-navy-800">{verifiedOrder.customerId?.name || 'Customer'}</strong>
            </div>
            <div className="flex justify-between">
              <span>Verified ID Last 4:</span>
              <strong className="font-mono text-navy-800">{nationalIdLast4 || 'N/A'}</strong>
            </div>
            <div className="flex justify-between">
              <span>Handed Over By:</span>
              <strong className="text-navy-800">{currentUser?.name || 'Staff Member'}</strong>
            </div>
            <div className="flex justify-between">
              <span>Timestamp:</span>
              <strong className="text-navy-800">{new Date().toLocaleString()}</strong>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-brand-700 font-semibold">
              Legal chain of custody completed. Customer notified via SMS.
            </span>
            <button
              onClick={() => {
                setCompleted(false);
                setIdentifier('');
                setNationalIdLast4('');
                setVerifiedOrder(null);
              }}
              className="px-4 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-xl font-bold shadow-xs"
            >
              Next Collection
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
