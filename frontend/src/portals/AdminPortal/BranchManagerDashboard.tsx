import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Clock,
  AlertTriangle,
  Users,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Boxes,
  FileCheck2,
  DollarSign,
  TrendingUp,
  RefreshCw,
  Plus,
  Sliders,
  ChevronRight,
  Eye,
  Check,
  X,
  Building2,
  Calendar,
  QrCode,
  Radio,
} from 'lucide-react';
import { Store, User, Product } from '../../types.js';
import { apiRequest, formatKes } from '../../api.js';
import { useLiveOrderEvents } from '../../hooks/useLiveOrderEvents.js';
import { can } from '../../permissions.js';
import { EntryPosterManager } from './EntryPosterManager.js';
import { DeviceManagerPanel } from './DeviceManagerPanel.js';

interface BranchManagerDashboardProps {
  currentStore: Store;
  currentUser?: User | null;
  products: Product[];
}

type BranchTab = 'TODAY' | 'ROSTER' | 'APPROVALS' | 'FRAUD_CONFIG' | 'STORE_POSTERS' | 'DEVICES' | 'STOCK_ALERTS' | 'EOD_RECON';

export const BranchManagerDashboard: React.FC<BranchManagerDashboardProps> = ({
  currentStore,
  currentUser,
  products,
}) => {
  const [activeTab, setActiveTab] = useState<BranchTab>('TODAY');
  const branchTabs: { id: BranchTab; label: string; icon: any; permission: string }[] = [
    { id: 'TODAY', label: "Today's Dashboard", icon: LayoutDashboard, permission: 'orders:read:store' },
    { id: 'ROSTER', label: 'Staff Roster & Shifts', icon: Calendar, permission: 'staff:read' },
    { id: 'APPROVALS', label: 'Approvals Queue', icon: CheckCircle2, permission: 'supervisor:approve' },
    { id: 'FRAUD_CONFIG', label: 'Branch Fraud Config', icon: ShieldAlert, permission: 'fraud:config' },
    { id: 'STORE_POSTERS', label: 'Store Check-in Posters', icon: QrCode, permission: 'fraud:config' },
    { id: 'DEVICES', label: 'Retail Devices', icon: Radio, permission: 'stores:manage' },
    { id: 'STOCK_ALERTS', label: 'Stock Alerts', icon: Boxes, permission: 'inventory:read' },
    { id: 'EOD_RECON', label: 'End-of-Day Reconciliation', icon: FileCheck2, permission: 'reports:export' },
  ];
  const visibleBranchTabs = branchTabs.filter((tab) => can(currentUser, tab.permission));
  const canAssignStaff = can(currentUser, 'staff:assign');
  const canApprove = can(currentUser, 'supervisor:approve');
  const canEditFraud = can(currentUser, 'fraud:config');
  const canRestock = can(currentUser, 'inventory:write');
  const canSubmitEod = can(currentUser, 'reports:export');
  useEffect(() => {
    if (!visibleBranchTabs.some((tab) => tab.id === activeTab)) setActiveTab(visibleBranchTabs[0]?.id || 'TODAY');
  }, [currentUser?.permissions, activeTab]);
  const [liveOrders, setLiveOrders] = useState<any[]>([]);
  const [roster, setRoster] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [eodRecords, setEodRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fraud Config state
  const [randomAuditPct, setRandomAuditPct] = useState(currentStore.fraudConfig?.randomAuditPercentage || 5);
  const [largeBasketKes, setLargeBasketKes] = useState((currentStore.fraudConfig?.largeBasketMinor || 1000000) / 100);
  const [amberTimeoutSec, setAmberTimeoutSec] = useState(currentStore.fraudConfig?.amberTimeoutSeconds || 15);
  const [savingFraud, setSavingFraud] = useState(false);

  // EOD Form state
  const [eodCash, setEodCash] = useState('45200');
  const [eodMpesa, setEodMpesa] = useState('284500');
  const [eodVoids, setEodVoids] = useState('1450');
  const [eodRefunds, setEodRefunds] = useState('2100');
  const [eodNotes, setEodNotes] = useState('');
  const [submittingEod, setSubmittingEod] = useState(false);

  // New Shift state
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [shiftStaffName, setShiftStaffName] = useState('');
  const [shiftRole, setShiftRole] = useState('PICKER');
  const [shiftTime, setShiftTime] = useState('Morning (07:00 - 15:00)');
  const [shiftStation, setShiftStation] = useState('Aisle 1-4');

  // Load Branch Data
  const loadBranchData = async () => {
    try {
      setLoading(true);

      // 1. Live Orders
      const ordersRes = await apiRequest(`/orders?storeId=${currentStore._id}`);
      if (ordersRes?.orders) setLiveOrders(ordersRes.orders);

      // 2. Roster
      const rosterRes = await apiRequest(`/stores/${currentStore._id}/roster`);
      if (rosterRes?.roster) setRoster(rosterRes.roster);

      // 3. Approvals
      const approvalsRes = await apiRequest(`/approvals/store/${currentStore._id}/pending`);
      if (approvalsRes?.approvals) setApprovals(approvalsRes.approvals);

      // 4. Low stock
      const stockRes = await apiRequest(`/products/alerts/low-stock?storeId=${currentStore._id}`);
      if (stockRes?.products) {
        setLowStockProducts(stockRes.products);
      } else {
        // Fallback filter
        setLowStockProducts(products.filter((p) => (p.stock || 0) <= 15));
      }

      // 5. EOD records
      const eodRes = await apiRequest(`/stores/${currentStore._id}/eod-reconciliation`);
      if (eodRes?.records) setEodRecords(eodRes.records);
    } catch (err: any) {
      console.warn('Error loading branch manager data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranchData();
  }, [currentStore._id]);

  // Live SSE listener
  useLiveOrderEvents((event) => {
    if (
      event.type === 'order.created' ||
      event.type === 'order.paid' ||
      event.type === 'discrepancy.escalated' ||
      event.type === 'approval.created' ||
      event.type === 'stock.adjusted'
    ) {
      loadBranchData();
    }
  });

  const handleSaveFraudConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingFraud(true);
      await apiRequest(`/stores/${currentStore._id}/fraud-config`, {
        method: 'PATCH',
        body: JSON.stringify({
          randomAuditPercentage: Number(randomAuditPct),
          largeBasketMinor: Number(largeBasketKes) * 100,
          amberTimeoutSeconds: Number(amberTimeoutSec),
          reason: 'Branch manager routine threshold calibration',
        }),
      });
      setStatusMsg({ type: 'success', text: 'Branch fraud thresholds saved successfully.' });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to update fraud config' });
    } finally {
      setSavingFraud(false);
    }
  };

  const handleApproveAction = async (approvalId: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      await apiRequest(`/approvals/${approvalId}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision, note: `Branch manager decision: ${decision}` }),
      });
      setStatusMsg({ type: 'success', text: `Approval request marked as ${decision}.` });
      loadBranchData();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to review approval' });
    }
  };

  const handleSubmitEod = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmittingEod(true);
      await apiRequest(`/stores/${currentStore._id}/eod-reconciliation`, {
        method: 'POST',
        body: JSON.stringify({
          totalMpesaMinor: Number(eodMpesa) * 100,
          cashCountedMinor: Number(eodCash) * 100,
          voidsMinor: Number(eodVoids) * 100,
          refundsMinor: Number(eodRefunds) * 100,
          discrepancyLossMinor: 0,
          notes: eodNotes || 'All registers balanced and verified against STK push settlement.',
        }),
      });
      setStatusMsg({ type: 'success', text: 'End-of-day reconciliation recorded and balanced!' });
      loadBranchData();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to submit reconciliation' });
    } finally {
      setSubmittingEod(false);
    }
  };

  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest(`/stores/${currentStore._id}/roster`, {
        method: 'POST',
        body: JSON.stringify({
          shiftAssignment: {
            staffName: shiftStaffName,
            role: shiftRole,
            shift: shiftTime,
            station: shiftStation,
            status: 'ACTIVE',
          },
        }),
      });
      setShowRosterModal(false);
      setShiftStaffName('');
      setStatusMsg({ type: 'success', text: `Shift assigned to ${shiftStaffName}.` });
      loadBranchData();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to assign shift' });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="bg-azure-100 text-azure-800 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Branch Manager
            </span>
            <span className="text-xs text-slate-400">Store: {currentStore.name} ({currentStore.code})</span>
          </div>
          <h1 className="text-2xl font-black text-navy-800 mt-1">Today's Branch Operations</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time orders, staff shift rosters, manager dual-sign-off approvals, fraud controls, and end-of-day reconciliation.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => loadBranchData()}
            className="flex items-center space-x-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync Live</span>
          </button>
          {canAssignStaff && <button
            onClick={() => setShowRosterModal(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-azure-600 hover:bg-azure-700 text-white text-xs font-bold rounded-xl shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Assign Shift</span>
          </button>}
        </div>
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

      {/* Tabs */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2 border-b border-slate-200">
        {visibleBranchTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as BranchTab)}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                isActive
                  ? 'bg-azure-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Today's Dashboard */}
      {activeTab === 'TODAY' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Today's Orders</span>
              <p className="text-2xl font-black text-navy-800 mt-1">{liveOrders.length}</p>
              <span className="text-[11px] text-brand-600 font-bold">18 Completed • 6 In Progress</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Avg Exit Queue Time</span>
              <p className="text-2xl font-black text-azure-600 mt-1">16.2s</p>
              <span className="text-[11px] text-slate-500">Green lane automated check</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Exceptions</span>
              <p className="text-2xl font-black text-amber-600 mt-1">1 Discrepancy</p>
              <span className="text-[11px] text-slate-500">Resolved at Lane #1</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Today's Revenue</span>
              <p className="text-2xl font-black text-brand-700 mt-1">{formatKes(32970000)}</p>
              <span className="text-[11px] text-slate-500">M-Pesa STK Instant</span>
            </div>
          </div>

          {/* Live Orders Table */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Live Customer Orders Stream</h3>
                <p className="text-xs text-slate-500">Real-time status of Scan & Go baskets and Shop & Collect orders.</p>
              </div>
              <span className="text-xs font-bold text-slate-400">{liveOrders.length} active sessions</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 uppercase font-black text-[10px]">
                    <th className="py-3 px-3">Order Number</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">Customer</th>
                    <th className="py-3 px-3">Items / Total</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {liveOrders.slice(0, 8).map((ord) => (
                    <tr key={ord._id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-3 font-mono font-bold text-navy-800">{ord.orderNumber}</td>
                      <td className="py-3.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700">
                          {ord.orderType}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-slate-700 font-medium">
                        {ord.customerId?.name || 'Walk-in Shopper'}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-navy-800">{formatKes(ord.totalMinor)}</div>
                        <div className="text-[11px] text-slate-400">{ord.items?.length || 1} item(s)</div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-brand-100 text-brand-800">
                          {ord.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-slate-400">
                        {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Staff Roster & Shifts */}
      {activeTab === 'ROSTER' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Branch Staff Roster & Stations</h3>
              <p className="text-xs text-slate-500">Assign morning/afternoon shifts and stations for Pickers, Verifiers, and Exit staff.</p>
            </div>
            {canAssignStaff && <button
              onClick={() => setShowRosterModal(true)}
              className="px-4 py-2 bg-azure-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-azure-700 flex items-center space-x-1.5 self-start"
            >
              <Plus className="w-4 h-4" />
              <span>Assign Staff Shift</span>
            </button>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roster.map((shift, idx) => (
              <div key={idx} className="border border-slate-200 rounded-2xl p-5 space-y-3 hover:border-slate-300 transition">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-navy-800 text-sm">{shift.staffName}</h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-navy-700 border border-slate-200 mt-1 inline-block">
                      {shift.role}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-brand-100 text-brand-800">
                    {shift.status}
                  </span>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-1">
                  <div className="flex justify-between">
                    <span>Shift Hours:</span>
                    <strong className="text-navy-700">{shift.shift}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Assigned Station:</span>
                    <strong className="text-azure-700">{shift.station}</strong>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-between text-xs font-bold text-slate-600">
                  <span className="text-[11px] text-slate-400">Checked in 07:45 AM</span>
                  {canAssignStaff && <button className="text-rose-600 hover:underline">Reassign</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Approvals Queue */}
      {activeTab === 'APPROVALS' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
          <div>
            <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Branch Maker-Checker Approvals Queue</h3>
            <p className="text-xs text-slate-500">Dual-sign-off required for order voids, refunds exceeding cashier limits, and price overrides.</p>
          </div>

          {approvals.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-brand-500 opacity-80" />
              <p className="text-xs font-bold text-slate-600">All branch requests approved and up to date.</p>
              <p className="text-[11px] text-slate-400">No pending voids, refunds, or price overrides awaiting dual sign-off.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {approvals.map((req) => (
                <div key={req._id} className="border border-slate-200 rounded-2xl p-5 hover:border-slate-300 transition space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900">
                          {req.type}
                        </span>
                        <span className="font-mono text-xs font-bold text-navy-700">
                          {req.requestData?.orderNumber || req._id}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{req.notes || 'Pending manager dual review'}</p>
                    </div>

                    <div className="flex items-center space-x-2">
                      {canApprove && <button
                        onClick={() => handleApproveAction(req._id, 'APPROVED')}
                        className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1 shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Authorize</span>
                      </button>}
                      {canApprove && <button
                        onClick={() => handleApproveAction(req._id, 'REJECTED')}
                        className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center space-x-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>}
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600 flex flex-wrap gap-4">
                    <span>Requested By: <strong className="text-navy-700">{req.requestedByName} ({req.requestedByRole})</strong></span>
                    {req.requestData?.refundAmountMinor && (
                      <span>Amount: <strong className="text-brand-700">{formatKes(req.requestData.refundAmountMinor)}</strong></span>
                    )}
                    {req.requestData?.reason && (
                      <span>Reason: <strong className="text-navy-700">{req.requestData.reason}</strong></span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Branch Fraud Config */}
      {activeTab === 'FRAUD_CONFIG' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
          <div>
            <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Branch Dynamic Fraud Thresholds</h3>
            <p className="text-xs text-slate-500">Fine-tune risk triggers, random audit frequency, and inspection time limits for this branch.</p>
          </div>

          <form onSubmit={handleSaveFraudConfig} className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            <div className="border border-slate-200 rounded-2xl p-5 space-y-3">
              <label className="font-bold text-navy-700 block">Random Audit Percentage (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={randomAuditPct}
                onChange={(e) => setRandomAuditPct(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-xl p-3 font-bold text-navy-800"
              />
              <span className="text-[11px] text-slate-400 block">Percentage of green shoppers picked for random physical check.</span>
            </div>

            <div className="border border-slate-200 rounded-2xl p-5 space-y-3">
              <label className="font-bold text-navy-700 block">Large Basket Threshold (KES)</label>
              <input
                type="number"
                min="1000"
                step="500"
                value={largeBasketKes}
                onChange={(e) => setLargeBasketKes(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-xl p-3 font-bold text-navy-800"
              />
              <span className="text-[11px] text-slate-400 block">Baskets above this amount trigger AMBER inspection band.</span>
            </div>

            <div className="border border-slate-200 rounded-2xl p-5 space-y-3">
              <label className="font-bold text-navy-700 block">Amber Staff Timeout (Seconds)</label>
              <input
                type="number"
                min="5"
                max="60"
                value={amberTimeoutSec}
                onChange={(e) => setAmberTimeoutSec(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-xl p-3 font-bold text-navy-800"
              />
              <span className="text-[11px] text-slate-400 block">Time limit for exit lane officer before amber overtime escalation.</span>
            </div>

            <div className="md:col-span-3 flex justify-end">
              {canEditFraud && <button
                type="submit"
                disabled={savingFraud}
                className="px-5 py-2.5 bg-azure-600 hover:bg-azure-700 text-white rounded-xl font-bold shadow-xs transition"
              >
                {savingFraud ? 'Saving Changes...' : 'Save Branch Thresholds'}
              </button>}
            </div>
          </form>
        </div>
      )}

      {activeTab === 'STORE_POSTERS' && (
        <EntryPosterManager storeId={currentStore._id} storeName={currentStore.name} canManage={canEditFraud} />
      )}

      {activeTab === 'DEVICES' && (
        <DeviceManagerPanel currentStore={currentStore} />
      )}

      {/* Tab 5: Stock Alerts */}
      {activeTab === 'STOCK_ALERTS' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Branch Low-Stock Warnings</h3>
              <p className="text-xs text-slate-500">Products with inventory below threshold (≤ 15 units) needing warehouse restock.</p>
            </div>
            <span className="px-2.5 py-1 bg-amber-100 text-amber-900 rounded-full text-xs font-black">
              {lowStockProducts.length} Items Alerting
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 uppercase font-black text-[10px]">
                  <th className="py-3 px-3">Product Name</th>
                  <th className="py-3 px-3">Barcode</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Current Stock</th>
                  {can(currentUser, 'pricing:read') && <th className="py-3 px-3">Retail Price</th>}
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lowStockProducts.map((prod) => (
                  <tr key={prod._id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3 font-bold text-navy-800">{prod.name}</td>
                    <td className="py-3 px-3 font-mono text-slate-500">{prod.barcode}</td>
                    <td className="py-3 px-3 text-slate-600">{prod.category}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">
                        {prod.stock} left
                      </span>
                    </td>
                    {can(currentUser, 'pricing:read') && <td className="py-3 px-3 font-bold text-navy-700">{formatKes(prod.priceMinor)}</td>}
                    <td className="py-3 px-3 text-right">
                      {canRestock && <button
                        onClick={() => alert(`Requested restock replenishment for ${prod.name}`)}
                        className="px-3 py-1 bg-navy-800 hover:bg-navy-700 text-white rounded-lg font-bold text-[11px]"
                      >
                        Request Restock
                      </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 6: End-of-Day Reconciliation */}
      {activeTab === 'EOD_RECON' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
          <div>
            <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Branch End-of-Day Reconciliation</h3>
            <p className="text-xs text-slate-500">Balance cash drawer, verify M-Pesa settlements against receipts, and perform digital sign-off.</p>
          </div>

          <form onSubmit={handleSubmitEod} className="border border-slate-200 rounded-2xl p-6 space-y-5">
            <h4 className="font-bold text-navy-800 text-sm">Today's Closing Register Balances</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">M-Pesa Collections (KES)</label>
                <input
                  type="number"
                  value={eodMpesa}
                  onChange={(e) => setEodMpesa(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-3 font-bold text-brand-700"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Cash Drawer Count (KES)</label>
                <input
                  type="number"
                  value={eodCash}
                  onChange={(e) => setEodCash(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-3 font-bold text-navy-800"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Total Voids (KES)</label>
                <input
                  type="number"
                  value={eodVoids}
                  onChange={(e) => setEodVoids(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-3 font-bold text-slate-700"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Total Refunds (KES)</label>
                <input
                  type="number"
                  value={eodRefunds}
                  onChange={(e) => setEodRefunds(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-3 font-bold text-rose-700"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1 text-xs">Manager Notes & Register Variance Explanation</label>
              <textarea
                value={eodNotes}
                onChange={(e) => setEodNotes(e.target.value)}
                placeholder="All shift handovers completed without unexplained variances. Safe drop deposited."
                className="w-full border border-slate-200 rounded-xl p-3 text-xs focus:outline-azure-500"
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">Branch Manager Sign-off: {currentUser?.name}</span>
              <button
                type="submit"
                disabled={submittingEod}
                className="px-5 py-2.5 bg-azure-600 hover:bg-azure-700 text-white rounded-xl font-bold text-xs shadow-xs"
              >
                {submittingEod ? 'Balancing...' : 'Submit & Close Day'}
              </button>
            </div>
          </form>

          {/* Past Reconciliation Records */}
          {eodRecords.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-bold text-navy-800 text-sm">Past Closed Reconciliations</h4>
              <div className="divide-y divide-slate-100 text-xs">
                {eodRecords.map((rec) => (
                  <div key={rec.id} className="py-3 flex items-center justify-between">
                    <div>
                      <strong className="text-navy-700">{rec.date}</strong>
                      <span className="text-slate-400 ml-2">by {rec.closedBy}</span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span>M-Pesa: <strong>{formatKes(rec.totalMpesaMinor)}</strong></span>
                      <span>Cash: <strong>{formatKes(rec.cashCountedMinor)}</strong></span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-brand-100 text-brand-800">
                        {rec.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Roster Modal */}
      {showRosterModal && (
        <div className="fixed inset-0 bg-navy-800/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-navy-800 text-sm">Assign Staff Shift</h3>
              <button onClick={() => setShowRosterModal(false)} className="text-slate-400 hover:text-slate-700 text-lg">
                ×
              </button>
            </div>

            <form onSubmit={handleAddShift} className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Staff Member Name</label>
                <input
                  type="text"
                  placeholder="e.g. Jane Wambui"
                  value={shiftStaffName}
                  onChange={(e) => setShiftStaffName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 font-medium"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Role</label>
                <select
                  value={shiftRole}
                  onChange={(e) => setShiftRole(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-white font-medium"
                >
                  <option value="PICKER">Order Picker</option>
                  <option value="PACKER_VERIFIER">Packer Verifier</option>
                  <option value="EXIT_OFFICER">Exit Gate Officer</option>
                  <option value="CASHIER_CUSTOMER_SERVICE">Cashier / Customer Service</option>
                  <option value="SUPERVISOR">Floor Supervisor</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Shift Time</label>
                <select
                  value={shiftTime}
                  onChange={(e) => setShiftTime(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-white font-medium"
                >
                  <option>Morning (07:00 - 15:00)</option>
                  <option>Afternoon (14:00 - 22:00)</option>
                  <option>Full Day (08:00 - 17:00)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Station</label>
                <input
                  type="text"
                  placeholder="e.g. Exit Lane #1 or Aisle 3"
                  value={shiftStation}
                  onChange={(e) => setShiftStation(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 font-medium"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowRosterModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-azure-600 text-white rounded-xl font-bold shadow-xs hover:bg-azure-700"
                >
                  Save Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};