import React, { useState } from 'react';
import {
  Store as StoreIcon,
  Plus,
  Edit3,
  Activity,
  Clock,
  Smartphone,
  ShieldAlert,
  Search,
  Filter,
  CheckCircle2,
  X,
  SlidersHorizontal,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { apiRequest, formatKes } from '../../api.js';

interface StoresSectionProps {
  stores: any[];
  organizations: any[];
  onRefresh: () => void;
}

export const StoresSection: React.FC<StoresSectionProps> = ({ stores, organizations, onRefresh }) => {
  const [search, setSearch] = useState('');
  const [selectedOrgFilter, setSelectedOrgFilter] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('');

  // Edit / Details Modal
  const [editingStore, setEditingStore] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [healthModalStore, setHealthModalStore] = useState<any | null>(null);
  const [healthData, setHealthData] = useState<any | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filtered stores
  const filtered = stores.filter((s) => {
    const matchSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.location.toLowerCase().includes(search.toLowerCase());
    const matchOrg = !selectedOrgFilter || s.organizationId?._id === selectedOrgFilter;
    const matchStatus =
      !selectedStatusFilter ||
      (selectedStatusFilter === 'ACTIVE' ? s.active !== false : s.active === false);
    return matchSearch && matchOrg && matchStatus;
  });

  const handleOpenEdit = (store: any) => {
    setEditingStore(store);
    setEditForm({
      name: store.name,
      code: store.code,
      location: store.location,
      active: store.active !== false,
      openHours: store.openHours || { openingTime: '08:00', closingTime: '21:00', daysDescription: 'Mon - Sun' },
      mpesaConfig: store.mpesaConfig || { shortcode: '', tillNumber: '', storeIdentifier: '' },
      fraudConfig: {
        largeBasketKes: (store.fraudConfig?.largeBasketMinor || 1000000) / 100,
        mediumBasketKes: (store.fraudConfig?.mediumBasketMinor || 500000) / 100,
        fullCheckBasketKes: (store.fraudConfig?.fullCheckBasketMinor || 1500000) / 100,
        randomAuditPercentage: store.fraudConfig?.randomAuditPercentage || 5,
        amberTimeoutSeconds: store.fraudConfig?.amberTimeoutSeconds || 15,
      },
    });
  };

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await apiRequest(`/platform/stores/${editingStore._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          code: editForm.code,
          location: editForm.location,
          active: editForm.active,
          openHours: editForm.openHours,
          mpesaConfig: editForm.mpesaConfig,
          fraudConfig: {
            largeBasketMinor: Math.round(Number(editForm.fraudConfig.largeBasketKes) * 100),
            mediumBasketMinor: Math.round(Number(editForm.fraudConfig.mediumBasketKes) * 100),
            fullCheckBasketMinor: Math.round(Number(editForm.fraudConfig.fullCheckBasketKes) * 100),
            randomAuditPercentage: Number(editForm.fraudConfig.randomAuditPercentage),
            amberTimeoutSeconds: Number(editForm.fraudConfig.amberTimeoutSeconds),
          },
        }),
      });
      setMsg({ type: 'success', text: `Store ${editForm.name} updated successfully!` });
      setEditingStore(null);
      onRefresh();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to update store' });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenHealth = async (store: any) => {
    setHealthModalStore(store);
    setHealthLoading(true);
    try {
      const res = await apiRequest(`/platform/stores/${store._id}/health`);
      if (res?.success) {
        setHealthData(res.health);
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to load store health' });
    } finally {
      setHealthLoading(false);
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

      {/* Top Bar with Filters */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-navy-800">Stores & Supermarket Branches</h2>
          <p className="text-xs text-slate-500">
            Open hours, pickup slots, M-Pesa till routing, per-branch fraud rules, and live branch health
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 md:w-60">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              placeholder="Search branch code/name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-500"
            />
          </div>

          {/* Org Filter */}
          <select
            value={selectedOrgFilter}
            onChange={(e) => setSelectedOrgFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 bg-white"
          >
            <option value="">All Supermarkets</option>
            {organizations.map((o) => (
              <option key={o._id} value={o._id}>
                {o.name}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 bg-white"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active (Online)</option>
            <option value="INACTIVE">Suspended / Offline</option>
          </select>
        </div>
      </div>

      {/* Store Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((store) => (
          <div
            key={store._id}
            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 hover:border-slate-300 transition flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-navy-800 text-sm">{store.name}</h3>
                  <p className="text-[11px] font-semibold text-navy-700">
                    {store.organizationId?.name || 'Independent Store'}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono">Code: {store.code} | {store.location}</p>
                </div>
                <span
                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                    store.active !== false
                      ? 'bg-brand-100 text-brand-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {store.active !== false ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>

              {/* Badges / Metrics */}
              <div className="grid grid-cols-3 gap-2 text-center text-[10px] bg-slate-50 p-2 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 block">Orders</span>
                  <span className="font-bold text-navy-700 text-xs">{store.orderCount ?? 0}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Products</span>
                  <span className="font-bold text-navy-700 text-xs">{store.productCount ?? 0}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Staff</span>
                  <span className="font-bold text-navy-700 text-xs">{store.staffCount ?? 0}</span>
                </div>
              </div>

              {/* Hours & Mpesa Details */}
              <div className="space-y-1 text-[11px] text-slate-600">
                <div className="flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    Hours: {store.openHours?.openingTime || '08:00'} - {store.openHours?.closingTime || '21:00'} (
                    {store.openHours?.daysDescription || 'Mon - Sun'})
                  </span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-brand-600" />
                  <span>
                    M-Pesa Shortcode: <span className="font-mono font-bold">{store.mpesaConfig?.shortcode || 'Global Daraja'}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => handleOpenHealth(store)}
                className="inline-flex items-center space-x-1 text-xs font-bold text-brand-700 hover:text-brand-800 bg-brand-50 px-2.5 py-1 rounded-lg transition"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Health View</span>
              </button>

              <button
                onClick={() => handleOpenEdit(store)}
                className="inline-flex items-center space-x-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Config</span>
              </button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full p-12 text-center text-xs text-slate-400">
            No store branches matching your query.
          </div>
        )}
      </div>

      {/* Edit Store Modal */}
      {editingStore && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-base text-navy-800">Configure Branch: {editingStore.name}</h3>
                <p className="text-[11px] text-slate-400">Manage hours, M-Pesa till routes, and fraud thresholds</p>
              </div>
              <button onClick={() => setEditingStore(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>

            <form onSubmit={handleSaveStore} className="space-y-4">
              {/* General */}
              <div className="space-y-2.5">
                <p className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">1. Branch Information</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-500 block mb-1">Branch Name</label>
                    <input
                      required
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-3 py-1.5 border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1">Branch Code</label>
                    <input
                      required
                      value={editForm.code}
                      onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                      className="w-full px-3 py-1.5 border rounded-xl"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-slate-500 block mb-1">Location Address</label>
                  <input
                    required
                    value={editForm.location}
                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded-xl"
                  />
                </div>
                <label className="flex items-center space-x-2 pt-1 font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={editForm.active}
                    onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                    className="rounded text-navy-600 focus:ring-navy-500"
                  />
                  <span>Branch Active & Accepting Customer Checkouts</span>
                </label>
              </div>

              {/* Operating Hours */}
              <div className="space-y-2.5 pt-3 border-t">
                <p className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">2. Operating Hours</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-slate-500 block mb-1">Opening Time</label>
                    <input
                      type="time"
                      value={editForm.openHours?.openingTime || '08:00'}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          openHours: { ...editForm.openHours, openingTime: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1">Closing Time</label>
                    <input
                      type="time"
                      value={editForm.openHours?.closingTime || '21:00'}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          openHours: { ...editForm.openHours, closingTime: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1">Open Days</label>
                    <input
                      value={editForm.openHours?.daysDescription || 'Mon - Sun'}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          openHours: { ...editForm.openHours, daysDescription: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 border rounded-xl"
                    />
                  </div>
                </div>
              </div>

              {/* M-Pesa Shortcode per Store */}
              <div className="space-y-2.5 pt-3 border-t">
                <p className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">3. Branch M-Pesa Route</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-500 block mb-1">Shortcode / Paybill</label>
                    <input
                      placeholder="e.g. 174379"
                      value={editForm.mpesaConfig?.shortcode || ''}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          mpesaConfig: { ...editForm.mpesaConfig, shortcode: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1">Till Number (Optional)</label>
                    <input
                      placeholder="e.g. 504030"
                      value={editForm.mpesaConfig?.tillNumber || ''}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          mpesaConfig: { ...editForm.mpesaConfig, tillNumber: e.target.value },
                        })
                      }
                      className="w-full px-3 py-1.5 border rounded-xl"
                    />
                  </div>
                </div>
              </div>

              {/* Per-Store Fraud Config */}
              <div className="space-y-2.5 pt-3 border-t">
                <p className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">4. Loss Prevention Sensitivity</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-slate-500 block mb-1">Large Basket (KES)</label>
                    <input
                      type="number"
                      value={editForm.fraudConfig.largeBasketKes}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          fraudConfig: { ...editForm.fraudConfig, largeBasketKes: Number(e.target.value) },
                        })
                      }
                      className="w-full px-3 py-1.5 border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1">Random Audit %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={editForm.fraudConfig.randomAuditPercentage}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          fraudConfig: { ...editForm.fraudConfig, randomAuditPercentage: Number(e.target.value) },
                        })
                      }
                      className="w-full px-3 py-1.5 border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1">Amber Timeout (sec)</label>
                    <input
                      type="number"
                      value={editForm.fraudConfig.amberTimeoutSeconds}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          fraudConfig: { ...editForm.fraudConfig, amberTimeoutSeconds: Number(e.target.value) },
                        })
                      }
                      className="w-full px-3 py-1.5 border rounded-xl"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingStore(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-navy-600 text-white font-semibold hover:bg-navy-700"
                >
                  {saving ? 'Saving...' : 'Save Branch Config'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Per-Store Health View Modal */}
      {healthModalStore && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-base text-navy-800">Branch Live Health</h3>
                <p className="text-[11px] text-slate-400 font-mono">{healthModalStore.name} ({healthModalStore.code})</p>
              </div>
              <button onClick={() => setHealthModalStore(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>

            {healthLoading ? (
              <p className="py-8 text-center text-slate-400">Reading real-time branch sensors...</p>
            ) : healthData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-brand-50 rounded-xl border border-brand-100">
                    <span className="text-[10px] text-brand-700 block font-semibold uppercase">Today's Revenue</span>
                    <span className="text-lg font-bold text-brand-900">{formatKes(healthData.todayGmvMinor)}</span>
                  </div>
                  <div className="p-3 bg-navy-50 rounded-xl border border-navy-100">
                    <span className="text-[10px] text-navy-700 block font-semibold uppercase">Orders Handled</span>
                    <span className="text-lg font-bold text-navy-900">{healthData.todayOrders} orders</span>
                  </div>
                </div>

                <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Active Exit Lanes:</span>
                    <span className="font-bold text-navy-700">
                      {healthData.activeExitLanes} / {healthData.totalExitLanes} operational
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Open Pickup Slots:</span>
                    <span className="font-bold text-navy-700">
                      {healthData.openPickupSlots} / {healthData.totalPickupSlots} available
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Mismatches Caught:</span>
                    <span className="font-bold text-amber-600">{healthData.todayDiscrepancies} flagged</span>
                  </div>
                </div>

                <div className="pt-2 text-center">
                  <span
                    className={`inline-block px-3 py-1 rounded-full font-bold text-xs ${
                      healthData.isOpen ? 'bg-brand-100 text-brand-800' : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {healthData.isOpen ? '● Lane Verification Running' : '○ Branch Currently Offline'}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
