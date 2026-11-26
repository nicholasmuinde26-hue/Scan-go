import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ArrowRight,
  RotateCcw,
  CreditCard,
  KeyRound,
  FileText,
  Users,
  Search,
  Filter,
  RefreshCw,
  Clock,
  ShieldCheck,
  TrendingDown,
  ChevronRight,
  Store as StoreIcon,
  LineChart,
} from 'lucide-react';
import { DemandForecastView } from './DemandForecastView.js';
import { Store, Product, User } from '../../types.js';
import { apiRequest, formatKes } from '../../api.js';
import { useLiveOrderEvents } from '../../hooks/useLiveOrderEvents.js';

interface SupervisorPortalProps {
  currentStore: Store;
  currentUser: User | null;
  products: Product[];
}

export const SupervisorPortal: React.FC<SupervisorPortalProps> = ({
  currentStore,
  currentUser,
  products,
}) => {
  const [activeTab, setActiveTab] = useState<'ESCALATIONS' | 'RESOLVE' | 'AUDIT_LOG' | 'STAFF' | 'FORECAST'>('ESCALATIONS');
  const [escalations, setEscalations] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [selectedEscalation, setSelectedEscalation] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolutionAction, setResolutionAction] = useState<'PAID_DIFFERENCE' | 'ITEM_RETURNED' | 'OVERRIDDEN_BY_SUPERVISOR'>('PAID_DIFFERENCE');
  const [supervisorPin, setSupervisorPin] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [liveAlert, setLiveAlert] = useState<string | null>(null);

  // Real-Time Live Order & Escalation Stream
  useLiveOrderEvents((event) => {
    if (
      event.type === 'discrepancy.escalated' ||
      event.type === 'exit.flagged' ||
      event.type === 'amber.overtime'
    ) {
      loadEscalations();
      loadAuditLogs();
      const msg =
        event.type === 'amber.overtime'
          ? event.payload.alertMessage || 'AMBER Inspection exceeded 15s limit!'
          : `Exit Discrepancy Flagged at Lane ${event.payload?.laneId || ''}! Excess: ${formatKes(event.payload?.totalExcessValueMinor || 0)}`;
      setLiveAlert(msg);
    }
  });

  // Load escalations
  const loadEscalations = async () => {
    try {
      setLoading(true);
      const res = await apiRequest(`/exit/escalations?storeId=${currentStore._id}`);
      if (res?.escalations) {
        setEscalations(res.escalations);
        if (res.escalations.length > 0 && !selectedEscalation) {
          setSelectedEscalation(res.escalations[0]);
        }
      }
    } catch (err: any) {
      console.warn('Could not load escalations:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load audit logs
  const loadAuditLogs = async () => {
    try {
      const res = await apiRequest(`/audits?storeId=${currentStore._id}`);
      if (res?.logs) {
        setAuditLogs(res.logs);
      }
    } catch (err: any) {
      console.warn('Could not load audit logs:', err);
    }
  };

  useEffect(() => {
    loadEscalations();
    loadAuditLogs();
  }, [currentStore._id]);

  // Handle Discrepancy Resolution
  const handleResolveDiscrepancy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEscalation) return;

    if (resolutionAction === 'OVERRIDDEN_BY_SUPERVISOR' && !supervisorPin) {
      setStatusMessage({ type: 'error', text: 'Supervisor PIN is mandatory for override.' });
      return;
    }

    if (!resolutionNotes.trim()) {
      setStatusMessage({ type: 'error', text: 'Please provide a mandatory reason note for the audit log.' });
      return;
    }

    try {
      setSubmitting(true);
      setStatusMessage(null);

      const exitEventId = selectedEscalation._id;
      const res = await apiRequest(`/exit/${exitEventId}/resolve-discrepancy`, {
        method: 'POST',
        body: JSON.stringify({
          resolution: resolutionAction,
          supervisorPin,
          notes: resolutionNotes,
        }),
      });

      setStatusMessage({
        type: 'success',
        text: `Discrepancy successfully resolved via ${resolutionAction}. Customer authorized to depart.`,
      });

      // Clear form
      setSupervisorPin('');
      setResolutionNotes('');

      // Refresh list
      await loadEscalations();
      await loadAuditLogs();
      setActiveTab('ESCALATIONS');
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Could not resolve discrepancy.' });
    } finally {
      setSubmitting(false);
    }
  };

  const activeEscalationItem = selectedEscalation;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-navy-900 to-azure-900 rounded-3xl p-6 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="bg-navy-500/30 text-navy-200 border border-navy-400/30 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Loss Prevention Command
            </span>
            <span className="text-navy-300 text-xs">• Shift Active</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Supervisor Escalation Desk</h1>
          <p className="text-xs text-navy-200/80">
            Authoritative discrepancy resolution, exit gate overrides, and risk mitigation • {currentStore.name}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="bg-white/10 backdrop-blur-xs border border-white/15 px-4 py-2.5 rounded-2xl text-right">
            <span className="text-[11px] text-navy-200 block">Logged in as</span>
            <span className="font-bold text-sm text-white block">{currentUser?.name || 'Store Supervisor'}</span>
          </div>
          <button
            onClick={loadEscalations}
            disabled={loading}
            className="p-3 bg-white/15 hover:bg-white/25 rounded-2xl border border-white/20 transition text-white"
            title="Refresh Escalations"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Live Stream Escalation Toast Banner */}
      {liveAlert && (
        <div className="bg-rose-950/80 border-2 border-rose-500 rounded-2xl p-4 text-white shadow-xl flex items-center justify-between animate-pulse">
          <div className="flex items-center space-x-3">
            <ShieldAlert className="w-6 h-6 text-rose-400 flex-shrink-0 animate-bounce" />
            <div>
              <span className="text-xs font-black uppercase text-rose-300 tracking-wider block">Live Floor Event</span>
              <p className="text-sm font-bold text-white">{liveAlert}</p>
            </div>
          </div>
          <button
            onClick={() => setLiveAlert(null)}
            className="px-3 py-1 bg-rose-800 hover:bg-rose-700 text-xs font-bold rounded-lg text-white transition"
          >
            Acknowledge ×
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('ESCALATIONS')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'ESCALATIONS'
              ? 'bg-navy-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Active Escalations ({escalations.length || 1})</span>
        </button>

        <button
          onClick={() => setActiveTab('RESOLVE')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'RESOLVE'
              ? 'bg-navy-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>Discrepancy Resolution Desk</span>
        </button>

        <button
          onClick={() => setActiveTab('AUDIT_LOG')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'AUDIT_LOG'
              ? 'bg-navy-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Supervisor Audit Trail</span>
        </button>

        <button
          onClick={() => setActiveTab('STAFF')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'STAFF'
              ? 'bg-navy-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Staff on Duty</span>
        </button>

        <button
          onClick={() => setActiveTab('FORECAST')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'FORECAST'
              ? 'bg-navy-600 text-white shadow-sm'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <LineChart className="w-4 h-4" />
          <span>Demand & Forecast</span>
        </button>
      </div>

      {/* TAB 1: ESCALATIONS INBOX */}
      {activeTab === 'ESCALATIONS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Escalations List (5 cols) */}
          <div className="lg:col-span-5 space-y-3">
            <h3 className="font-bold text-sm text-navy-700">Flagged Exit Gates & Orders</h3>
            <div className="space-y-2.5">
              {escalations.map((esc, idx) => {
                const isSelected = selectedEscalation?._id === esc._id;
                return (
                  <div
                    key={esc._id || idx}
                    onClick={() => {
                      setSelectedEscalation(esc);
                      setActiveTab('RESOLVE');
                    }}
                    className={`bg-white rounded-2xl border p-4 cursor-pointer transition shadow-xs hover:border-navy-400 ${
                      isSelected
                        ? 'border-navy-600 ring-2 ring-navy-600/10'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-sm text-navy-800">{esc.orderId?.orderNumber || 'Order'}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                            {esc.riskBand || 'RED'} FLAG
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {esc.customerId?.name || 'Customer'}{esc.customerId?.phone ? ` • ${esc.customerId.phone}` : ''}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">
                        {esc.exitLaneId || 'Lane'}
                      </span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-rose-600 font-semibold flex items-center space-x-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Mismatched Physical Cart</span>
                      </span>
                      <button className="text-navy-600 font-bold hover:underline flex items-center space-x-1">
                        <span>Resolve</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {escalations.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">No active escalations for this store.</div>}
          </div>

          {/* Right Column: Selected Quick Details Card (7 cols) */}
          {activeEscalationItem ? <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-bold text-base text-navy-800">Escalation Inspection</h3>
                <p className="text-xs text-slate-500">Physical audit discrepancy breakdown</p>
              </div>
              <span className="bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold px-3 py-1 rounded-xl">
                ACTION REQUIRED
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[11px]">Customer</span>
                <span className="font-bold text-navy-700">{activeEscalationItem.customerId?.name}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[11px]">Prior Discrepancies</span>
                <span className="font-bold text-rose-600">{activeEscalationItem.customerId?.confirmedDiscrepancies ?? 0} recorded</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[11px]">Exit Lane</span>
                <span className="font-bold text-navy-700">{activeEscalationItem.exitLaneId}</span>
              </div>
            </div>

            {/* Discrepant Items List */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Discrepant Items Detected:</span>
              <div className="bg-rose-50/60 border border-rose-200 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-rose-900">
                  <span>Item Name</span>
                  <span>Difference</span>
                </div>
                <div className="divide-y divide-rose-200/60 text-xs text-rose-800">
                  {(activeEscalationItem.differences || []).map((difference: any, index: number) => <div key={`${difference.name}-${index}`} className="py-2 flex justify-between items-center"><div><span className="font-bold block">{difference.name || difference.productName || 'Product'}</span><span className="text-[11px] text-rose-600">{difference.type || 'Reported by exit audit'}</span></div><span className="font-black bg-rose-200 text-rose-900 px-2 py-0.5 rounded-md">{difference.difference > 0 ? '+' : ''}{difference.difference}</span></div>)}
                  {!(activeEscalationItem.differences || []).length && <p className="py-2 text-xs text-slate-500">No item level details were attached to this escalation.</p>}
                </div>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('RESOLVE')}
              className="w-full bg-navy-600 hover:bg-navy-700 text-white font-bold py-3 rounded-xl text-xs transition shadow-md shadow-navy-600/20 flex items-center justify-center space-x-2"
            >
              <span>Open Discrepancy Resolution Desk</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div> : <div className="lg:col-span-7 rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Select a live escalation to inspect its details.</div>}
        </div>
      )}

      {/* TAB 2: RESOLUTION DESK (Mandatory Reason Codes & PIN Overrides) */}
      {activeTab === 'RESOLVE' && (
        <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 p-7 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <span className="text-[10px] uppercase font-bold text-navy-600 bg-navy-50 border border-navy-200 px-2.5 py-0.5 rounded-full">
              Supervisor Action Desk
            </span>
            <h2 className="text-lg font-black text-navy-800 mt-1">Resolve Exit Cart Discrepancy</h2>
            <p className="text-xs text-slate-500">
              Select an authorized resolution path. All decisions are timestamped and logged in the permanent audit trail.
            </p>
          </div>

          {statusMessage && (
            <div
              className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center space-x-2 ${
                statusMessage.type === 'success'
                  ? 'bg-brand-50 text-brand-800 border border-brand-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-brand-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          <form onSubmit={handleResolveDiscrepancy} className="space-y-5">
            {/* Resolution Options */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">Choose Resolution Method:</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setResolutionAction('PAID_DIFFERENCE')}
                  className={`p-3.5 rounded-2xl border text-left transition flex flex-col justify-between ${
                    resolutionAction === 'PAID_DIFFERENCE'
                      ? 'bg-brand-50 border-brand-500 ring-2 ring-brand-500/20 text-brand-950'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <CreditCard className="w-5 h-5 text-brand-600 mb-2" />
                  <span className="font-bold text-xs">A. Pay Difference</span>
                  <span className="text-[11px] text-slate-500 mt-0.5">Collect M-Pesa top-up for unrecorded items</span>
                </button>

                <button
                  type="button"
                  onClick={() => setResolutionAction('ITEM_RETURNED')}
                  className={`p-3.5 rounded-2xl border text-left transition flex flex-col justify-between ${
                    resolutionAction === 'ITEM_RETURNED'
                      ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20 text-amber-950'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <RotateCcw className="w-5 h-5 text-amber-600 mb-2" />
                  <span className="font-bold text-xs">B. Return Items</span>
                  <span className="text-[11px] text-slate-500 mt-0.5">Customer surrenders unrecorded items back to shelf</span>
                </button>

                <button
                  type="button"
                  onClick={() => setResolutionAction('OVERRIDDEN_BY_SUPERVISOR')}
                  className={`p-3.5 rounded-2xl border text-left transition flex flex-col justify-between ${
                    resolutionAction === 'OVERRIDDEN_BY_SUPERVISOR'
                      ? 'bg-navy-50 border-navy-500 ring-2 ring-navy-500/20 text-navy-950'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <KeyRound className="w-5 h-5 text-navy-600 mb-2" />
                  <span className="font-bold text-xs">C. PIN Override</span>
                  <span className="text-[11px] text-slate-500 mt-0.5">Authorize clearance with supervisor PIN</span>
                </button>
              </div>
            </div>

            {/* PIN Input if Override */}
            {resolutionAction === 'OVERRIDDEN_BY_SUPERVISOR' && (
              <div className="bg-navy-50/70 border border-navy-200 p-4 rounded-2xl space-y-2">
                <label className="text-xs font-bold text-navy-900 block flex items-center space-x-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Enter Supervisor Authorization PIN:</span>
                </label>
                <input
                  type="password"
                  placeholder="Enter 4-digit supervisor PIN (e.g. 1234)"
                  value={supervisorPin}
                  onChange={(e) => setSupervisorPin(e.target.value)}
                  maxLength={6}
                  className="w-full bg-white border border-navy-300 rounded-xl px-3.5 py-2.5 text-xs text-navy-800 font-mono tracking-widest focus:outline-none focus:border-navy-600"
                />
              </div>
            )}

            {/* Mandatory Reason Note */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                Mandatory Audit Note & Reason Code <span className="text-rose-500">*</span>:
              </label>
              <textarea
                rows={3}
                required
                placeholder="State reason: e.g. 'Customer scanned duplicate oil by mistake; items returned to shelf', or 'Item paid via separate cashier receipt verified by supervisor'..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-navy-700 focus:outline-none focus:border-navy-600"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-navy-600 hover:bg-navy-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-xs transition shadow-md shadow-navy-600/30 flex items-center justify-center space-x-2"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Authorizing Clearance...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Confirm Resolution & Clear Gate</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: AUDIT TRAIL */}
      {activeTab === 'AUDIT_LOG' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-sm text-navy-700">Permanent Supervisor Audit Log</h3>
              <p className="text-xs text-slate-400">Chronological history of overrides and discrepancy resolutions</p>
            </div>
            <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2.5 py-1 rounded-lg">
              {auditLogs.length} events
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Details / Resolution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-3 font-bold text-navy-700">
                      <span className="bg-navy-50 text-navy-800 border border-navy-200 px-2 py-0.5 rounded-md font-mono text-[10px]">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-700 font-medium">{log.actorName || 'System'}</td>
                    <td className="py-3 px-3 text-slate-600">
                      {log.newValue?.notes || log.newValue?.resolution || JSON.stringify(log.newValue || {})}
                    </td>
                  </tr>
                ))}
                {auditLogs.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-slate-500">No audit events recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: STAFF ON DUTY */}
      {activeTab === 'STAFF' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-3">
            <h3 className="font-bold text-sm text-navy-700 flex items-center space-x-2">
              <Users className="w-4 h-4 text-brand-600" />
              <span>Store Pickers Active</span>
            </h3>
            <div className="space-y-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl flex items-center justify-between border border-slate-100">
                <div>
                  <span className="font-bold text-navy-800 block">Mary Wanjiku</span>
                  <span className="text-[11px] text-slate-500">Assigned 4 Shop & Collect tasks</span>
                </div>
                <span className="bg-brand-100 text-brand-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Picking Lane 3
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl flex items-center justify-between border border-slate-100">
                <div>
                  <span className="font-bold text-navy-800 block">Peter Kariuki</span>
                  <span className="text-[11px] text-slate-500">Produce weighing station</span>
                </div>
                <span className="bg-brand-100 text-brand-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Active
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-3">
            <h3 className="font-bold text-sm text-navy-700 flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-azure-600" />
              <span>Exit Verification Officers</span>
            </h3>
            <div className="space-y-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl flex items-center justify-between border border-slate-100">
                <div>
                  <span className="font-bold text-navy-800 block">David Kiprop</span>
                  <span className="text-[11px] text-slate-500">Manning Exit Gate #1</span>
                </div>
                <span className="bg-azure-100 text-azure-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  On Duty
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: DEMAND & FORECAST */}
      {activeTab === 'FORECAST' && <DemandForecastView currentStore={currentStore} />}
    </div>
  );
};
