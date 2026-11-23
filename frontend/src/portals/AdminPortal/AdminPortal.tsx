import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  ShieldAlert,
  BarChart3,
  Boxes,
  Settings,
  TrendingUp,
  Search,
  Check,
  Eye,
  Sliders,
  DollarSign,
  Users,
  ShieldCheck,
  Percent,
  Timer,
  SlidersHorizontal,
  RefreshCw,
  Sparkles,
  Building2,
} from 'lucide-react';
import { Store, Product, User } from '../../types.js';
import { apiRequest, formatKes } from '../../api.js';
import { useLiveOrderEvents } from '../../hooks/useLiveOrderEvents.js';
import { SuperAdminDashboard } from '../SuperAdminPortal/SuperAdminDashboard.js';
import { OrgAdminDashboard } from './OrgAdminDashboard.js';
import { BranchManagerDashboard } from './BranchManagerDashboard.js';
import { InventoryControllerDashboard } from './InventoryControllerDashboard.js';
import { LossPreventionAuditorDashboard } from './LossPreventionAuditorDashboard.js';

interface AdminPortalProps {
  currentStore: Store;
  products: Product[];
  currentUser?: User | null;
  stores?: Store[];
  onRefreshStores?: () => void;
}

type AdminTab =
  | 'OVERVIEW'
  | 'CUSTOMER_ORDERS'
  | 'SUPERVISOR_CONSOLE'
  | 'REPORTS'
  | 'INVENTORY'
  | 'SETTINGS'
  | 'WORKSPACES'
  | 'SYSTEM_CONFIG';

/**
 * Role dispatcher. Deny by default: a role that is not listed gets an "access restricted" screen,
 * never a generic admin view. Tabs inside each workspace are further limited by permissions.
 */
export const AdminPortal: React.FC<AdminPortalProps> = ({
  currentStore,
  products,
  currentUser,
  stores,
  onRefreshStores,
}) => {
  const role = currentUser?.role;

  // 1. Platform Root & Super Admin Console (11 Sections)
  if (
    role === 'SYSTEM_ADMIN' ||
    role === 'PLATFORM_OWNER' ||
    role === 'PLATFORM_ADMIN' ||
    role === 'PLATFORM_SUBADMIN' ||
    role === 'FINANCE_ADMIN' ||
    role === 'FINANCE_APPROVER' ||
    role === 'SUPPORT_AGENT_TIER1' ||
    role === 'SUPPORT_LEAD_TIER2' ||
    role === 'PLATFORM_ENGINEER' ||
    role === 'CUSTOMER_SUCCESS' ||
    role === 'COMPLIANCE_AUDITOR' ||
    role === 'RISK_FRAUD_ANALYST'
  ) {
    return <SuperAdminDashboard currentUser={currentUser || null} currentStore={currentStore} />;
  }

  // 2. Org Owner, Org Admin, General Manager & Region Manager Workspace
  if (
    role === 'ORG_OWNER' ||
    role === 'ORG_ADMIN' ||
    role === 'GENERAL_MANAGER' ||
    role === 'REGION_MANAGER' ||
    role === 'FINANCE_OFFICER' ||
    role === 'MARKETING_MANAGER'
  ) {
    return (
      <OrgAdminDashboard
        currentUser={currentUser}
        currentStore={currentStore}
        stores={stores}
        onRefreshStores={onRefreshStores}
      />
    );
  }

  // 3. Branch Manager Workspace (Today's dashboard, roster & shifts, approvals, fraud config, stock alerts, EOD recon)
  if (role === 'BRANCH_MANAGER' || role === 'STORE_MANAGER') {
    return (
      <BranchManagerDashboard
        currentUser={currentUser}
        currentStore={currentStore}
        products={products}
      />
    );
  }

  // 4. Catalogue & Stock Controller Workspace (Product CRUD, bulk import, barcode management, stock levels, adjustments, low-stock, promotions, cycle counts)
  if (role === 'STOCK_CONTROLLER' || role === 'STOCK_MANAGER' || role === 'CATALOGUE_INVENTORY_MANAGER') {
    return (
      <InventoryControllerDashboard
        currentUser={currentUser}
        currentStore={currentStore}
        products={products}
      />
    );
  }

  // 5. Loss Prevention & Auditor Workspace (Read-only reports, shrinkage & discrepancy trends, exportable evidence)
  if (role === 'LOSS_PREVENTION_MANAGER' || role === 'ORG_AUDITOR') {
    return (
      <LossPreventionAuditorDashboard
        currentUser={currentUser}
        currentStore={currentStore}
        products={products}
      />
    );
  }

  return (
    <div className="max-w-xl mx-auto mt-20 bg-white rounded-3xl border border-slate-200 p-10 text-center">
      <h2 className="text-xl font-extrabold text-slate-900">Access restricted</h2>
      <p className="mt-2 text-sm text-slate-500">
        Your account role does not have a workspace in this portal. Ask your administrator to review your role.
      </p>
    </div>
  );
};

