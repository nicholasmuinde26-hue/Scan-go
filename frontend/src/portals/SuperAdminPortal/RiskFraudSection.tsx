import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Ban,
  FileText,
  Plus,
  Trash2,
  CheckCircle2,
  X,
  Eye,
  Sliders,
  DollarSign,
  User,
  ShoppingBag,
} from 'lucide-react';
import { apiRequest, formatKes } from '../../api.js';
import { BlocklistEntryItem, FraudCaseItem } from './superAdminTypes.js';

interface RiskFraudSectionProps {
  organizations: any[];
  stores: any[];
}

export const RiskFraudSection: React.FC<RiskFraudSectionProps> = ({ organizations, stores }) => {
  const [activeTab, setActiveTab] = useState<'DISCREPANCIES' | 'CASES' | 'BLOCKLIST'>('DISCREPANCIES');

  // Discrepancies Queue
  const [discrepancies, setDiscrepancies] = useState<any[]>([]);
  const [loadingDiscrepancies, setLoadingDiscrepancies] = useState(false);

  // Fraud Cases
  const [cases, setCases] = useState<FraudCaseItem[]>([]);
  const [showNewCaseModal, setShowNewCaseModal] = useState(false);
  const [caseForm, setCaseForm] = useState({
    title: '',
    severity: 'MEDIUM',
    customerPhone: '',
    customerName: '',
    evidenceSummary: '',
    storeId: '',
  });

  // Blocklist
  const [blocklist, setBlocklist] = useState<BlocklistEntryItem[]>([]);
  const [showBlocklistModal, setShowBlocklistModal] = useState(false);
  const [blocklistForm, setBlocklistForm] = useState({
    identifier: '',
    name: '',
    reason: '',
    riskScore: 90,
  });

  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadDiscrepancies = async () => {
    try {
      setLoadingDiscrepancies(true);
      const res = await apiRequest('/platform/fraud/discrepancies');
      if (res?.discrepancies) {
        setDiscrepancies(res.discrepancies);
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to load discrepancies' });
    } finally {
      setLoadingDiscrepancies(false);
    }
  };

  const loadCases = async () => {
    try {
      const res = await apiRequest('/platform/fraud/cases');
      if (res?.cases) setCases(res.cases);
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadBlocklist = async () => {
    try {
      const res = await apiRequest('/platform/fraud/blocklist');
      if (res?.blocklist) setBlocklist(res.blocklist);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadDiscrepancies();
    loadCases();
    loadBlocklist();
  }, []);

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/platform/fraud/cases', {
        method: 'POST',
        body: JSON.stringify(caseForm),
      });
      setMsg({ type: 'success', text: 'Fraud incident case docket opened.' });
      setShowNewCaseModal(false);
      setCaseForm({ title: '', severity: 'MEDIUM', customerPhone: '', customerName: '', evidenceSummary: '', storeId: '' });
      loadCases();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to open case' });
    }
  };

  const handleAddToBlocklist = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/platform/fraud/blocklist', {
        method: 'POST',
        body: JSON.stringify(blocklistForm),
      });
      setMsg({ type: 'success', text: `${blocklistForm.identifier} placed on platform blocklist.` });
      setShowBlocklistModal(false);
      setBlocklistForm({ identifier: '', name: '', reason: '', riskScore: 90 });
      loadBlocklist();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to add to blocklist' });
    }
  };

  const handleRemoveFromBlocklist = async (id: string) => {
    if (!window.confirm('Remove this identifier from the security blocklist?')) return;
    try {
      await apiRequest(`/platform/fraud/blocklist/${id}`, { method: 'DELETE' });
      setMsg({ type: 'success', text: 'Removed from blocklist.' });
      loadBlocklist();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to remove from blocklist' });
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-navy-800">Loss Prevention, Risk Scores & Fraud Cases</h2>
          <p className="text-xs text-slate-500">
            Exit discrepancy queue, case management with evidence dossiers, and platform security blocklist
          </p>
        </div>

        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setActiveTab('DISCREPANCIES')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'DISCREPANCIES' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
            }`}
          >
            Exit Discrepancy Queue
          </button>
          <button
            onClick={() => setActiveTab('CASES')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'CASES' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
            }`}
          >
            Incident Cases
          </button>
          <button
            onClick={() => setActiveTab('BLOCKLIST')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'BLOCKLIST' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
            }`}
          >
            Security Blocklist
          </button>
        </div>
      </div>

      {activeTab === 'DISCREPANCIES' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-navy-800 flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Live Exit Lane Interception Feed</span>
            </h3>
            <span className="text-xs font-semibold text-slate-500">
              {discrepancies.length} total recorded discrepancies
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Date / Time</th>
                    <th>Branch / Lane</th>
                    <th>Customer</th>
                    <th>Excess Scanned Items</th>
                    <th>Loss Prevented Value</th>
                    <th>Officer</th>
                    <th>Resolution</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {discrepancies.map((d) => (
                    <tr key={d._id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 text-slate-500">{new Date(d.createdAt).toLocaleString()}</td>
                      <td>
                        <span className="font-bold text-navy-800 block">{d.storeId?.name || 'Store'}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{d.exitLaneId || 'Lane 1'}</span>
                      </td>
                      <td>
                        <span className="font-bold block">{d.customerId?.name || 'Customer'}</span>
                        <span className="font-mono text-slate-500 text-[11px]">{d.customerId?.phone || 'Guest'}</span>
                      </td>
                      <td className="font-bold text-rose-600">+{d.totalExcessItems} item(s) un-scanned</td>
                      <td className="font-bold text-brand-700 text-sm">
                        {formatKes(d.totalExcessValueMinor || 0)}
                      </td>
                      <td className="text-slate-600">{d.officerId?.name || 'Exit Staff'}</td>
                      <td>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            d.resolved ? 'bg-brand-100 text-brand-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {d.resolved ? 'RESOLVED' : 'ACTIVE INSPECTION'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {discrepancies.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        {loadingDiscrepancies ? 'Loading discrepancies queue...' : 'No exit discrepancies flagged.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'CASES' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-navy-800">Fraud Incident Dossiers & Case Files</h3>
            <button
              onClick={() => setShowNewCaseModal(true)}
              className="inline-flex items-center space-x-1 px-3 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Open Fraud Case Docket</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cases.map((c) => (
              <div
                key={c._id}
                className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3 hover:border-slate-300 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-rose-600 text-xs">{c.caseNumber}</span>
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      c.severity === 'CRITICAL'
                        ? 'bg-rose-100 text-rose-800'
                        : c.severity === 'HIGH'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {c.severity}
                  </span>
                </div>

                <div>
                  <h4 className="font-bold text-navy-800 text-sm">{c.title}</h4>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    Customer: {c.customerPhone || 'Unknown'} {c.customerName ? `(${c.customerName})` : ''}
                  </p>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-700">
                  <span className="font-semibold text-slate-400 block text-[10px] uppercase">Evidence Summary</span>
                  <p className="line-clamp-2 mt-0.5">{c.evidenceSummary}</p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                  <span className="font-bold text-slate-600">Status: {c.status}</span>
                  <span className="text-slate-400">{new Date(c.incidentDate).toLocaleDateString()}</span>
                </div>
              </div>
            ))}

            {cases.length === 0 && (
              <div className="col-span-full py-12 text-center text-xs text-slate-400">
                No active fraud cases filed.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'BLOCKLIST' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-navy-800">Security Blacklist & Risk Exclusions</h3>
              <p className="text-xs text-slate-500">Identifiers blocked from checkout or flagged for automatic RED lane audits</p>
            </div>
            <button
              onClick={() => setShowBlocklistModal(true)}
              className="inline-flex items-center space-x-1 px-3 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add to Blocklist</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Identifier (Phone / ID)</th>
                    <th>Name</th>
                    <th>Risk Score</th>
                    <th>Reason</th>
                    <th>Enforced By</th>
                    <th>Date Added</th>
                    <th className="text-right px-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {blocklist.map((b) => (
                    <tr key={b._id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-rose-600">{b.identifier}</td>
                      <td>{b.name || '—'}</td>
                      <td>
                        <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                          {b.riskScore}/100
                        </span>
                      </td>
                      <td className="text-slate-600 max-w-xs">{b.reason}</td>
                      <td>{b.addedByName}</td>
                      <td className="text-slate-500">{new Date(b.createdAt).toLocaleDateString()}</td>
                      <td className="text-right px-4">
                        <button
                          onClick={() => handleRemoveFromBlocklist(b._id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                          title="Remove from blocklist"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {blocklist.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No active blocklist entries.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Fraud Case */}
      {showNewCaseModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-navy-800">Open Fraud Incident Case</h3>
              <button onClick={() => setShowNewCaseModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleCreateCase} className="space-y-3">
              <div>
                <label className="text-slate-500 block mb-1">Case Title *</label>
                <input
                  required
                  placeholder="e.g. Repeated barcode swap theft at Westlands Sarit"
                  value={caseForm.title}
                  onChange={(e) => setCaseForm({ ...caseForm, title: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 block mb-1">Severity</label>
                  <select
                    value={caseForm.severity}
                    onChange={(e) => setCaseForm({ ...caseForm, severity: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded-xl bg-white"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">Customer Phone</label>
                  <input
                    placeholder="07xxxxxxxx"
                    value={caseForm.customerPhone}
                    onChange={(e) => setCaseForm({ ...caseForm, customerPhone: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Evidence & CCTV Summary *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Details of the discrepancy, items concealed, CCTV footage timestamps..."
                  value={caseForm.evidenceSummary}
                  onChange={(e) => setCaseForm({ ...caseForm, evidenceSummary: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-xl"
                />
              </div>
              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowNewCaseModal(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-rose-600 text-white font-semibold rounded-xl hover:bg-rose-700"
                >
                  Create Case File
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add to Blocklist */}
      {showBlocklistModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-navy-800">Add to Security Blocklist</h3>
              <button onClick={() => setShowBlocklistModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleAddToBlocklist} className="space-y-3">
              <div>
                <label className="text-slate-500 block mb-1">Identifier (Phone or National ID) *</label>
                <input
                  required
                  placeholder="07xxxxxxxx or 12345678"
                  value={blocklistForm.identifier}
                  onChange={(e) => setBlocklistForm({ ...blocklistForm, identifier: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Customer Name (Optional)</label>
                <input
                  placeholder="Full name"
                  value={blocklistForm.name}
                  onChange={(e) => setBlocklistForm({ ...blocklistForm, name: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-xl"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Mandatory Security Reason *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Confirmed repeated exit lane theft / fraud chargeback abuse."
                  value={blocklistForm.reason}
                  onChange={(e) => setBlocklistForm({ ...blocklistForm, reason: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-xl"
                />
              </div>
              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowBlocklistModal(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-rose-600 text-white font-semibold rounded-xl hover:bg-rose-700"
                >
                  Confirm Blocklist Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
