import React, { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  Boxes,
  CreditCard,
  BarChart3,
  Settings,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Phone,
  Shield,
  Download,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  RefreshCw,
  Sliders,
  DollarSign,
  Package,
} from 'lucide-react';
import { Store, User, Product } from '../../types.js';
import { apiRequest, formatKes } from '../../api.js';
import { can, canAny } from '../../permissions.js';
import { BranchRoleDirectory } from './BranchRoleDirectory.js';

interface OrgAdminDashboardProps {
  currentUser?: User | null;
  currentStore: Store;
  stores?: Store[];
  onRefreshStores?: () => void;
}

type OrgTab = 'STORES' | 'STAFF' | 'CATALOGUE_POLICY' | 'BILLING' | 'REPORTS' | 'SETTINGS';

export const OrgAdminDashboard: React.FC<OrgAdminDashboardProps> = ({
  currentUser,
  currentStore,
  stores = [],
  onRefreshStores,
}) => {
  // Only the tabs this person's permissions allow. The first allowed tab is the landing tab.
  const allTabs: { id: OrgTab; label: string; icon: any; allowed: boolean }[] = [
    { id: 'STORES', label: 'All Stores', icon: Building2, allowed: can(currentUser, 'stores:read') },
    { id: 'STAFF', label: 'Staff & Invitations', icon: Users, allowed: can(currentUser, 'staff:read') },
    { id: 'CATALOGUE_POLICY', label: 'Catalogue & Pricing Policy', icon: Boxes, allowed: can(currentUser, 'pricing:read') },
    { id: 'BILLING', label: 'Subscription & Billing', icon: CreditCard, allowed: canAny(currentUser, ['org:subscription:view', 'wallet:read', 'finance:invoices:read', 'payouts:view', 'payouts:request']) },
    { id: 'REPORTS', label: 'Org-Wide Reports', icon: BarChart3, allowed: can(currentUser, 'reports:read') },
    { id: 'SETTINGS', label: 'Organization Settings', icon: Settings, allowed: can(currentUser, 'org:config') },
  ];
  const visibleTabs = allTabs.filter((t) => t.allowed);
  const canCreateStore = canAny(currentUser, ['stores:create', 'stores:manage']);
  const canInviteStaff = can(currentUser, 'staff:manage');
  const [activeTab, setActiveTab] = useState<OrgTab>((visibleTabs[0]?.id || 'STORES') as OrgTab);
  const [loading, setLoading] = useState(false);
  const [orgStaff, setOrgStaff] = useState<any[]>([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [newStoreModalOpen, setNewStoreModalOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Invite state
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('BRANCH_MANAGER');
  const [inviteStoreId, setInviteStoreId] = useState(currentStore._id);

  // New Store state
  const [storeName, setStoreName] = useState('');
  const [storeCode, setStoreCode] = useState('');
  const [storeLocation, setStoreLocation] = useState('');

  // Org-wide reports state
  const [reportRange, setReportRange] = useState('This Month');

  // Load org staff
  const loadStaff = async () => {
    if (!can(currentUser, 'staff:read')) return;
    try {
      setLoading(true);
      const res = await apiRequest(`/stores/${currentStore._id}/staff`);
      if (res?.staff) {
        setOrgStaff(res.staff);
      }
    } catch (err: any) {
      console.warn('Could not load staff:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, [currentStore._id]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await apiRequest('/invites', {
        method: 'POST',
        body: JSON.stringify({
          name: inviteName,
          phone: invitePhone,
          email: inviteEmail,
          role: inviteRole,
          storeId: inviteStoreId,
        }),
      });
      setStatusMsg({ type: 'success', text: `Invitation sent to ${invitePhone || inviteEmail} successfully.` });
      setInviteModalOpen(false);
      setInviteName('');
      setInvitePhone('');
      setInviteEmail('');
      loadStaff();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to send invite' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await apiRequest('/stores', {
        method: 'POST',
        body: JSON.stringify({
          name: storeName,
          code: storeCode,
          location: storeLocation,
        }),
      });
      setStatusMsg({ type: 'success', text: `Store "${storeName}" created successfully.` });
      setNewStoreModalOpen(false);
      setStoreName('');
      setStoreCode('');
      setStoreLocation('');
      if (onRefreshStores) onRefreshStores();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to create store' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans space-y-6">
      {/* Org Header Bar */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="bg-brand-100 text-brand-800 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Organization Admin
            </span>
            <span className="text-xs text-slate-400">Enterprise Supermarket Suite</span>
          </div>
          <h1 className="text-2xl font-black text-navy-800 mt-1">Supermarket Operations Command</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage stores, branch managers, staff invitations, subscription billing, and org-wide retail policies.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {canCreateStore && (<button
            onClick={() => setNewStoreModalOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-navy-800 hover:bg-navy-700 text-white text-xs font-bold rounded-xl shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Store Branch</span>
          </button>)}
          {canInviteStaff && (<button
            onClick={() => setInviteModalOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl shadow-xs transition"
          >
            <Users className="w-4 h-4" />
            <span>Invite Staff</span>
          </button>)}
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
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                isActive
                  ? 'bg-navy-800 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: All Stores */}
      {activeTab === 'STORES' && visibleTabs.some((t) => t.id === 'STORES') && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Stores</span>
              <p className="text-2xl font-black text-navy-800 mt-1">{stores.length}</p>
              <span className="text-[11px] text-brand-600 font-bold mt-1 inline-block">Enterprise Multi-Store</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Assigned Staff</span>
              <p className="text-2xl font-black text-navy-800 mt-1">{orgStaff.length + 8}</p>
              <span className="text-[11px] text-slate-500 mt-1 inline-block">Across all store branches</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">M-Pesa Collections</span>
              <p className="text-2xl font-black text-brand-600 mt-1">{formatKes(34250000)}</p>
              <span className="text-[11px] text-slate-500 mt-1 inline-block">Direct supermarket settlement</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Store Branches</h3>
              <span className="text-xs text-slate-400">{stores.length} registered locations</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {stores.map((s) => (
                <div key={s._id} className="border border-slate-200 rounded-2xl p-5 hover:border-slate-300 transition space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-navy-800 text-sm">{s.name}</h4>
                      <p className="text-xs text-slate-400">Code: {s.code} • {s.location}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-brand-100 text-brand-800">
                      ACTIVE
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Exit Lanes:</span>
                      <strong className="text-navy-700">{s.exitLanes?.length || 0}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Pickup Slots:</span>
                      <strong className="text-navy-700">{s.pickupSlots?.length || 0} slots</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>M-Pesa Till/Shortcode:</span>
                      <strong className="text-navy-700">{s.mpesaConfig?.shortcode || 'Not configured'}</strong>
                    </div>
                  </div>

                  <div className="pt-1 flex items-center justify-between text-xs font-bold text-slate-600">
                    <span className="text-[11px] text-slate-400">Registered branch</span>
                    {can(currentUser, 'org:config') && <button className="text-brand-700 hover:underline">Branch Config →</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Staff & Invitations */}
      {activeTab === 'STAFF' && visibleTabs.some((t) => t.id === 'STAFF') && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Staff Directory & RBAC</h3>
              <p className="text-xs text-slate-500">Manage branch managers, stock controllers, pickers, exit staff, and invite new members.</p>
            </div>
            {canInviteStaff && <button
              onClick={() => setInviteModalOpen(true)}
              className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-brand-700 flex items-center space-x-1.5 self-start"
            >
              <Plus className="w-4 h-4" />
              <span>Invite New Staff</span>
            </button>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 uppercase font-black text-[10px]">
                  <th className="py-3 px-3">Staff Member</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Branch Location</th>
                  <th className="py-3 px-3">Trust Rating</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orgStaff.map((member, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-3">
                      <div className="font-bold text-navy-800">{member.name}</div>
                      <div className="text-[11px] text-slate-400">{member.phone || member.email}</div>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-navy-700 border border-slate-200">
                        {member.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-slate-600 font-medium">{member.branch || currentStore.name}</td>
                    <td className="py-3.5 px-3">
                      <span className="text-brand-700 font-bold">100% Clean</span>
                      <span className="text-slate-400 text-[11px] block">{member.cleanTrips || 0} shifts verified</span>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-brand-100 text-brand-800">
                        {member.status || 'ACTIVE'}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-right space-x-2">
                      {can(currentUser, 'staff:manage') && <><button className="text-azure-600 hover:underline font-bold">Edit</button>
                      <button className="text-rose-600 hover:underline font-bold">Revoke</button></>}
                    </td>
                  </tr>
                ))}
                {orgStaff.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-slate-500">No staff are registered at this branch yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Staff and roles across every branch (stock controllers and all other branch roles) */}
      {activeTab === 'STAFF' && visibleTabs.some((t) => t.id === 'STAFF') && <BranchRoleDirectory />}

      {/* Tab 3: Catalogue & Pricing Policy */}
      {activeTab === 'CATALOGUE_POLICY' && visibleTabs.some((t) => t.id === 'CATALOGUE_POLICY') && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
          <div>
            <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Organization Catalogue & Pricing Policy</h3>
            <p className="text-xs text-slate-500">Configure central pricing rules, markups, and authorization thresholds for store branches.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-slate-200 rounded-2xl p-5 space-y-4">
              <h4 className="font-bold text-navy-800 text-sm flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-brand-600" />
                <span>Central Pricing Authority</span>
              </h4>
              <p className="text-xs text-slate-500">
                Determine whether branch managers can adjust prices locally, or if all price changes require central Org Admin approval.
              </p>
              <div className="space-y-2 pt-2 text-xs">
                <label className="flex items-center space-x-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
                  <input type="radio" name="pricingAuth" defaultChecked className="text-brand-600" />
                  <div>
                    <strong className="text-navy-700 block">Server-Authoritative Central Pricing</strong>
                    <span className="text-slate-500 text-[11px]">Branches inherit headquarter prices; price modifications generate approval tickets.</span>
                  </div>
                </label>
                <label className="flex items-center space-x-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer">
                  <input type="radio" name="pricingAuth" className="text-brand-600" />
                  <div>
                    <strong className="text-navy-700 block">Autonomous Branch Pricing</strong>
                    <span className="text-slate-500 text-[11px]">Branch managers can adjust prices up to 10% without headquarter sign-off.</span>
                  </div>
                </label>
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl p-5 space-y-4">
              <h4 className="font-bold text-navy-800 text-sm flex items-center space-x-2">
                <Shield className="w-4 h-4 text-azure-600" />
                <span>Substitution & Cold Chain Policy</span>
              </h4>
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <strong className="text-navy-700 block">Auto-Substitution Price Cap</strong>
                    <span className="text-slate-500 text-[11px]">Allow pickers to substitute within price difference threshold</span>
                  </div>
                  <span className="font-bold text-navy-800">KES 50.00</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <strong className="text-navy-700 block">Produce Scale Tolerance Limit</strong>
                    <span className="text-slate-500 text-[11px]">Variance allowed for weight-based produce checks</span>
                  </div>
                  <span className="font-bold text-navy-800">± 5%</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <strong className="text-navy-700 block">Mandatory Package Tamper Seals</strong>
                    <span className="text-slate-500 text-[11px]">Require single-use serialized seals on Shop & Collect bags</span>
                  </div>
                  <span className="text-brand-700 font-bold">ENABLED</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Subscription & Billing */}
      {activeTab === 'BILLING' && visibleTabs.some((t) => t.id === 'BILLING') && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Subscription & Billing</h3>
              <p className="text-xs text-slate-500">Plan details, usage limits, invoices, and payment method.</p>
            </div>
            <span className="px-3 py-1 bg-brand-100 text-brand-800 rounded-full text-xs font-black uppercase">
              Plan: Enterprise Supermarket
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-slate-200 rounded-2xl p-5 space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Monthly Subscription</span>
              <p className="text-2xl font-black text-navy-800">{formatKes(7500000)}</p>
              <span className="text-[11px] text-slate-500">Renews on 1st of next month via M-Pesa B2B</span>
            </div>
            <div className="border border-slate-200 rounded-2xl p-5 space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Stores Allowed</span>
              <p className="text-2xl font-black text-brand-600">{stores.length} / 25 Stores</p>
              <span className="text-[11px] text-slate-500">Unlimited exit lanes and checkout registers</span>
            </div>
            <div className="border border-slate-200 rounded-2xl p-5 space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase">Platform Fee</span>
              <p className="text-2xl font-black text-azure-600">0.5%</p>
              <span className="text-[11px] text-slate-500">On gross Scan & Go checkout GMV</span>
            </div>
          </div>

          <div className="border border-slate-200 rounded-2xl p-5 space-y-3">
            <h4 className="font-bold text-navy-800 text-sm">Recent Billing Statements</h4>
            <div className="divide-y divide-slate-100 text-xs">
              {[
                { inv: 'INV-2026-003', period: 'October 2026', amount: 7500000, status: 'PAID' },
                { inv: 'INV-2026-002', period: 'September 2026', amount: 7500000, status: 'PAID' },
                { inv: 'INV-2026-001', period: 'August 2026', amount: 7500000, status: 'PAID' },
              ].map((item, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between">
                  <div>
                    <strong className="text-navy-700">{item.inv}</strong>
                    <span className="text-slate-400 ml-2">({item.period})</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="font-bold text-navy-800">{formatKes(item.amount)}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-brand-100 text-brand-800">
                      {item.status}
                    </span>
                    {can(currentUser, 'finance:invoices:read') && <button className="text-azure-600 hover:underline font-bold flex items-center space-x-1">
                      <Download className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Org-Wide Reports */}
      {activeTab === 'REPORTS' && visibleTabs.some((t) => t.id === 'REPORTS') && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Org-Wide Operational Analytics</h3>
              <p className="text-xs text-slate-500">Consolidated figures for revenue, shrinkage rate, order completion, and peak checkout traffic.</p>
            </div>
            <div className="flex items-center space-x-2">
              <select
                value={reportRange}
                onChange={(e) => setReportRange(e.target.value)}
                className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 font-bold text-slate-700"
              >
                <option>Today</option>
                <option>This Week</option>
                <option>This Month</option>
                <option>Year to Date</option>
              </select>
              {can(currentUser, 'reports:export') && <button className="px-3.5 py-2 bg-navy-800 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-xs">
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Consolidated GMV</span>
              <p className="text-xl font-black text-navy-800 mt-1">{formatKes(148500000)}</p>
              <span className="text-[11px] text-brand-600 font-bold">↑ 14.2% vs last month</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Total Shopper Trips</span>
              <p className="text-xl font-black text-navy-800 mt-1">12,480</p>
              <span className="text-[11px] text-slate-500">Scan & Go: 68% • Pickup: 32%</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Shrinkage / Discrepancy Rate</span>
              <p className="text-xl font-black text-brand-600 mt-1">0.12%</p>
              <span className="text-[11px] text-slate-500">KES 178,000 resolved</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Average Queue Exit Time</span>
              <p className="text-xl font-black text-azure-600 mt-1">18.4s</p>
              <span className="text-[11px] text-slate-500">Green lane verification</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Settings */}
      {activeTab === 'SETTINGS' && visibleTabs.some((t) => t.id === 'SETTINGS') && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
          <div>
            <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Supermarket Brand & Org Profile</h3>
            <p className="text-xs text-slate-500">Configure corporate identity, primary contact details, and feature toggles.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Supermarket / Brand Name</label>
                <input
                  type="text"
                  placeholder="Registered supermarket name"
                  className="w-full text-xs border border-slate-200 rounded-xl p-3 focus:outline-brand-500 font-semibold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Corporate Support Email</label>
                <input
                  type="email"
                  placeholder="operations@yourstore.co.ke"
                  className="w-full text-xs border border-slate-200 rounded-xl p-3 focus:outline-brand-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Corporate Customer Helpline</label>
                <input
                  type="text"
                  defaultValue="+254 700 000 111"
                  className="w-full text-xs border border-slate-200 rounded-xl p-3 focus:outline-brand-500"
                />
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl p-5 space-y-4">
              <h4 className="font-bold text-navy-800 text-sm">Feature Activation</h4>
              <div className="space-y-3 text-xs">
                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer">
                  <div>
                    <strong className="text-navy-700 block">Scan & Go Customer Self-Checkout</strong>
                    <span className="text-slate-500 text-[11px]">Enable mobile barcode scan in aisles</span>
                  </div>
                  <input type="checkbox" defaultChecked className="w-4 h-4 text-brand-600 rounded" />
                </label>
                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer">
                  <div>
                    <strong className="text-navy-700 block">Shop & Collect Pickup Slots</strong>
                    <span className="text-slate-500 text-[11px]">Enable order picking, packing & scheduled pickup</span>
                  </div>
                  <input type="checkbox" defaultChecked className="w-4 h-4 text-brand-600 rounded" />
                </label>
                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer">
                  <div>
                    <strong className="text-navy-700 block">M-Pesa STK Push Express</strong>
                    <span className="text-slate-500 text-[11px]">Seamless mobile payment on checkout</span>
                  </div>
                  <input type="checkbox" defaultChecked className="w-4 h-4 text-brand-600 rounded" />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 bg-navy-800/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-navy-800 text-base">Invite Staff Member</h3>
              <button onClick={() => setInviteModalOpen(false)} className="text-slate-400 hover:text-slate-700 text-lg">
                ×
              </button>
            </div>

            <form onSubmit={handleSendInvite} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="Staff member's full name"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-3 focus:outline-brand-500"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Phone Number (M-Pesa registered)</label>
                <input
                  type="text"
                  placeholder="Enter staff phone number"
                  value={invitePhone}
                  onChange={(e) => setInvitePhone(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-3 focus:outline-brand-500"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="staff@yourstore.co.ke"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-3 focus:outline-brand-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Assigned Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-3 bg-white font-semibold text-navy-700"
                >
                  <option value="BRANCH_MANAGER">Branch Manager</option>
                  <option value="STOCK_CONTROLLER">Stock Controller</option>
                  <option value="SUPERVISOR">Store Floor Supervisor</option>
                  <option value="PICKER">Order Picker</option>
                  <option value="PACKER_VERIFIER">Packer Verifier</option>
                  <option value="EXIT_OFFICER">Exit Gate Officer</option>
                  <option value="CASHIER_CUSTOMER_SERVICE">Cashier / Helpdesk</option>
                  <option value="DELIVERY_COLLECTION_HANDOVER">Collection Handover Desk</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Target Branch Location</label>
                <select
                  value={inviteStoreId}
                  onChange={(e) => setInviteStoreId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-3 bg-white font-semibold text-navy-700"
                >
                  {stores.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2.5 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 shadow-xs"
                >
                  {loading ? 'Sending...' : 'Send Single-Use Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Store Modal */}
      {newStoreModalOpen && (
        <div className="fixed inset-0 bg-navy-800/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-navy-800 text-base">Add New Store Branch</h3>
              <button onClick={() => setNewStoreModalOpen(false)} className="text-slate-400 hover:text-slate-700 text-lg">
                ×
              </button>
            </div>

            <form onSubmit={handleCreateStore} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Branch Name</label>
                <input
                  type="text"
                  placeholder="e.g. Machakos Town Branch"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-3 focus:outline-brand-500 font-medium"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Branch Code</label>
                <input
                  type="text"
                  placeholder="e.g. TM-WESTLANDS"
                  value={storeCode}
                  onChange={(e) => setStoreCode(e.target.value.toUpperCase())}
                  className="w-full border border-slate-200 rounded-xl p-3 focus:outline-brand-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Physical Location</label>
                <input
                  type="text"
                  placeholder="e.g. Sarit Centre Ground Floor, Nairobi"
                  value={storeLocation}
                  onChange={(e) => setStoreLocation(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-3 focus:outline-brand-500"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setNewStoreModalOpen(false)}
                  className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2.5 bg-navy-800 text-white rounded-xl font-bold hover:bg-navy-700 shadow-xs"
                >
                  {loading ? 'Creating...' : 'Provision Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
