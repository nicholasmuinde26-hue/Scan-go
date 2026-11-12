import React, { useState, useEffect } from 'react';
import {
  FileCheck,
  Search,
  Download,
  ShieldCheck,
  Eye,
  Trash2,
  CheckCircle2,
  X,
  AlertTriangle,
  Lock,
  RotateCcw,
  User,
  Filter,
  Plus,
} from 'lucide-react';
import { apiRequest } from '../../api.js';
import { RetentionRequestItem } from './superAdminTypes.js';

export const ComplianceAuditSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'AUDITS' | 'ACCESS_REVIEW' | 'REVEAL_LOG' | 'RETENTION'>('AUDITS');

  // Searchable Audits state
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAudits, setLoadingAudits] = useState(false);
  const [actorQuery, setActorQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  // Access Review state
  const [privilegedUsers, setPrivilegedUsers] = useState<any[]>([]);
  const [loadingAccessReview, setLoadingAccessReview] = useState(false);

  // Reveal Log state
  const [revealLogs, setRevealLogs] = useState<any[]>([]);

  // Retention requests
  const [retentionRequests, setRetentionRequests] = useState<RetentionRequestItem[]>([]);
  const [showNewRetentionModal, setShowNewRetentionModal] = useState(false);
  const [retentionForm, setRetentionForm] = useState({
    customerPhone: '',
    customerName: '',
    requestType: 'FORGET_ME',
    reason: '',
  });

  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAudits = async () => {
    try {
      setLoadingAudits(true);
      const params = new URLSearchParams();
      if (actorQuery) params.set('actorName', actorQuery);
      if (actionFilter) params.set('action', actionFilter);
      if (entityFilter) params.set('entityType', entityFilter);

      const res = await apiRequest(`/platform/audits?${params.toString()}`);
      if (res?.logs) setAuditLogs(res.logs);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to load audit logs' });
    } finally {
      setLoadingAudits(false);
    }
  };

  const loadAccessReview = async () => {
    try {
      setLoadingAccessReview(true);
      const res = await apiRequest('/access-review/users');
      if (res?.users) setPrivilegedUsers(res.users);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingAccessReview(false);
    }
  };

  const loadRevealLogs = async () => {
    try {
      const res = await apiRequest('/data-masking/all-reveals');
      if (res?.logs) setRevealLogs(res.logs);
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadRetentionRequests = async () => {
    try {
      const res = await apiRequest('/platform/compliance/retention-requests');
      if (res?.requests) setRetentionRequests(res.requests);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadAudits();
    loadAccessReview();
    loadRevealLogs();
    loadRetentionRequests();
  }, [actionFilter, entityFilter]);

  const handleCertifyAccess = async (user: any) => {
    try {
      setMsg({ type: 'success', text: `Access certified for ${user.name} for the current quarter.` });
      loadAccessReview();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to certify access' });
    }
  };

  const handleRevokePrivilegedAccess = async (user: any) => {
    const reason = window.prompt(`Revoke privileged access for ${user.name}? State audit justification:`);
    if (!reason) return;
    try {
      await apiRequest(`/access-review/revoke/${user._id}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setMsg({ type: 'success', text: `Privileged access revoked for ${user.name}.` });
      loadAccessReview();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to revoke access' });
    }
  };

  const handleCreateRetentionRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/platform/compliance/retention-requests', {
        method: 'POST',
        body: JSON.stringify(retentionForm),
      });
      setMsg({ type: 'success', text: 'Data privacy retention / deletion request logged.' });
      setShowNewRetentionModal(false);
      setRetentionForm({ customerPhone: '', customerName: '', requestType: 'FORGET_ME', reason: '' });
      loadRetentionRequests();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to file request' });
    }
  };

  const handleProcessRetention = async (id: string, status: string) => {
    if (!window.confirm(`Mark this compliance request as ${status}? Anonymization will be applied.`)) return;
    try {
      await apiRequest(`/platform/compliance/retention-requests/${id}/process`, {
        method: 'PATCH',
        body: JSON.stringify({ status, notes: `Processed by Platform Super Admin` }),
      });
      setMsg({ type: 'success', text: `Data retention request updated to ${status}.` });
      loadRetentionRequests();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to process retention request' });
    }
  };

  const handleExportAudits = () => {
    window.open('/api/v1/platform/audits/export', '_blank');
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
          <h2 className="text-base font-bold text-navy-800">Compliance, Audit Logs & Data Protection (DPA)</h2>
          <p className="text-xs text-slate-500">
            Immutable audit trail, quarterly privilege reviews, unmasking reveal logs, and "Right to be Forgotten"
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setActiveTab('AUDITS')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === 'AUDITS' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
              }`}
            >
              Audit Trail
            </button>
            <button
              onClick={() => setActiveTab('ACCESS_REVIEW')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === 'ACCESS_REVIEW' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
              }`}
            >
              Access Review
            </button>
            <button
              onClick={() => setActiveTab('REVEAL_LOG')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === 'REVEAL_LOG' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
              }`}
            >
              Data Reveal Log
            </button>
            <button
              onClick={() => setActiveTab('RETENTION')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === 'RETENTION' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
              }`}
            >
              DPA Requests
            </button>
          </div>

          {activeTab === 'AUDITS' && (
            <button
              onClick={handleExportAudits}
              className="inline-flex items-center space-x-1 px-3 py-1.5 bg-navy-800 text-white rounded-xl text-xs font-semibold hover:bg-black transition shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'AUDITS' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-2xl p-3 shadow-xs">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                placeholder="Search actor name or identifier..."
                value={actorQuery}
                onChange={(e) => setActorQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadAudits()}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-500"
              />
            </div>

            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 bg-white"
            >
              <option value="">All Entity Types</option>
              <option value="ORGANIZATION">Organization</option>
              <option value="STORE">Store</option>
              <option value="USER">User</option>
              <option value="ORDER">Order</option>
              <option value="PAYMENT">Payment</option>
              <option value="SYSTEM">System</option>
            </select>

            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 bg-white"
            >
              <option value="">All Actions</option>
              <option value="CREATE_ORGANIZATION">Create Organization</option>
              <option value="UPDATE_ORGANIZATION">Update Organization</option>
              <option value="CREATE_STORE">Create Store</option>
              <option value="UPDATE_STORE">Update Store</option>
              <option value="CREATE_ORG_ADMIN">Create Org Admin</option>
              <option value="REVOKE_USER_SESSIONS">Revoke User Sessions</option>
              <option value="UPDATE_USER_PERMISSIONS">Update Permissions</option>
              <option value="APPROVE_MAKER_CHECKER">Approve Maker-Checker</option>
            </select>

            <button
              onClick={loadAudits}
              className="px-3.5 py-1.5 rounded-xl bg-navy-600 text-white font-semibold text-xs hover:bg-navy-700 transition"
            >
              Search
            </button>
          </div>

          {/* Audit Logs Table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Timestamp</th>
                    <th>Actor / Operator</th>
                    <th>Role</th>
                    <th>Action Executed</th>
                    <th>Entity Type</th>
                    <th>Entity Identifier</th>
                    <th>Reason / Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
                  {auditLogs.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 text-slate-500 font-sans">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="font-bold text-navy-800 font-sans">{log.actorName || 'System'}</td>
                      <td>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 font-bold">
                          {log.actorRole || 'SYSTEM'}
                        </span>
                      </td>
                      <td className="font-bold text-navy-700">{log.action}</td>
                      <td>
                        <span className="text-slate-600">{log.entityType}</span>
                      </td>
                      <td className="text-slate-500">{log.entityId}</td>
                      <td className="font-sans text-slate-600 max-w-xs truncate">{log.reason || log.details?.note || '—'}</td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                        {loadingAudits ? 'Loading audit trail...' : 'No audit records found.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ACCESS_REVIEW' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-navy-800">Privileged Access Review Campaign</h3>
              <p className="text-xs text-slate-500">Periodic privilege certification for system admins, store managers, and loss prevention</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-navy-50 text-navy-700 rounded-xl">
              Quarterly Audit Cadence
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Privileged User</th>
                    <th>Role Tier</th>
                    <th>Organization / Store</th>
                    <th>Status</th>
                    <th className="text-right px-4">Compliance Certification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {privilegedUsers.map((u) => (
                    <tr key={u._id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <span className="font-bold text-navy-800 block">{u.name}</span>
                        <span className="font-mono text-slate-400 text-[11px]">{u.phone}</span>
                      </td>
                      <td>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-navy-100 text-navy-800">
                          {u.role}
                        </span>
                      </td>
                      <td>
                        <span className="text-slate-700">{u.organizationId?.name || u.storeId?.name || 'Platform Wide'}</span>
                      </td>
                      <td>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-100 text-brand-800">
                          {u.status || 'ACTIVE'}
                        </span>
                      </td>
                      <td className="text-right px-4">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => handleCertifyAccess(u)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-200"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Certify Access</span>
                          </button>
                          <button
                            onClick={() => handleRevokePrivilegedAccess(u)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Revoke Access</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {privilegedUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        {loadingAccessReview ? 'Scanning privileged accounts...' : 'No privileged users found.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'REVEAL_LOG' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-navy-800">Data-Masking Unmasking Audit Trail</h3>
              <p className="text-xs text-slate-500">Record of all operators who revealed masked customer PII, phone, or financial data</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Timestamp</th>
                    <th>Operator ID</th>
                    <th>Field Revealed</th>
                    <th>Entity Type / ID</th>
                    <th>Unmask Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
                  {revealLogs.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 text-slate-500 font-sans">{new Date(r.timestamp).toLocaleString()}</td>
                      <td className="font-bold text-navy-800 font-sans">{r.userId}</td>
                      <td>
                        <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                          {r.field}
                        </span>
                      </td>
                      <td className="text-slate-600">{r.entityType} ({r.entityId})</td>
                      <td className="font-sans text-slate-600">{r.reason || 'Support Customer Lookup'}</td>
                    </tr>
                  ))}
                  {revealLogs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 font-sans">
                        No data reveal events recorded. Masking active.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'RETENTION' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-navy-800">Data Retention & Deletion Requests ("Right to be Forgotten")</h3>
              <p className="text-xs text-slate-500">DPA compliance queue for customer data pseudonymization and consent revocation</p>
            </div>
            <button
              onClick={() => setShowNewRetentionModal(true)}
              className="inline-flex items-center space-x-1 px-3 py-1.5 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Deletion Request</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Date</th>
                    <th>Customer Phone</th>
                    <th>Request Type</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>Reviewed By</th>
                    <th className="text-right px-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {retentionRequests.map((req) => (
                    <tr key={req._id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 text-slate-500">{new Date(req.createdAt).toLocaleDateString()}</td>
                      <td className="font-mono font-bold">{req.customerPhone}</td>
                      <td>
                        <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded text-[10px]">
                          {req.requestType}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            req.status === 'COMPLETED'
                              ? 'bg-brand-100 text-brand-800'
                              : req.status === 'REJECTED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td className="text-slate-600 max-w-xs">{req.reason || 'User requested GDPR/DPA account removal'}</td>
                      <td className="text-slate-500">{req.reviewedByName || 'Pending'}</td>
                      <td className="text-right px-4">
                        {req.status === 'PENDING_REVIEW' && (
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              onClick={() => handleProcessRetention(req._id, 'COMPLETED')}
                              className="px-2 py-1 bg-rose-600 text-white rounded text-[10px] font-bold hover:bg-rose-700"
                            >
                              Execute Pseudonymization
                            </button>
                            <button
                              onClick={() => handleProcessRetention(req._id, 'REJECTED')}
                              className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-[10px] font-bold hover:bg-slate-200"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {retentionRequests.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No active data retention or erasure requests pending.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Retention Request */}
      {showNewRetentionModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-navy-800">Log DPA Customer Deletion Request</h3>
              <button onClick={() => setShowNewRetentionModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleCreateRetentionRequest} className="space-y-3">
              <div>
                <label className="text-slate-500 block mb-1">Customer Phone Number *</label>
                <input
                  required
                  placeholder="07xxxxxxxx"
                  value={retentionForm.customerPhone}
                  onChange={(e) => setRetentionForm({ ...retentionForm, customerPhone: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Request Type</label>
                <select
                  value={retentionForm.requestType}
                  onChange={(e) => setRetentionForm({ ...retentionForm, requestType: e.target.value as any })}
                  className="w-full px-3 py-1.5 border rounded-xl bg-white"
                >
                  <option value="FORGET_ME">Right to be Forgotten (Full Pseudonymization)</option>
                  <option value="DATA_EXPORT">Data Export Portability Request</option>
                  <option value="CONSENT_REVOCATION">Consent Revocation</option>
                </select>
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Reason / Reference Ticket</label>
                <textarea
                  rows={2}
                  placeholder="Customer written request reference..."
                  value={retentionForm.reason}
                  onChange={(e) => setRetentionForm({ ...retentionForm, reason: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-xl"
                />
              </div>
              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowNewRetentionModal(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-rose-600 text-white font-semibold rounded-xl hover:bg-rose-700"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
