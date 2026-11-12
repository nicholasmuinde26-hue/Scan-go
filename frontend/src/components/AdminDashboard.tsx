import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  ShieldAlert,
  Sliders,
  Database,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  History,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { Store, Product } from '../types.js';
import { apiRequest, formatKes } from '../api.js';

interface AdminDashboardProps {
  currentStore: Store;
  products: Product[];
  onRefreshData?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentStore, products, onRefreshData }) => {
  const [activeTab, setActiveTab] = useState<'METRICS' | 'CONFIG' | 'CATALOGUE' | 'AUDIT'>('METRICS');
  const [metrics, setMetrics] = useState<any | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fraud Config Form
  const [fraudConfig, setFraudConfig] = useState({
    largeBasketMinor: currentStore.fraudConfig?.largeBasketMinor || 1000000,
    mediumBasketMinor: currentStore.fraudConfig?.mediumBasketMinor || 500000,
    maxItemsWithoutFullCheck: currentStore.fraudConfig?.maxItemsWithoutFullCheck || 25,
    manualEntryAmberThreshold: currentStore.fraudConfig?.manualEntryAmberThreshold || 4,
    randomAuditPercentage: currentStore.fraudConfig?.randomAuditPercentage || 5,
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [summaryRes, auditRes] = await Promise.all([
        apiRequest('/audits/fraud-summary'),
        apiRequest('/audits'),
      ]);
      setMetrics(summaryRes.metrics);
      setAuditLogs(auditRes.logs || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentStore._id]);

  const handleSaveConfig = async () => {
    try {
      setLoading(true);
      await apiRequest(`/stores/${currentStore._id}/fraud-config`, {
        method: 'PATCH',
        body: JSON.stringify(fraudConfig),
      });
      setMessage({ type: 'success', text: 'Supermarket fraud prevention thresholds updated successfully!' });
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-navy-950/70 to-navy-700 border border-navy-500/30 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-navy-500/20 text-navy-400 rounded-lg">
                <BarChart3 className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-white">Supermarket Administration & Fraud Analytics</h2>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Store operations console for {currentStore.name}. Monitor intercepted discrepancies, loss prevention KPIs, and configure security rules.
            </p>
          </div>

          {/* Sub-tabs */}
          <div className="flex space-x-1 bg-navy-800/80 p-1 rounded-xl border border-slate-700 text-xs">
            <button
              onClick={() => setActiveTab('METRICS')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                activeTab === 'METRICS' ? 'bg-navy-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Metrics
            </button>
            <button
              onClick={() => setActiveTab('CONFIG')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                activeTab === 'CONFIG' ? 'bg-navy-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Fraud Rules
            </button>
            <button
              onClick={() => setActiveTab('CATALOGUE')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                activeTab === 'CATALOGUE' ? 'bg-navy-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Catalogue
            </button>
            <button
              onClick={() => setActiveTab('AUDIT')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                activeTab === 'AUDIT' ? 'bg-navy-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Audit Trail
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium ${
            message.type === 'success'
              ? 'bg-brand-950/40 border-brand-500/40 text-brand-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white">
            ×
          </button>
        </div>
      )}

      {/* Tab 1: Loss Prevention Metrics */}
      {activeTab === 'METRICS' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-navy-700/80 border border-slate-700/80 rounded-2xl p-4 space-y-2 shadow-sm">
              <span className="text-xs text-slate-400 flex items-center space-x-1 font-medium">
                <ShieldCheck className="w-4 h-4 text-brand-400" />
                <span>Total Exit Clearance Events</span>
              </span>
              <div className="text-2xl font-bold text-white">{metrics?.totalExits || 0}</div>
              <div className="flex space-x-2 text-[11px] text-slate-400 pt-1">
                <span className="text-brand-400 font-bold">{metrics?.breakdown?.green || 0} Green</span>
                <span>•</span>
                <span className="text-amber-400 font-bold">{metrics?.breakdown?.amber || 0} Amber</span>
                <span>•</span>
                <span className="text-rose-400 font-bold">{metrics?.breakdown?.red || 0} Red</span>
              </div>
            </div>

            <div className="bg-navy-700/80 border border-slate-700/80 rounded-2xl p-4 space-y-2 shadow-sm">
              <span className="text-xs text-slate-400 flex items-center space-x-1 font-medium">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Interceptions / Discrepancies</span>
              </span>
              <div className="text-2xl font-bold text-rose-400">{metrics?.discrepanciesCount || 0}</div>
              <p className="text-[11px] text-slate-400">Exit lane mismatches discovered & handled</p>
            </div>

            <div className="bg-navy-700/80 border border-slate-700/80 rounded-2xl p-4 space-y-2 shadow-sm">
              <span className="text-xs text-slate-400 flex items-center space-x-1 font-medium">
                <TrendingDown className="w-4 h-4 text-amber-400" />
                <span>Unrecorded Items Caught</span>
              </span>
              <div className="text-2xl font-bold text-amber-400">{metrics?.totalExcessItemsCaught || 0} units</div>
              <p className="text-[11px] text-slate-400">Prevented from unauthorized exit</p>
            </div>

            <div className="bg-navy-700/80 border border-slate-700/80 rounded-2xl p-4 space-y-2 shadow-sm">
              <span className="text-xs text-slate-400 flex items-center space-x-1 font-medium">
                <BarChart3 className="w-4 h-4 text-navy-400" />
                <span>Shrinkage / Loss Prevented</span>
              </span>
              <div className="text-2xl font-bold text-brand-400">
                {formatKes(metrics?.totalLossPreventedMinor || 0)}
              </div>
              <p className="text-[11px] text-slate-400">Protected supermarket revenue</p>
            </div>
          </div>

          {/* Breakdown & Recent Discrepancies */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-12 bg-navy-700/80 border border-slate-700/80 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-white">Recent Confirmed Cart Discrepancies & Resolutions</h3>
              {metrics?.recentDiscrepancies?.length > 0 ? (
                <div className="space-y-2">
                  {metrics.recentDiscrepancies.map((d: any) => (
                    <div
                      key={d._id}
                      className="p-3 bg-navy-800/60 rounded-xl border border-slate-700/80 flex flex-col sm:flex-row justify-between sm:items-center gap-2 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white">{d.customerId?.name || 'Customer'}</span>
                          <span className="text-slate-400 font-mono">({d.customerId?.phone})</span>
                          <span className="bg-rose-500/20 text-rose-300 text-[10px] px-2 py-0.5 rounded font-bold">
                            +{d.totalExcessItems} unrecorded
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">{d.notes || 'Discrepancy detected at exit scanner'}</p>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-bold text-rose-400 block">
                          {formatKes(d.totalExcessValueMinor)}
                        </span>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold">
                          Resolution: {d.resolution || 'Pending'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 text-center py-6">No recorded discrepancies yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Configurable Fraud Engine Rules */}
      {activeTab === 'CONFIG' && (
        <div className="bg-navy-700/80 border border-slate-700/80 rounded-2xl p-6 shadow-sm space-y-5 max-w-2xl">
          <div className="flex items-center space-x-2 border-b border-slate-700/80 pb-3">
            <Sliders className="w-5 h-5 text-navy-400" />
            <div>
              <h3 className="font-bold text-white text-base">Configurable Supermarket Loss Prevention Rules</h3>
              <p className="text-xs text-slate-400">
                Adjust sensitivity of exit verification risk triggers for {currentStore.name}.
              </p>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-slate-300 block mb-1">
                Large Basket High-Risk Threshold (KES Minor Cents)
              </label>
              <input
                type="number"
                value={fraudConfig.largeBasketMinor}
                onChange={(e) => setFraudConfig({ ...fraudConfig, largeBasketMinor: parseInt(e.target.value, 10) })}
                className="w-full bg-navy-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
              />
              <span className="text-[11px] text-slate-500">
                Currently: {formatKes(fraudConfig.largeBasketMinor)} (+20 risk points to order)
              </span>
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1">
                Max Allowed Items Without Mandatory Full Scan
              </label>
              <input
                type="number"
                value={fraudConfig.maxItemsWithoutFullCheck}
                onChange={(e) =>
                  setFraudConfig({ ...fraudConfig, maxItemsWithoutFullCheck: parseInt(e.target.value, 10) })
                }
                className="w-full bg-navy-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
              />
              <span className="text-[11px] text-slate-500">
                Carts exceeding {fraudConfig.maxItemsWithoutFullCheck} items require item count verification
              </span>
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1">
                Manual Barcode Entry AMBER Trigger Threshold
              </label>
              <input
                type="number"
                value={fraudConfig.manualEntryAmberThreshold}
                onChange={(e) =>
                  setFraudConfig({ ...fraudConfig, manualEntryAmberThreshold: parseInt(e.target.value, 10) })
                }
                className="w-full bg-navy-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
              />
              <span className="text-[11px] text-slate-500">
                {fraudConfig.manualEntryAmberThreshold}+ manual barcode entries will automatically trigger AMBER check
              </span>
            </div>

            <div>
              <label className="font-semibold text-slate-300 block mb-1">
                Cryptographic Random Audit Percentage (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={fraudConfig.randomAuditPercentage}
                onChange={(e) =>
                  setFraudConfig({ ...fraudConfig, randomAuditPercentage: parseInt(e.target.value, 10) })
                }
                className="w-full bg-navy-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
              />
              <span className="text-[11px] text-slate-500">
                Randomly checks {fraudConfig.randomAuditPercentage}% of even trusted/green customers to prevent complacency
              </span>
            </div>

            <button
              disabled={loading}
              onClick={handleSaveConfig}
              className="bg-navy-600 hover:bg-navy-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition flex items-center space-x-1.5 shadow-lg shadow-navy-600/30"
            >
              <Save className="w-4 h-4" />
              <span>Save Supermarket Policies</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab 3: Catalogue & Authoritative Prices */}
      {activeTab === 'CATALOGUE' && (
        <div className="bg-navy-700/80 border border-slate-700/80 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-slate-700 pb-3">
            <h3 className="font-bold text-sm text-white">Store Product Catalogue & Authoritative Prices</h3>
            <span className="text-xs text-slate-400">{products.length} products listed</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-navy-800/80 text-slate-400 uppercase text-[10px]">
                <tr>
                  <th className="p-3">Product Name</th>
                  <th className="p-3">Barcode</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Authoritative Price</th>
                  <th className="p-3">Attributes</th>
                  <th className="p-3">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {products.map((p) => (
                  <tr key={p._id} className="hover:bg-slate-700/30">
                    <td className="p-3 font-semibold text-white">{p.name}</td>
                    <td className="p-3 font-mono text-slate-400">{p.barcode}</td>
                    <td className="p-3 text-slate-300">{p.category}</td>
                    <td className="p-3 font-bold text-brand-400">{formatKes(p.priceMinor)}</td>
                    <td className="p-3">
                      <div className="flex space-x-1">
                        {p.highTheft && (
                          <span className="bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded text-[9px] font-bold">
                            High Theft
                          </span>
                        )}
                        {p.isWeighted && (
                          <span className="bg-azure-500/20 text-azure-300 px-1.5 py-0.5 rounded text-[9px] font-bold">
                            Scale Produce
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-slate-300 font-mono">{p.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Tamper-Evident Audit Trail */}
      {activeTab === 'AUDIT' && (
        <div className="bg-navy-700/80 border border-slate-700/80 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-700 pb-3">
            <History className="w-5 h-5 text-navy-400" />
            <div>
              <h3 className="font-bold text-white text-sm">System Audit Trail</h3>
              <p className="text-xs text-slate-400">
                Tamper-evident logs of every scan, checkout, payment, physical verification, and supervisor override.
              </p>
            </div>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {auditLogs.map((log) => (
              <div
                key={log._id}
                className="p-3 bg-navy-800/60 rounded-xl border border-slate-700/80 flex justify-between items-center text-xs"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-brand-400 font-mono">{log.action}</span>
                    <span className="bg-navy-700 text-slate-300 px-1.5 py-0.5 rounded text-[10px]">
                      {log.entityType}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Actor: {log.actorName || log.actorRole || 'System'} • {log.reason || 'Routine operation'}
                  </p>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
              </div>
            ))}

            {auditLogs.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-6">No audit records found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
