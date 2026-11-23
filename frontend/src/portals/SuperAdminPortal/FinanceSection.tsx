import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Download,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  FileText,
  Clock,
  Plus,
  X,
  CreditCard,
  Building2,
  Layers,
  Check,
} from 'lucide-react';
import { apiRequest, formatKes } from '../../api.js';

interface FinanceSectionProps {
  organizations: any[];
  stores: any[];
}

export const FinanceSection: React.FC<FinanceSectionProps> = ({ organizations, stores }) => {
  const [activeTab, setActiveTab] = useState<'PAYOUTS' | 'LEDGER' | 'RECONCILIATION' | 'INVOICES'>('PAYOUTS');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invoiceOrgId, setInvoiceOrgId] = useState('');
  const [payForm, setPayForm] = useState<{ invoiceId: string; amountKes: string; method: string; reference: string } | null>(null);

  // Payouts state
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRequestPayoutModal, setShowRequestPayoutModal] = useState(false);
  const [payoutForm, setPayoutForm] = useState({
    storeId: '',
    amountKes: '',
    mpesaPhone: '',
    bankAccount: '',
    notes: '',
  });

  // Ledger state
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [selectedOrgFilter, setSelectedOrgFilter] = useState('');

  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadFinanceOverview = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/platform/finance/overview');
      if (res?.success) {
        setPayouts(res.payouts || []);
        setLedgerEntries(res.recentEntries || []);
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to load finance data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinanceOverview();
    apiRequest('/billing/invoices').then((r) => r?.success && setInvoices(r.invoices || [])).catch(() => {});
  }, []);

  const loadInvoices = () => apiRequest('/billing/invoices').then((r) => r?.success && setInvoices(r.invoices || [])).catch(() => {});

  const handleGenerateInvoice = async () => {
    if (!invoiceOrgId) return;
    try {
      const res = await apiRequest('/billing/invoices/generate', { method: 'POST', body: JSON.stringify({ organizationId: invoiceOrgId, issue: true }) });
      if (res?.success) { setMsg({ type: 'success', text: `Invoice ${res.invoice.invoiceNumber} issued — ${formatKes(res.invoice.totalMinor)}` }); loadInvoices(); }
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };

  const handleRecordPayment = async () => {
    if (!payForm) return;
    try {
      const res = await apiRequest(`/billing/invoices/${payForm.invoiceId}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amountMinor: Math.round(Number(payForm.amountKes) * 100), method: payForm.method, reference: payForm.reference || undefined }),
      });
      if (res?.success) { setMsg({ type: 'success', text: `Payment recorded — status: ${res.invoice.status}` }); setPayForm(null); loadInvoices(); }
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };

  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/ledger/payouts', {
        method: 'POST',
        body: JSON.stringify({
          storeId: payoutForm.storeId,
          amountMinor: Math.round(Number(payoutForm.amountKes) * 100),
          mpesaPhoneNumber: payoutForm.mpesaPhone || undefined,
          bankDetails: payoutForm.bankAccount ? { accountNumber: payoutForm.bankAccount } : undefined,
          notes: payoutForm.notes,
        }),
      });
      setMsg({ type: 'success', text: 'Payout request initiated and submitted to Maker-Checker approval queue.' });
      setShowRequestPayoutModal(false);
      setPayoutForm({ storeId: '', amountKes: '', mpesaPhone: '', bankAccount: '', notes: '' });
      loadFinanceOverview();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to submit payout request' });
    }
  };

  const handleApprovePayout = async (payoutId: string) => {
    try {
      await apiRequest(`/ledger/payouts/${payoutId}/approve`, { method: 'POST' });
      setMsg({ type: 'success', text: 'Payout approved and settlement instruction executed.' });
      loadFinanceOverview();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Approval rejected by Maker-Checker policy' });
    }
  };

  const handleRejectPayout = async (payoutId: string) => {
    const reason = window.prompt('Enter reason for payout rejection:');
    if (!reason) return;
    try {
      await apiRequest(`/ledger/payouts/${payoutId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setMsg({ type: 'success', text: 'Payout request rejected.' });
      loadFinanceOverview();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to reject payout' });
    }
  };

  const handleDownloadCsvStatement = () => {
    const url = `/api/v1/platform/finance/statement/export${
      selectedOrgFilter ? `?organizationId=${selectedOrgFilter}` : ''
    }`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {msg && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center justify-between ${
            msg.type === 'success'
              ? 'bg-brand-50 text-brand-800 border border-brand-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-navy-800">Finance, Settlements & Double-Entry Ledger</h2>
          <p className="text-xs text-slate-500">
            Store settlement disbursements with Maker-Checker dual control, reconciliation audit, and CSV statements
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setActiveTab('PAYOUTS')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === 'PAYOUTS' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
              }`}
            >
              Settlements & Payouts
            </button>
            <button
              onClick={() => setActiveTab('LEDGER')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === 'LEDGER' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
              }`}
            >
              General Ledger
            </button>
            <button
              onClick={() => setActiveTab('INVOICES')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === 'INVOICES' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
              }`}
            >
              Subscription Invoices
            </button>
          </div>

          <button
            onClick={handleDownloadCsvStatement}
            className="inline-flex items-center space-x-1 px-3 py-1.5 bg-navy-800 text-white rounded-xl text-xs font-semibold hover:bg-black transition shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {activeTab === 'INVOICES' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-navy-800">Subscription Invoices (KES, VAT-inclusive)</h3>
            <div className="flex items-center gap-2">
              <select value={invoiceOrgId} onChange={(e) => setInvoiceOrgId(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs bg-white">
                <option value="">Select supermarket…</option>
                {organizations.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
              </select>
              <button onClick={handleGenerateInvoice} disabled={!invoiceOrgId} className="px-3 py-1.5 bg-brand-600 text-white rounded-xl text-xs font-semibold disabled:opacity-40">Generate & issue</button>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Invoice</th>
                  <th>Supermarket</th>
                  <th>Period</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Status</th>
                  <th className="text-right px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {invoices.map((inv) => {
                  const org = organizations.find((o) => String(o._id) === String(inv.organizationId));
                  return (
                    <tr key={inv._id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono text-[11px]">{inv.invoiceNumber}</td>
                      <td className="font-bold text-navy-800">{org?.name || 'Unknown org'}</td>
                      <td className="text-slate-500">{new Date(inv.periodStart).toLocaleDateString()} → {new Date(inv.periodEnd).toLocaleDateString()}</td>
                      <td className="font-bold text-navy-800">{formatKes(inv.totalMinor)}</td>
                      <td>{formatKes(inv.amountPaidMinor)}</td>
                      <td>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${inv.status === 'PAID' ? 'bg-brand-100 text-brand-800' : inv.status === 'OVERDUE' || inv.status === 'VOID' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{inv.status}</span>
                      </td>
                      <td className="text-right px-4">
                        {['ISSUED', 'PARTIAL', 'OVERDUE'].includes(inv.status) && payForm?.invoiceId !== inv._id && (
                          <button onClick={() => setPayForm({ invoiceId: inv._id, amountKes: String((inv.totalMinor - inv.amountPaidMinor) / 100), method: 'MPESA', reference: '' })} className="px-2.5 py-1 bg-navy-800 text-white rounded-lg text-[11px] font-semibold">Record payment</button>
                        )}
                        {payForm && payForm.invoiceId === inv._id && (
                          <div className="flex items-center justify-end gap-1.5">
                            <input type="number" value={payForm.amountKes} onChange={(e) => setPayForm(payForm ? { ...payForm, amountKes: e.target.value } : payForm)} className="w-20 border rounded-lg px-2 py-1 text-[11px]" placeholder="KES" />
                            <select value={payForm.method} onChange={(e) => setPayForm(payForm ? { ...payForm, method: e.target.value } : payForm)} className="border rounded-lg px-1 py-1 text-[11px] bg-white">
                              <option value="MPESA">M-Pesa</option><option value="BANK">Bank</option><option value="CARD">Card</option><option value="MANUAL">Manual</option>
                            </select>
                            <button onClick={handleRecordPayment} className="px-2 py-1 bg-brand-600 text-white rounded-lg text-[11px] font-semibold">Save</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {invoices.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-400">No invoices yet — generate one per organization.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'PAYOUTS' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-navy-800">Settlement Payout Requests</h3>
            <button
              onClick={() => setShowRequestPayoutModal(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-brand-600 text-white rounded-xl text-xs font-semibold hover:bg-brand-700 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Request Store Settlement</span>
            </button>
          </div>

          {/* Payouts Table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Date</th>
                    <th>Store / Supermarket</th>
                    <th>Requested Amount</th>
                    <th>Status</th>
                    <th>Maker (Requester)</th>
                    <th>Checker (Approver)</th>
                    <th className="text-right px-4">Dual Authorization</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {payouts.map((p) => (
                    <tr key={p._id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 text-slate-500">{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td>
                        <span className="font-bold text-navy-800 block">{p.storeId?.name || 'Store Branch'}</span>
                        <span className="text-[10px] text-navy-700 font-semibold">{p.organizationId?.name}</span>
                      </td>
                      <td className="font-bold text-navy-800 text-sm">{formatKes(p.amountMinor)}</td>
                      <td>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            p.status === 'APPROVED'
                              ? 'bg-brand-100 text-brand-800'
                              : p.status === 'REJECTED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="font-mono text-slate-500 text-[11px]">{p.requestedBy?.slice(-6) || 'Maker'}</td>
                      <td className="font-mono text-slate-500 text-[11px]">{p.approvedBy?.slice(-6) || 'Pending'}</td>
                      <td className="text-right px-4">
                        {p.status === 'PENDING' ? (
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              onClick={() => handleApprovePayout(p._id)}
                              className="px-2.5 py-1 bg-brand-600 text-white rounded-lg text-[11px] font-semibold hover:bg-brand-700"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectPayout(p._id)}
                              className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-semibold hover:bg-rose-100"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Settled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {payouts.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No settlement payouts requested yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Double-Entry Ledger View */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-navy-800">Immutable Double-Entry Ledger (Append-Only)</h3>
            <span className="text-xs text-slate-400 font-mono">Debits = Credits Enforced</span>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Timestamp</th>
                    <th>Entry Type</th>
                    <th>Account Code</th>
                    <th>Debit (Dr)</th>
                    <th>Credit (Cr)</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
                  {ledgerEntries.map((e) => (
                    <tr key={e._id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 text-slate-500 font-sans">{new Date(e.createdAt).toLocaleString()}</td>
                      <td>
                        <span className="font-bold text-navy-700 bg-navy-50 px-2 py-0.5 rounded">
                          {e.entryType}
                        </span>
                      </td>
                      <td className="text-slate-600">{e.accountCode}</td>
                      <td className="font-bold text-navy-800">
                        {e.debitMinor ? formatKes(e.debitMinor) : '—'}
                      </td>
                      <td className="font-bold text-navy-800">
                        {e.creditMinor ? formatKes(e.creditMinor) : '—'}
                      </td>
                      <td className="font-sans text-slate-600 max-w-xs truncate">{e.description || 'System post'}</td>
                    </tr>
                  ))}
                  {ledgerEntries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-sans">
                        No ledger entries recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Request Payout */}
      {showRequestPayoutModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-navy-800">Request Store Settlement Payout</h3>
              <button onClick={() => setShowRequestPayoutModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleRequestPayout} className="space-y-3">
              <div>
                <label className="text-slate-500 block mb-1">Target Store Branch *</label>
                <select
                  required
                  value={payoutForm.storeId}
                  onChange={(e) => setPayoutForm({ ...payoutForm, storeId: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-xl bg-white"
                >
                  <option value="">Select branch...</option>
                  {stores.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-500 block mb-1">Payout Amount (KES) *</label>
                <input
                  type="number"
                  min={100}
                  required
                  placeholder="e.g. 50000"
                  value={payoutForm.amountKes}
                  onChange={(e) => setPayoutForm({ ...payoutForm, amountKes: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-xl"
                />
              </div>

              <div>
                <label className="text-slate-500 block mb-1">M-Pesa B2C Phone (for instant disburse)</label>
                <input
                  placeholder="07xxxxxxxx"
                  value={payoutForm.mpesaPhone}
                  onChange={(e) => setPayoutForm({ ...payoutForm, mpesaPhone: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-xl"
                />
              </div>

              <div>
                <label className="text-slate-500 block mb-1">Bank Account / Reference</label>
                <input
                  placeholder="e.g. KCB Bank Acct 12345678"
                  value={payoutForm.bankAccount}
                  onChange={(e) => setPayoutForm({ ...payoutForm, bankAccount: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-xl"
                />
              </div>

              <p className="text-[10px] text-amber-700 bg-amber-50 p-2 rounded-lg">
                ⚠️ Dual-control policy: You as the Maker cannot approve this payout. A distinct Checker must review and approve it.
              </p>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowRequestPayoutModal(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700"
                >
                  Submit for Approval
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
