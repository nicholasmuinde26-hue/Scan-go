import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  UserCheck,
  Building2,
  DollarSign,
  ShieldCheck,
  X,
  Layers,
} from 'lucide-react';
import { apiRequest } from '../../api.js';
import { ApprovalItem } from './superAdminTypes.js';
import { User } from '../../types.js';
import { can } from '../../permissions.js';

export const ApprovalsInboxSection: React.FC<{ currentUser?: User | null }> = ({ currentUser }) => {
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAppointment, setShowAppointment] = useState(false);
  const [appointment, setAppointment] = useState({ name: '', phone: '', email: '', role: 'PLATFORM_ADMIN' });
  const [temporaryPassword, setTemporaryPassword] = useState('');

  const loadApprovals = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/platform/approvals/pending');
      if (res?.approvals) {
        setApprovals(res.approvals);
        if (selectedApproval) {
          const updated = res.approvals.find((a: any) => a._id === selectedApproval._id);
          setSelectedApproval(updated || null);
        }
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to load approvals' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApprovals();
  }, []);

  const handleApprove = async (approvalId: string) => {
    try {
      setActionLoading(true);
      const result = await apiRequest(`/platform/approvals/${approvalId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ notes: 'Authorized by Checker in Unified Approvals Inbox' }),
      });
      if (result?.temporaryPassword) setTemporaryPassword(`${result.user?.name || 'New staff'} · ${result.user?.role} · temporary password: ${result.temporaryPassword}`);
      setMsg({ type: 'success', text: 'Approval granted and action executed successfully.' });
      loadApprovals();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Approval rejected by Maker-Checker policy' });
    } finally {
      setActionLoading(false);
    }
  };

  const submitAppointment = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setActionLoading(true);
      await apiRequest('/platform/approvals/platform-staff', { method: 'POST', body: JSON.stringify(appointment) });
      setShowAppointment(false);
      setAppointment({ name: '', phone: '', email: '', role: 'PLATFORM_ADMIN' });
      setMsg({ type: 'success', text: 'Platform staff appointment sent to the independent checker.' });
      await loadApprovals();
    } catch (err: any) { setMsg({ type: 'error', text: err.message || 'Could not request platform staff appointment.' }); }
    finally { setActionLoading(false); }
  };

  const handleReject = async (approvalId: string) => {
    const reason = window.prompt('Enter checker rejection justification:');
    if (!reason) return;
    try {
      setActionLoading(true);
      await apiRequest(`/platform/approvals/${approvalId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setMsg({ type: 'success', text: 'Approval request rejected.' });
      loadApprovals();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to reject request' });
    } finally {
      setActionLoading(false);
    }
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
          <h2 className="text-base font-bold text-navy-800">Unified Maker-Checker Approvals Inbox</h2>
          <p className="text-xs text-slate-500">
            One authoritative queue for all pending dual-control sensitive actions across the entire enterprise
          </p>
        </div>

        <span className="px-3 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold">
          {approvals.length} Pending Actions
        </span>
        {can(currentUser, 'system:admin') && <button onClick={() => setShowAppointment(true)} className="rounded-xl bg-navy-800 px-3 py-2 text-xs font-bold text-white">Appoint Platform Staff</button>}
      </div>

      {temporaryPassword && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-900">{temporaryPassword} · Share securely; it is shown once.<button className="ml-3 underline" onClick={() => setTemporaryPassword('')}>Dismiss</button></div>}
      {showAppointment && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={submitAppointment} className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-6"><h3 className="text-sm font-black">Request platform staff appointment</h3><input required placeholder="Full name" value={appointment.name} onChange={(e) => setAppointment({ ...appointment, name: e.target.value })} className="w-full rounded-xl border p-3 text-sm"/><input required placeholder="Phone" value={appointment.phone} onChange={(e) => setAppointment({ ...appointment, phone: e.target.value })} className="w-full rounded-xl border p-3 text-sm"/><input type="email" placeholder="Email (optional)" value={appointment.email} onChange={(e) => setAppointment({ ...appointment, email: e.target.value })} className="w-full rounded-xl border p-3 text-sm"/><select value={appointment.role} onChange={(e) => setAppointment({ ...appointment, role: e.target.value })} className="w-full rounded-xl border p-3 text-sm">{['PLATFORM_ADMIN','FINANCE_ADMIN','FINANCE_APPROVER','SUPPORT_AGENT_TIER1','SUPPORT_LEAD_TIER2','RISK_FRAUD_ANALYST','COMPLIANCE_AUDITOR','PLATFORM_ENGINEER','CUSTOMER_SUCCESS'].map((role) => <option key={role}>{role}</option>)}</select><div className="flex justify-end gap-2"><button type="button" onClick={() => setShowAppointment(false)} className="rounded-xl border px-4 py-2 text-xs">Cancel</button><button disabled={actionLoading} className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white">Submit for approval</button></div></form></div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Approvals List */}
        <div className="lg:col-span-5 space-y-3">
          {approvals.map((item) => {
            const isSelected = selectedApproval?._id === item._id;

            return (
              <div
                key={item._id}
                onClick={() => setSelectedApproval(item)}
                className={`p-4 bg-white border rounded-2xl shadow-xs cursor-pointer transition space-y-2 text-xs ${
                  isSelected ? 'border-navy-600 ring-2 ring-navy-100' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-navy-700 bg-navy-50 px-2 py-0.5 rounded-full text-[10px] font-mono">
                    {item.type}
                  </span>
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                    {item.status}
                  </span>
                </div>

                <div>
                  <p className="font-bold text-navy-800 text-sm">
                    {item.targetType} #{item.targetId.slice(-6)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Maker: <span className="font-semibold">{item.requestedBy?.name || 'Operator'}</span> (
                    {item.requestedBy?.role || 'SYSTEM'})
                  </p>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-100">
                  <span>Expires: {new Date(item.expiresAt).toLocaleDateString()}</span>
                  <span className="font-semibold text-navy-600">Review Request &rarr;</span>
                </div>
              </div>
            );
          })}

          {approvals.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-xs text-slate-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-brand-500 mx-auto" />
              <p className="font-bold text-slate-700">Approvals Inbox Cleared</p>
              <p>No maker-checker actions pending review.</p>
            </div>
          )}
        </div>

        {/* Selected Approval Details & Action */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between space-y-6">
          {selectedApproval ? (
            <>
              <div className="space-y-4 text-xs">
                <div className="flex items-start justify-between border-b pb-4">
                  <div>
                    <span className="font-mono text-navy-700 font-bold text-sm block">
                      {selectedApproval.type}
                    </span>
                    <h3 className="font-bold text-navy-800 text-base mt-0.5">
                      Target: {selectedApproval.targetType} ({selectedApproval.targetId})
                    </h3>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900">
                    Awaiting Checker
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-semibold block">Requested By (Maker)</span>
                    <p className="font-bold text-navy-800">{selectedApproval.requestedBy?.name}</p>
                    <p className="text-[11px] text-slate-500 font-mono">{selectedApproval.requestedBy?.phone}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-semibold block">Timestamp</span>
                    <p className="font-bold text-navy-800">
                      {new Date(selectedApproval.createdAt).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-slate-500">Dual control required</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="font-semibold text-slate-700 uppercase tracking-wider text-[10px] block">
                    Payload Change Diff
                  </span>
                  <pre className="p-3 bg-navy-950 text-navy-300 rounded-xl font-mono text-[11px] overflow-x-auto max-h-60 border border-navy-700">
                    {JSON.stringify(selectedApproval.requestData, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <p className="text-[11px] text-slate-400">
                  Enforces Separation of Duties: Makers cannot self-authorize.
                </p>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleReject(selectedApproval._id)}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 disabled:opacity-50 transition"
                  >
                    Reject Request
                  </button>
                  <button
                    onClick={() => handleApprove(selectedApproval._id)}
                    disabled={actionLoading}
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white shadow-xs disabled:opacity-50 transition"
                  >
                    {actionLoading ? 'Executing...' : 'Approve & Execute Action'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="m-auto text-center text-xs text-slate-400 py-20 space-y-2">
              <CheckSquare className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="font-bold text-slate-700">Select an approval request</p>
              <p>Review the payload change diff and execute dual-control authorization.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
