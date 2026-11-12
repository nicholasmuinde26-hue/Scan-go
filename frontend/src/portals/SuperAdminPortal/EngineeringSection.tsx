import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Activity,
  Key,
  RotateCcw,
  Play,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Plus,
  Trash2,
  X,
  Code,
  HardDrive,
  Cpu,
  Layers,
} from 'lucide-react';
import { apiRequest } from '../../api.js';
import { ApiKeyItem, WebhookLogItem } from './superAdminTypes.js';

export const EngineeringSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'JOBS' | 'CALLBACKS' | 'API_KEYS'>('JOBS');

  // Background Jobs
  const [jobs, setJobs] = useState<any[]>([]);
  const [runningJob, setRunningJob] = useState<string | null>(null);

  // Webhook / M-Pesa Callback Logs
  const [callbacks, setCallbacks] = useState<WebhookLogItem[]>([]);
  const [selectedCallback, setSelectedCallback] = useState<WebhookLogItem | null>(null);

  // API Keys
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [keyForm, setKeyForm] = useState({ name: '', rateLimitPerMin: 120 });
  const [newKeyCreated, setNewKeyCreated] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadJobs = async () => {
    try {
      const res = await apiRequest('/platform/engineering/jobs');
      if (res?.jobs) setJobs(res.jobs);
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadCallbacks = async () => {
    try {
      const res = await apiRequest('/platform/engineering/callbacks');
      if (res?.callbacks) setCallbacks(res.callbacks);
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadApiKeys = async () => {
    try {
      const res = await apiRequest('/platform/engineering/api-keys');
      if (res?.apiKeys) setApiKeys(res.apiKeys);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadJobs();
    loadCallbacks();
    loadApiKeys();
  }, []);

  const handleTriggerJob = async (jobId: string) => {
    try {
      setRunningJob(jobId);
      await apiRequest('/platform/engineering/jobs/run', {
        method: 'POST',
        body: JSON.stringify({ jobId }),
      });
      setMsg({ type: 'success', text: `Job execution dispatched to background worker pool.` });
      setTimeout(() => {
        setRunningJob(null);
        loadJobs();
      }, 1500);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to trigger job' });
      setRunningJob(null);
    }
  };

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/platform/engineering/api-keys', {
        method: 'POST',
        body: JSON.stringify(keyForm),
      });
      if (res?.fullApiKey) {
        setNewKeyCreated(res.fullApiKey);
      }
      setShowNewKeyModal(false);
      setKeyForm({ name: '', rateLimitPerMin: 120 });
      loadApiKeys();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to create API key' });
    }
  };

  const handleRevokeApiKey = async (id: string) => {
    if (!window.confirm('Revoke this enterprise API integration key?')) return;
    try {
      await apiRequest(`/platform/engineering/api-keys/${id}`, { method: 'DELETE' });
      setMsg({ type: 'success', text: 'API key revoked.' });
      loadApiKeys();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to revoke API key' });
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
          <h2 className="text-base font-bold text-navy-800">Engineering & Systems Operations Console</h2>
          <p className="text-xs text-slate-500">
            Background workers, Safaricom Daraja M-Pesa webhook callback logs, latency telemetry, and API keys
          </p>
        </div>

        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setActiveTab('JOBS')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'JOBS' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
            }`}
          >
            Worker Jobs
          </button>
          <button
            onClick={() => setActiveTab('CALLBACKS')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'CALLBACKS' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
            }`}
          >
            M-Pesa Webhooks
          </button>
          <button
            onClick={() => setActiveTab('API_KEYS')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'API_KEYS' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
            }`}
          >
            API Keys
          </button>
        </div>
      </div>

      {/* Secret Key Modal Reveal */}
      {newKeyCreated && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-xs space-y-2">
          <p className="font-bold text-amber-950 flex items-center space-x-1.5">
            <Key className="w-4 h-4 text-amber-700" />
            <span>Enterprise Integration API Key Created (Copy Now)</span>
          </p>
          <p className="text-[11px] text-amber-800">
            This secret key is only displayed once and is never stored in plaintext on our servers.
          </p>
          <div className="flex items-center space-x-2">
            <input
              readOnly
              value={newKeyCreated}
              className="flex-1 font-mono text-xs px-3 py-1.5 bg-white border border-amber-300 rounded-xl select-all"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(newKeyCreated);
                setCopiedKey(true);
                setTimeout(() => setCopiedKey(false), 2000);
              }}
              className="px-3 py-1.5 bg-amber-600 text-white font-semibold rounded-xl inline-flex items-center space-x-1"
            >
              {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey ? 'Copied' : 'Copy'}</span>
            </button>
            <button onClick={() => setNewKeyCreated(null)} className="p-1.5 text-amber-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {activeTab === 'JOBS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-navy-800">Background Worker Jobs & Daemon Pool</h3>
            <span className="text-xs font-mono text-slate-400">Node Cluster Daemon</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4 text-xs hover:border-slate-300 transition"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-navy-800 text-sm">{job.name}</h4>
                    <p className="font-mono text-slate-400 text-[11px] mt-0.5">{job.schedule}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      runningJob === job.id
                        ? 'bg-amber-100 text-amber-800 animate-pulse'
                        : 'bg-brand-100 text-brand-800'
                    }`}
                  >
                    {runningJob === job.id ? 'RUNNING' : job.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Last Execution</span>
                    <span className="font-semibold text-slate-700">
                      {new Date(job.lastRun).toLocaleTimeString()} ({job.lastDurationMs}ms)
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Next Scheduled</span>
                    <span className="font-semibold text-slate-700">
                      {new Date(job.nextRun).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    onClick={() => handleTriggerJob(job.id)}
                    disabled={runningJob === job.id}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-navy-50 text-navy-700 hover:bg-navy-100 font-semibold border border-navy-200 transition disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Run Job Now</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'CALLBACKS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Callback Stream */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b">
              <h3 className="font-bold text-navy-800">M-Pesa Daraja Webhook Callback Log</h3>
              <span className="text-[11px] font-mono text-slate-400">{callbacks.length} recent callbacks</span>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {callbacks.map((c) => (
                <div
                  key={c._id}
                  onClick={() => setSelectedCallback(c)}
                  className={`p-3 rounded-xl border cursor-pointer transition space-y-1 ${
                    selectedCallback?._id === c._id
                      ? 'border-navy-600 bg-navy-50/50 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-navy-700">{c.endpoint}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] ${
                        c.statusCode === 200 ? 'bg-brand-100 text-brand-800' : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      HTTP {c.statusCode}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Provider: {c.provider}</span>
                    <span>Latency: {c.latencyMs}ms</span>
                    <span>{new Date(c.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Raw JSON Payload Viewer */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3 text-xs">
            <h3 className="font-bold text-navy-800">Raw Payload Inspector</h3>
            {selectedCallback ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 bg-slate-50 p-2 rounded-xl">
                  <span>{selectedCallback.method} {selectedCallback.endpoint}</span>
                  <span>{selectedCallback.latencyMs}ms</span>
                </div>
                <pre className="p-3 bg-navy-950 text-brand-400 rounded-xl font-mono text-[11px] overflow-x-auto max-h-[420px] border border-navy-700">
                  {JSON.stringify(selectedCallback.payload, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="py-24 text-center text-slate-400">Select a webhook callback to view raw payload.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'API_KEYS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-navy-800">Enterprise Integration API Keys</h3>
              <p className="text-xs text-slate-500">Secure tokens for external ERP, POS, and inventory synchronizers</p>
            </div>
            <button
              onClick={() => setShowNewKeyModal(true)}
              className="inline-flex items-center space-x-1 px-3 py-1.5 bg-navy-600 text-white rounded-xl text-xs font-semibold hover:bg-navy-700 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Generate Integration Key</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Key Name</th>
                    <th>Prefix Token</th>
                    <th>Rate Limit</th>
                    <th>Created By</th>
                    <th>Status</th>
                    <th className="text-right px-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {apiKeys.map((k) => (
                    <tr key={k._id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-navy-800">{k.name}</td>
                      <td className="font-mono text-navy-700">{k.keyPrefix}_••••••••</td>
                      <td>{k.rateLimitPerMin} req/min</td>
                      <td className="text-slate-500">{k.createdByName || 'Admin'}</td>
                      <td>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-100 text-brand-800">
                          ACTIVE
                        </span>
                      </td>
                      <td className="text-right px-4">
                        <button
                          onClick={() => handleRevokeApiKey(k._id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition"
                          title="Revoke Key"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {apiKeys.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No active enterprise API keys.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New API Key */}
      {showNewKeyModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-navy-800">Generate Enterprise API Key</h3>
              <button onClick={() => setShowNewKeyModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleCreateApiKey} className="space-y-3">
              <div>
                <label className="text-slate-500 block mb-1">Integration Application Name *</label>
                <input
                  required
                  placeholder="e.g. Oracle ERP / SAP Warehouse Sync"
                  value={keyForm.name}
                  onChange={(e) => setKeyForm({ ...keyForm, name: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-xl"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Rate Limit (Requests per minute)</label>
                <input
                  type="number"
                  min={30}
                  max={1000}
                  value={keyForm.rateLimitPerMin}
                  onChange={(e) => setKeyForm({ ...keyForm, rateLimitPerMin: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 border rounded-xl"
                />
              </div>
              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowNewKeyModal(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-navy-600 text-white font-semibold rounded-xl hover:bg-navy-700"
                >
                  Generate Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
