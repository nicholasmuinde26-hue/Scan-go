import React from 'react';
import {
  ShoppingBag,
  DollarSign,
  Store as StoreIcon,
  AlertOctagon,
  ShieldAlert,
  Activity,
  Layers,
  Clock,
  HardDrive,
  RefreshCw,
  AlertTriangle,
  Info,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { OverviewKPIs, QueueDepth, PlatformAlert, SystemHealth } from './superAdminTypes.js';
import { formatKes } from '../../api.js';

interface OverviewSectionProps {
  kpis: OverviewKPIs | null;
  queueDepth: QueueDepth | null;
  alerts: PlatformAlert[];
  systemHealth: SystemHealth | null;
  recentDiscrepancies: any[];
  loading: boolean;
  onRefresh: () => void;
  onNavigateSection: (section: any) => void;
}

export const OverviewSection: React.FC<OverviewSectionProps> = ({
  kpis,
  queueDepth,
  alerts,
  systemHealth,
  recentDiscrepancies,
  loading,
  onRefresh,
  onNavigateSection,
}) => {
  return (
    <div className="space-y-6">
      {/* Top Bar with Live Indicator & Refresh */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-3 h-3 rounded-full bg-brand-500 animate-ping absolute inset-0" />
            <div className="w-3 h-3 rounded-full bg-brand-600 relative" />
          </div>
          <div>
            <h2 className="text-base font-bold text-navy-800">Platform Command Live Overview</h2>
            <p className="text-xs text-slate-500">Live operational telemetry across all supermarket workspaces</p>
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-navy-600' : ''}`} />
          <span>Sync Telemetry</span>
        </button>
      </div>

      {/* 5 Live KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Orders */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2 hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium uppercase tracking-wider">Orders</span>
            <div className="p-2 bg-brand-50 text-brand-600 rounded-xl">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-navy-800">{kpis?.totalOrders.toLocaleString() ?? '—'}</span>
            <span className="text-[11px] font-bold text-brand-700 bg-brand-100 px-2 py-0.5 rounded-full">
              +{kpis?.todayOrders ?? 0} today
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Total processed checkout trips</p>
        </div>

        {/* GMV */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2 hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium uppercase tracking-wider">Platform GMV</span>
            <div className="p-2 bg-navy-50 text-navy-600 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-navy-800">
              {kpis ? formatKes(kpis.gmvMinor) : '—'}
            </span>
            <span className="text-[11px] font-bold text-navy-700 bg-navy-100 px-2 py-0.5 rounded-full">
              Gross Volume
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Gross merchandise transaction value</p>
        </div>

        {/* Active Stores */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2 hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium uppercase tracking-wider">Active Stores</span>
            <div className="p-2 bg-azure-50 text-azure-600 rounded-xl">
              <StoreIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-navy-800">
              {kpis?.activeStores ?? '—'}
              <span className="text-sm font-normal text-slate-400">/{kpis?.totalStores ?? '—'}</span>
            </span>
            <span className="text-[11px] font-bold text-azure-700 bg-azure-100 px-2 py-0.5 rounded-full">
              Branches Online
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Supermarket branches serving retail shoppers</p>
        </div>

        {/* Failed Payments */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2 hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium uppercase tracking-wider">Failed Payments</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <AlertOctagon className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-rose-600">{kpis?.failedPayments ?? '—'}</span>
            <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
              {kpis?.todayFailedPayments ?? 0} today
            </span>
          </div>
          <p className="text-[11px] text-slate-400">STK callback cancellations / errors</p>
        </div>

        {/* Exit Mismatches */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2 hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium uppercase tracking-wider">Exit Mismatches</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-600">{kpis?.exitMismatches ?? '—'}</span>
            <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
              {kpis?.todayExitMismatches ?? 0} today
            </span>
          </div>
          <p className="text-[11px] text-slate-400">Theft & scan discrepancy interceptions</p>
        </div>
      </div>

      {/* Queue Depth Cards */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-navy-800 flex items-center space-x-2">
            <Layers className="w-4 h-4 text-navy-600" />
            <span>Platform Real-Time Queue Depth</span>
          </h3>
          <span className="text-xs text-slate-400">Live operational load</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div
            onClick={() => onNavigateSection('SUPPORT_DESK')}
            className="p-3.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200/80 cursor-pointer transition"
          >
            <p className="text-xs text-slate-500">Pending Orders</p>
            <p className="text-xl font-bold text-navy-800 mt-1">{queueDepth?.pendingOrders ?? 0}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Awaiting payment or customer approval</p>
          </div>

          <div
            onClick={() => onNavigateSection('STORES')}
            className="p-3.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200/80 cursor-pointer transition"
          >
            <p className="text-xs text-slate-500">Active Picking Tasks</p>
            <p className="text-xl font-bold text-amber-600 mt-1">{queueDepth?.pendingPicking ?? 0}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Shop & Collect store picker queues</p>
          </div>

          <div
            onClick={() => onNavigateSection('RISK_FRAUD')}
            className="p-3.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200/80 cursor-pointer transition"
          >
            <p className="text-xs text-slate-500">Exit Inspection Queue</p>
            <p className="text-xl font-bold text-azure-600 mt-1">{queueDepth?.pendingExits ?? 0}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Active AMBER / RED lane audits</p>
          </div>

          <div
            onClick={() => onNavigateSection('APPROVALS_INBOX')}
            className="p-3.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200/80 cursor-pointer transition"
          >
            <p className="text-xs text-slate-500">Maker-Checker Approvals</p>
            <p className="text-xl font-bold text-navy-600 mt-1">{queueDepth?.pendingApprovals ?? 0}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Awaiting checker authorization</p>
          </div>
        </div>
      </div>

      {/* 2-Column: Alerts and System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alerts Center */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-navy-800 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>Platform Alerts & Notifications</span>
            </h3>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {alerts.length} active
            </span>
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {alerts.length === 0 ? (
              <div className="p-6 text-center text-slate-400 space-y-1">
                <CheckCircle2 className="w-8 h-8 text-brand-500 mx-auto" />
                <p className="text-xs font-semibold text-slate-600">All systems operational</p>
                <p className="text-[11px]">No active critical or warning alerts detected.</p>
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3.5 rounded-xl border flex items-start space-x-3 text-xs ${
                    alert.type === 'CRITICAL'
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : alert.type === 'WARNING'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-azure-50 border-azure-200 text-azure-900'
                  }`}
                >
                  {alert.type === 'CRITICAL' ? (
                    <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  ) : alert.type === 'WARNING' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-4 h-4 text-azure-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="font-bold">{alert.title}</p>
                    <p className="text-[11px] opacity-90 mt-0.5">{alert.message}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* System Health */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-navy-800 flex items-center space-x-2">
              <Activity className="w-4 h-4 text-brand-600" />
              <span>Core Systems Health & Nodes</span>
            </h3>
            <span className="text-xs font-bold text-brand-700 bg-brand-100 px-2 py-0.5 rounded-full">
              {systemHealth?.dbStatus || 'HEALTHY'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
              <span className="text-slate-400 text-[11px] block">Database Engine</span>
              <p className="font-bold text-navy-700 flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-500" />
                <span>MongoDB ReplicaSet</span>
              </p>
              <span className="text-[10px] text-slate-500">Latency: &lt; 2ms</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
              <span className="text-slate-400 text-[11px] block">Server Process Uptime</span>
              <p className="font-bold text-navy-700 flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>
                  {systemHealth
                    ? `${Math.floor(systemHealth.uptimeSeconds / 3600)}h ${Math.floor(
                        (systemHealth.uptimeSeconds % 3600) / 60
                      )}m`
                    : '—'}
                </span>
              </p>
              <span className="text-[10px] text-slate-500">Continuous execution</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
              <span className="text-slate-400 text-[11px] block">Node Memory Usage</span>
              <p className="font-bold text-navy-700 flex items-center space-x-1.5">
                <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                <span>{systemHealth ? `${systemHealth.memoryHeapMb} MB Heap` : '—'}</span>
              </p>
              <span className="text-[10px] text-slate-500">
                RSS: {systemHealth?.memoryRssMb ?? '—'} MB
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
              <span className="text-slate-400 text-[11px] block">Runtime Version</span>
              <p className="font-bold text-navy-700 font-mono">
                {systemHealth?.nodeVersion || 'Node.js LTS'}
              </p>
              <span className="text-[10px] text-slate-500">Linux / Docker</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Last heartbeat: {systemHealth ? new Date(systemHealth.timestamp).toLocaleTimeString() : '—'}</span>
            <button
              onClick={() => onNavigateSection('ENGINEERING')}
              className="font-bold text-navy-600 hover:text-navy-700 hover:underline"
            >
              Open Engineering Telemetry &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Recent Discrepancy Stream */}
      {recentDiscrepancies.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-navy-800 flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Recent Exit Lane Interceptions</span>
            </h3>
            <button
              onClick={() => onNavigateSection('RISK_FRAUD')}
              className="text-xs font-bold text-navy-600 hover:underline"
            >
              View All Interceptions &rarr;
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-medium">
                  <th className="py-2">Time</th>
                  <th>Customer Phone</th>
                  <th>Lane</th>
                  <th>Excess Items</th>
                  <th>Excess Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {recentDiscrepancies.map((d: any) => (
                  <tr key={d._id} className="hover:bg-slate-50">
                    <td className="py-2.5 text-slate-500">{new Date(d.createdAt).toLocaleTimeString()}</td>
                    <td className="font-mono">{d.customerId?.phone || 'Guest'}</td>
                    <td>{d.exitLaneId || 'Lane 1'}</td>
                    <td className="font-bold text-rose-600">+{d.totalExcessItems} item(s)</td>
                    <td className="font-bold">{formatKes(d.totalExcessValueMinor || 0)}</td>
                    <td>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        {d.resolved ? 'RESOLVED' : 'INSPECTION'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