/** Former generic store-admin screen. No longer reachable from AdminPortal (it leaked admin controls to unlisted roles). */
export const LegacyStoreAdminPortal: React.FC<AdminPortalProps> = ({
  currentStore,
  products,
  currentUser,
  stores,
  onRefreshStores,
}) => {
  const isSuperAdmin = false;
  const [activeTab, setActiveTab] = useState<AdminTab>('OVERVIEW');
  const [liveOrders, setLiveOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Customer Orders Filter (Screen 16)
  const [orderFilter, setOrderFilter] = useState<'All' | 'Pickup' | 'Scan & Go'>('All');

  // Supervisor Fraud Filter (Screen 20)
  const [fraudFilter, setFraudFilter] = useState<'All' | 'High Risk' | 'Resolved'>('All');

  // Inventory search (Screen 22)
  const [inventorySearch, setInventorySearch] = useState('');

  // Settings Toggles (Screen 23)
  const [enableScanGo, setEnableScanGo] = useState(true);
  const [enableSelfCheckout, setEnableSelfCheckout] = useState(true);

  // Per-Store Dynamic Fraud Thresholds
  const [randomAuditPercentage, setRandomAuditPercentage] = useState(currentStore.fraudConfig?.randomAuditPercentage || 5);
  const [largeBasketKes, setLargeBasketKes] = useState((currentStore.fraudConfig?.largeBasketMinor || 1000000) / 100);
  const [mediumBasketKes, setMediumBasketKes] = useState((currentStore.fraudConfig?.mediumBasketMinor || 500000) / 100);
  const [fullCheckBasketKes, setFullCheckBasketKes] = useState((currentStore.fraudConfig?.fullCheckBasketMinor || 1500000) / 100);
  const [maxItemsWithoutFullCheck, setMaxItemsWithoutFullCheck] = useState(currentStore.fraudConfig?.maxItemsWithoutFullCheck || 25);
  const [manualEntryAmberThreshold, setManualEntryAmberThreshold] = useState(currentStore.fraudConfig?.manualEntryAmberThreshold || 4);
  const [amberScoreThreshold, setAmberScoreThreshold] = useState(currentStore.fraudConfig?.amberScoreThreshold || 30);
  const [amberFullScoreThreshold, setAmberFullScoreThreshold] = useState(currentStore.fraudConfig?.amberFullScoreThreshold || 60);
  const [amberTimeoutSeconds, setAmberTimeoutSeconds] = useState(currentStore.fraudConfig?.amberTimeoutSeconds || 15);

  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);

  // Load orders live
  const loadLiveOrders = async () => {
    try {
      const res = await apiRequest('/orders');
      if (res?.orders) {
        setLiveOrders(res.orders);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) return;
    loadLiveOrders();
  }, [currentStore._id, isSuperAdmin]);

  // Real-Time Event Stream: Updates admin dashboard live!
  useLiveOrderEvents(() => {
    if (!isSuperAdmin) loadLiveOrders();
  });

  // Save Store Fraud Threshold Settings without redeploying
  const handleSaveFraudConfig = async () => {
    try {
      setSavingSettings(true);
      setSettingsMessage(null);
      await apiRequest(`/stores/${currentStore._id}/fraud-config`, {
        method: 'PATCH',
        body: JSON.stringify({
          randomAuditPercentage: Number(randomAuditPercentage),
          largeBasketMinor: Math.round(Number(largeBasketKes) * 100),
          mediumBasketMinor: Math.round(Number(mediumBasketKes) * 100),
          fullCheckBasketMinor: Math.round(Number(fullCheckBasketKes) * 100),
          maxItemsWithoutFullCheck: Number(maxItemsWithoutFullCheck),
          manualEntryAmberThreshold: Number(manualEntryAmberThreshold),
          amberScoreThreshold: Number(amberScoreThreshold),
          amberFullScoreThreshold: Number(amberFullScoreThreshold),
          amberTimeoutSeconds: Number(amberTimeoutSeconds),
        }),
      });
      setSettingsMessage('Fraud sensitivity & exit thresholds updated live across all lanes!');
    } catch (err: any) {
      setSettingsMessage('Error saving thresholds: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  if (isSuperAdmin) {
    return (
      <SuperAdminDashboard
        currentUser={currentUser || null}
        currentStore={currentStore}
        onRefreshStores={onRefreshStores}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto my-6 px-4 font-sans space-y-6">
      {/* Admin Top Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-navy-50 text-navy-700 flex items-center justify-center font-bold">
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-navy-700 text-base">Scan & Go Admin Command Center</h2>
            <p className="text-xs text-slate-400">
              {isSuperAdmin
                ? 'Platform Administration • Supermarket workspaces & system configuration'
                : `Store Management & Loss Prevention • ${currentStore.name}`}
            </p>
          </div>
        </div>

        {/* Sub-tab Navigation matching Screens 16, 17, 20, 21, 22, 23 */}
        <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          {!isSuperAdmin && (
            <>
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'OVERVIEW' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('CUSTOMER_ORDERS')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'CUSTOMER_ORDERS' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
            }`}
          >
            Customer Orders
          </button>
          <button
            onClick={() => setActiveTab('SUPERVISOR_CONSOLE')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'SUPERVISOR_CONSOLE' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
            }`}
          >
            Supervisor Console
          </button>
          <button
            onClick={() => setActiveTab('REPORTS')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'REPORTS' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
            }`}
          >
            Reports
          </button>
          <button
            onClick={() => setActiveTab('INVENTORY')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'INVENTORY' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
            }`}
          >
            Inventory
          </button>
          <button
            onClick={() => setActiveTab('SETTINGS')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'SETTINGS' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
            }`}
          >
            Settings
          </button>
            </>
          )}

          {isSuperAdmin && (
            <>
              <button
                onClick={() => setActiveTab('WORKSPACES')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 font-bold ${
                  activeTab === 'WORKSPACES'
                    ? 'bg-navy-800 text-white shadow-xs'
                    : 'text-slate-700 hover:text-navy-800 hover:bg-slate-200'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Supermarket Workspaces</span>
              </button>
              <button
                onClick={() => setActiveTab('SYSTEM_CONFIG')}
                className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 font-bold ${
                  activeTab === 'SYSTEM_CONFIG'
                    ? 'bg-navy-800 text-white shadow-xs'
                    : 'text-slate-700 hover:text-navy-800 hover:bg-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>System Config</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Screen 17: Admin Dashboard (Overview) */}
      {activeTab === 'OVERVIEW' && !isSuperAdmin && (
        <div className="space-y-6">
          {/* Top 3 KPI Cards: Total Sales, Orders, Customers */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs text-slate-500 font-medium">Total Sales</span>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black text-navy-800">KES 245,780</span>
                <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                  ↑ 12%
                </span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs text-slate-500 font-medium">Orders</span>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black text-navy-800">3,420</span>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  0%
                </span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-xs text-slate-500 font-medium">Customers</span>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black text-navy-800">12,850</span>
                <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                  ↑ 15%
                </span>
              </div>
            </div>
          </div>

          {/* Sales Trend Graph & Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sales Trend Chart (2 cols) */}
            <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="font-bold text-sm text-navy-700">Sales Trend</h3>
                <span className="text-xs font-semibold text-slate-500">7 Days</span>
              </div>

              {/* Smooth Area Wave Simulation */}
              <div className="h-44 flex items-end justify-between space-x-2 pt-6">
                {[35, 45, 60, 50, 75, 90, 85].map((height, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <div
                      className="w-full bg-azure-500/20 border-t-2 border-azure-600 rounded-t-lg transition-all hover:bg-azure-600/30"
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions (1 col) */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="font-bold text-sm text-navy-700 border-b border-slate-100 pb-3">
                Quick Actions
              </h3>
              <div className="space-y-2 text-xs font-semibold">
                <button
                  onClick={() => setActiveTab('INVENTORY')}
                  className="w-full p-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center space-x-2 transition"
                >
                  <Boxes className="w-4 h-4 text-brand-600" />
                  <span>Manage Products</span>
                </button>
                <button
                  onClick={() => setActiveTab('REPORTS')}
                  className="w-full p-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center space-x-2 transition"
                >
                  <BarChart3 className="w-4 h-4 text-azure-600" />
                  <span>View Reports</span>
                </button>
                <button
                  onClick={() => setActiveTab('SETTINGS')}
                  className="w-full p-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center space-x-2 transition"
                >
                  <Users className="w-4 h-4 text-navy-600" />
                  <span>Manage Staff & Settings</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Screen 16: Customer Orders (Admin Table) */}
      {activeTab === 'CUSTOMER_ORDERS' && !isSuperAdmin && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center space-x-3">
              <h3 className="font-bold text-base text-navy-700">Customer Orders</h3>
              <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                {['All', 'Pickup', 'Scan & Go'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setOrderFilter(tab as any)}
                    className={`px-3 py-1 rounded-lg transition ${
                      orderFilter === tab ? 'bg-white text-navy-800 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <span className="text-xs text-slate-500 font-semibold bg-slate-50 px-3 py-1 rounded-lg border border-slate-200">
              Last 7 days
            </span>
          </div>

          {/* Orders Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Order #</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Total</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {liveOrders.filter((order) => orderFilter === 'All' || (orderFilter === 'Pickup' ? order.orderType === 'CLICK_AND_COLLECT' : order.orderType !== 'CLICK_AND_COLLECT')).map((row) => (
                  <tr key={row._id} className="hover:bg-slate-50/60">
                    <td className="p-3 font-bold text-navy-700">#{row.orderNumber}</td>
                    <td className="p-3 text-slate-700">{row.customerId?.name || 'Customer'}</td>
                    <td className="p-3 font-bold text-navy-800">{formatKes(row.totalMinor || 0)}</td>
                    <td className="p-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${row.status === 'HELD' ? 'bg-rose-50 text-rose-700' : row.status === 'PAID' ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700'}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => alert(`Order #${row.orderNumber} · ${row.status}`)}
                        className="text-xs text-azure-600 font-bold hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {liveOrders.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">No orders have been recorded for this store yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Screen 20: Supervisor Console (Fraud Alerts) */}
      {activeTab === 'SUPERVISOR_CONSOLE' && !isSuperAdmin && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-base text-navy-700">Supervisor Fraud Alerts</h3>
              <p className="text-xs text-slate-400">Exit lane mismatches, barcode swaps & suspicious shopping trips</p>
            </div>

            <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
              {['All', 'High Risk', 'Resolved'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFraudFilter(tab as any)}
                  className={`px-3 py-1 rounded-lg transition ${
                    fraudFilter === tab ? 'bg-white text-navy-800 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {liveOrders.filter((order) => order.status === 'HELD').map((order) => ({ id: order.orderNumber || order._id, title: 'Order held for review', detail: `${order.totalItems || order.items?.length || 0} items · ${formatKes(order.totalMinor || 0)}`, severity: 'High', color: 'rose' })).map((alertItem) => (
              <div
                key={alertItem.id}
                className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-3 hover:border-slate-300 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-xs text-navy-700">#{alertItem.id}</span>
                    <span className="text-xs font-bold text-slate-700">{alertItem.title}</span>
                    <span
                      className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                        alertItem.color === 'rose'
                          ? 'bg-rose-100 text-rose-800'
                          : alertItem.color === 'amber'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-brand-100 text-brand-800'
                      }`}
                    >
                      {alertItem.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{alertItem.detail}</p>
                </div>

                <button
                  onClick={() => alert(`Opening incident resolution modal for #${alertItem.id}`)}
                  className="text-xs font-bold text-brand-600 hover:underline flex items-center space-x-1"
                >
                  <span>View Details →</span>
                </button>
              </div>
            ))}
            {liveOrders.filter((order) => order.status === 'HELD').length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No held orders are recorded for this store.</div>}
          </div>
        </div>
      )}

      {/* Screen 21: Reports & Analytics */}
      {activeTab === 'REPORTS' && !isSuperAdmin && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
            <h3 className="font-bold text-base text-navy-700">Reports & Analytics</h3>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-lg">
              This Month
            </span>
          </div>

          {/* Sales Overview Banner */}
          <div className="p-4 bg-brand-50 rounded-2xl border border-brand-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs text-brand-800 font-semibold block">Sales Overview</span>
              <span className="text-2xl font-black text-brand-950">KES 1,245,780</span>
            </div>
            <span className="text-xs font-bold text-brand-700 bg-brand-100 px-2.5 py-1 rounded-full">
              ↑ 14%
            </span>
          </div>

          {/* Green Monthly Bar Chart */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-700">Monthly Revenue Distribution:</span>
            <div className="h-44 flex items-end justify-between space-x-2 pt-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              {[40, 65, 55, 80, 95, 70, 85, 100].map((h, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <div
                    className="w-full bg-brand-600 rounded-t-lg transition-all hover:bg-brand-700"
                    style={{ height: `${h}%` }}
                  />
                  <span className="text-[10px] text-slate-400 font-semibold">Wk {idx + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Screen 22: Inventory Management */}
      {activeTab === 'INVENTORY' && !isSuperAdmin && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-base text-navy-700">Stock Levels</h3>
              <p className="text-xs text-slate-400">Manage store shelf inventory and replenishment alerts</p>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-navy-700 focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* Inventory Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Product</th>
                  <th className="p-3">Barcode</th>
                  <th className="p-3">Price</th>
                  <th className="p-3">Stock</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {products
                  .filter((p) => !inventorySearch || p.name.toLowerCase().includes(inventorySearch.toLowerCase()))
                  .map((p) => {
                    const isLow = p.stock < 50;
                    return (
                      <tr key={p._id} className="hover:bg-slate-50/60">
                        <td className="p-3 font-bold text-navy-700">{p.name}</td>
                        <td className="p-3 font-mono text-slate-500">{p.barcode}</td>
                        <td className="p-3 font-bold text-navy-800">{formatKes(p.priceMinor)}</td>
                        <td className="p-3 font-mono font-bold text-navy-700">{p.stock}</td>
                        <td className="p-3">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isLow ? 'bg-amber-100 text-amber-800' : 'bg-brand-100 text-brand-800'
                            }`}
                          >
                            {isLow ? 'Low Stock' : 'In Stock'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <button
            onClick={() => alert('Stock replenishment request sent to procurement!')}
            className="bg-brand-600 hover:bg-brand-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition shadow-md shadow-brand-600/20"
          >
            Update Stock
          </button>
        </div>
      )}

      {/* Screen 23: Per-Store Dynamic Fraud Thresholds & Sensitivity Settings */}
      {activeTab === 'SETTINGS' && !isSuperAdmin && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-6 max-w-2xl">
          <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-base text-navy-700">Dynamic Store Fraud Thresholds</h3>
              <p className="text-xs text-slate-400">
                Tune risk sensitivity, false-alarm rates, and inspection time limits live without code redeployment.
              </p>
            </div>
            <span className="text-xs bg-navy-100 text-navy-800 font-bold px-2.5 py-1 rounded-full">
              {currentStore.name}
            </span>
          </div>

          {settingsMessage && (
            <div
              className={`p-3 rounded-xl border text-xs font-bold ${
                settingsMessage.includes('Error')
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-brand-50 border-brand-200 text-brand-700'
              }`}
            >
              {settingsMessage}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* 1. Random Audit % */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
              <label className="font-bold text-navy-700 flex items-center justify-between">
                <span>Random Audit Rate:</span>
                <span className="text-navy-600 font-mono">{randomAuditPercentage}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={25}
                value={randomAuditPercentage}
                onChange={(e) => setRandomAuditPercentage(Number(e.target.value))}
                className="w-full accent-navy-600"
              />
              <span className="text-[10px] text-slate-400 block">Controls random quality spot checks (default: 5%)</span>
            </div>

            {/* 2. AMBER Staff Time Limit */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
              <label className="font-bold text-navy-700 flex items-center justify-between">
                <span>AMBER Time Limit:</span>
                <span className="text-amber-600 font-mono">{amberTimeoutSeconds}s</span>
              </label>
              <input
                type="number"
                min={5}
                max={60}
                value={amberTimeoutSeconds}
                onChange={(e) => setAmberTimeoutSeconds(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-mono font-bold"
              />
              <span className="text-[10px] text-slate-400 block">Supervisor alerted if inspection takes longer</span>
            </div>

            {/* 3. AMBER Score Threshold */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
              <label className="font-bold text-navy-700 flex items-center justify-between">
                <span>AMBER Score Trigger:</span>
                <span className="text-amber-600 font-mono">≥ {amberScoreThreshold} pts</span>
              </label>
              <input
                type="number"
                min={10}
                max={50}
                value={amberScoreThreshold}
                onChange={(e) => setAmberScoreThreshold(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-mono font-bold"
              />
              <span className="text-[10px] text-slate-400 block">Risk score threshold triggering 3-item spot check</span>
            </div>

            {/* 4. AMBER FULL Score Trigger */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
              <label className="font-bold text-navy-700 flex items-center justify-between">
                <span>AMBER FULL Score:</span>
                <span className="text-orange-600 font-mono">≥ {amberFullScoreThreshold} pts</span>
              </label>
              <input
                type="number"
                min={40}
                max={80}
                value={amberFullScoreThreshold}
                onChange={(e) => setAmberFullScoreThreshold(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-mono font-bold"
              />
              <span className="text-[10px] text-slate-400 block">Score threshold triggering full trolley scan</span>
            </div>

            {/* 5. Medium Basket Value Limit (KES) */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
              <label className="font-bold text-navy-700 flex items-center justify-between">
                <span>Medium Basket Limit:</span>
                <span className="text-navy-800 font-mono">{formatKes(mediumBasketKes * 100)}</span>
              </label>
              <input
                type="number"
                step={500}
                min={1000}
                max={15000}
                value={mediumBasketKes}
                onChange={(e) => setMediumBasketKes(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-mono font-bold"
              />
              <span className="text-[10px] text-slate-400 block">Value adding +10 risk points (default KES 5,000)</span>
            </div>

            {/* 6. Large Basket Value Limit (KES) */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
              <label className="font-bold text-navy-700 flex items-center justify-between">
                <span>Large Basket Limit:</span>
                <span className="text-navy-800 font-mono">{formatKes(largeBasketKes * 100)}</span>
              </label>
              <input
                type="number"
                step={1000}
                min={2000}
                max={30000}
                value={largeBasketKes}
                onChange={(e) => setLargeBasketKes(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-mono font-bold"
              />
              <span className="text-[10px] text-slate-400 block">Value forcing AMBER audit (default KES 10,000)</span>
            </div>

            {/* 7. Max Items Without Full Check */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
              <label className="font-bold text-navy-700 flex items-center justify-between">
                <span>Max Items (Volume):</span>
                <span className="text-navy-800 font-mono">{maxItemsWithoutFullCheck} items</span>
              </label>
              <input
                type="number"
                min={10}
                max={50}
                value={maxItemsWithoutFullCheck}
                onChange={(e) => setMaxItemsWithoutFullCheck(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-mono font-bold"
              />
              <span className="text-[10px] text-slate-400 block">Quantity adding +10 risk points (default: 25)</span>
            </div>

            {/* 8. Manual Barcode Entry Threshold */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
              <label className="font-bold text-navy-700 flex items-center justify-between">
                <span>Manual Entry Limit:</span>
                <span className="text-navy-800 font-mono">{manualEntryAmberThreshold} entries</span>
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={manualEntryAmberThreshold}
                onChange={(e) => setManualEntryAmberThreshold(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-mono font-bold"
              />
              <span className="text-[10px] text-slate-400 block">Manual scans forcing mandatory item check</span>
            </div>
          </div>

          <button
            onClick={handleSaveFraudConfig}
            disabled={savingSettings}
            className="w-full bg-navy-600 hover:bg-navy-700 disabled:opacity-50 text-white font-bold py-3 rounded-2xl text-xs transition shadow-lg shadow-navy-600/20 flex items-center justify-center space-x-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>{savingSettings ? 'Saving to Database...' : 'Apply & Save Thresholds Live'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
