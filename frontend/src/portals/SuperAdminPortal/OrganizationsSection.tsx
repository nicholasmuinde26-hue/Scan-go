import React, { useState } from 'react';
import {
  Building2,
  Plus,
  Power,
  Store as StoreIcon,
  UserPlus,
  KeyRound,
  X,
  CheckCircle2,
  AlertTriangle,
  Archive,
  Eye,
  Sliders,
  Copy,
  Check,
  Sparkles,
  Phone,
  Mail,
  ShieldCheck,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react';
import { apiRequest, formatKes } from '../../api.js';

interface OrganizationsSectionProps {
  organizations: any[];
  onRefresh: () => void;
}

export const OrganizationsSection: React.FC<OrganizationsSectionProps> = ({ organizations, onRefresh }) => {
  const [selectedOrgDrilldown, setSelectedOrgDrilldown] = useState<any | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownData, setDrilldownData] = useState<any | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    contactEmail: '',
    contactPhone: '',
    contactPerson: '',
    maxStores: 10,
    planCode: 'PRO',
    primaryColor: '#3A8F27',
    adminName: '',
    adminPhone: '',
    adminEmail: '',
  });

  const [addStoreOrg, setAddStoreOrg] = useState<any | null>(null);
  const [storeForm, setStoreForm] = useState({ name: '', code: '', location: '' });

  const [addAdminOrg, setAddAdminOrg] = useState<any | null>(null);
  const [adminForm, setAdminForm] = useState({ name: '', phone: '', email: '', role: 'ORG_ADMIN' });

  const [tempCreds, setTempCreds] = useState<{ name: string; phone: string; password: string } | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load drilldown data
  const handleOpenDrilldown = async (org: any) => {
    setSelectedOrgDrilldown(org);
    setDrilldownLoading(true);
    try {
      const res = await apiRequest(`/platform/organizations/${org._id}/drilldown`);
      if (res?.success) {
        setDrilldownData(res);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load organization details');
    } finally {
      setDrilldownLoading(false);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setErrorMsg(null);
      const res = await apiRequest('/platform/organizations', {
        method: 'POST',
        body: JSON.stringify({
          name: createForm.name.trim(),
          slug: createForm.slug.trim() || undefined,
          contactEmail: createForm.contactEmail.trim() || undefined,
          contactPhone: createForm.contactPhone.trim() || undefined,
          contactPerson: createForm.contactPerson.trim() || undefined,
          maxStores: Number(createForm.maxStores),
          planCode: createForm.planCode,
          branding: { primaryColor: createForm.primaryColor },
          admin: {
            name: createForm.adminName.trim(),
            phone: createForm.adminPhone.trim(),
            email: createForm.adminEmail.trim() || undefined,
          },
        }),
      });

      if (res.temporaryPassword) {
        setTempCreds({
          name: createForm.adminName,
          phone: createForm.adminPhone,
          password: res.temporaryPassword,
        });
      }

      setShowCreateModal(false);
      setSuccessMsg(`Supermarket workspace "${createForm.name}" created successfully!`);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create workspace');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (org: any) => {
    const nextStatus = org.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (!window.confirm(`Are you sure you want to ${nextStatus === 'ACTIVE' ? 'activate' : 'suspend'} ${org.name}?`)) {
      return;
    }
    try {
      await apiRequest(`/platform/organizations/${org._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setSuccessMsg(`Workspace ${org.name} is now ${nextStatus}.`);
      onRefresh();
      if (selectedOrgDrilldown?._id === org._id) {
        handleOpenDrilldown({ ...selectedOrgDrilldown, status: nextStatus });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update status');
    }
  };

  const handleToggleArchive = async (org: any) => {
    const isArchived = !org.isArchived;
    try {
      await apiRequest(`/platform/organizations/${org._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isArchived }),
      });
      setSuccessMsg(`Workspace ${org.name} archive status updated.`);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update archive status');
    }
  };

  const handleVerifyOrg = async (org: any) => {
    try {
      await apiRequest(`/platform/organizations/${org._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ verificationStatus: 'VERIFIED' }),
      });
      setSuccessMsg(`Workspace ${org.name} verified.`);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to verify organization');
    }
  };

  const handleResetAdminPassword = async (adminId: string, adminName: string) => {
    if (!window.confirm(`Reset password for admin ${adminName}? A new temporary passphrase will be issued.`)) return;
    try {
      const res = await apiRequest(`/platform/organizations/${selectedOrgDrilldown._id}/reset-admin-password`, {
        method: 'POST',
        body: JSON.stringify({ adminId }),
      });
      if (res?.temporaryPassword) {
        setTempCreds({
          name: adminName,
          phone: res.phone,
          password: res.temporaryPassword,
        });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to reset password');
    }
  };

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await apiRequest(`/platform/organizations/${addStoreOrg._id}/stores`, {
        method: 'POST',
        body: JSON.stringify(storeForm),
      });
      setAddStoreOrg(null);
      setStoreForm({ name: '', code: '', location: '' });
      setSuccessMsg('New store branch successfully opened!');
      onRefresh();
      if (selectedOrgDrilldown?._id === addStoreOrg._id) {
        handleOpenDrilldown(selectedOrgDrilldown);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add store');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await apiRequest(`/platform/organizations/${addAdminOrg._id}/admins`, {
        method: 'POST',
        body: JSON.stringify(adminForm),
      });
      if (res?.temporaryPassword) {
        setTempCreds({
          name: adminForm.name,
          phone: adminForm.phone,
          password: res.temporaryPassword,
        });
      }
      setAddAdminOrg(null);
      setAdminForm({ name: '', phone: '', email: '', role: 'ORG_ADMIN' });
      setSuccessMsg(adminForm.role === 'ORG_OWNER' ? 'Supermarket owner appointed successfully!' : 'Supermarket admin appointed successfully!');
      onRefresh();
      if (selectedOrgDrilldown?._id === addAdminOrg._id) {
        handleOpenDrilldown(selectedOrgDrilldown);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add admin');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alerts */}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-brand-50 border border-brand-200 text-brand-700 rounded-xl text-xs flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Credential Reveal Modal */}
      {tempCreds && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1 text-xs text-amber-950">
            <p className="font-bold text-amber-900 flex items-center space-x-1.5 text-sm">
              <KeyRound className="w-4 h-4 text-amber-700" />
              <span>One-Time Admin Access Credentials</span>
            </p>
            <p>
              Admin: <span className="font-bold">{tempCreds.name}</span> | Phone (Login ID):{' '}
              <span className="font-mono font-bold">{tempCreds.phone}</span>
            </p>
            <p className="font-mono text-xs bg-amber-100/80 px-2 py-1 rounded inline-block">
              Passphrase: <span className="font-bold text-amber-950">{tempCreds.password}</span>
            </p>
            <p className="text-[11px] text-amber-800">
              Mandatory password reset and TOTP MFA setup will occur upon initial login.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  `Scan & Go Admin Login:\nPhone: ${tempCreds.phone}\nTemporary Passphrase: ${tempCreds.password}`
                );
                setCopiedPass(true);
                setTimeout(() => setCopiedPass(false), 2500);
              }}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 transition"
            >
              {copiedPass ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedPass ? 'Copied!' : 'Copy Credentials'}</span>
            </button>
            <button
              onClick={() => setTempCreds(null)}
              className="p-1.5 text-amber-700 hover:bg-amber-200/60 rounded-xl"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Drilldown View if Selected */}
      {selectedOrgDrilldown ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <button
              onClick={() => {
                setSelectedOrgDrilldown(null);
                setDrilldownData(null);
              }}
              className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-600 hover:text-navy-800"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to All Workspaces</span>
            </button>

            <div className="flex items-center space-x-2">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  selectedOrgDrilldown.status === 'ACTIVE'
                    ? 'bg-brand-100 text-brand-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {selectedOrgDrilldown.status}
              </span>
              <button
                onClick={() => handleToggleStatus(selectedOrgDrilldown)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  selectedOrgDrilldown.status === 'ACTIVE'
                    ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                    : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                }`}
              >
                {selectedOrgDrilldown.status === 'ACTIVE' ? 'Suspend Workspace' : 'Reactivate Workspace'}
              </button>
            </div>
          </div>

          {drilldownLoading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading workspace drill-down details...</div>
          ) : drilldownData ? (
            <div className="space-y-6">
              {/* Org Header Card */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-4">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-xs"
                      style={{ backgroundColor: selectedOrgDrilldown.branding?.primaryColor || '#3A8F27' }}
                    >
                      {selectedOrgDrilldown.name.charAt(0)}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-navy-800">{selectedOrgDrilldown.name}</h2>
                      <p className="text-xs text-slate-400 font-mono">slug: {selectedOrgDrilldown.slug}</p>
                    </div>
                  </div>

                  <div className="text-right text-xs">
                    <span className="font-semibold text-slate-500">Plan: </span>
                    <span className="font-bold text-navy-700 bg-navy-50 px-2 py-0.5 rounded-full">
                      {drilldownData.organization.plan?.name || 'Enterprise'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Primary Contact</span>
                    <span className="font-bold text-navy-700">
                      {selectedOrgDrilldown.contactPerson || selectedOrgDrilldown.contactEmail || 'operations@supermarket.co.ke'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Branches</span>
                    <span className="font-bold text-navy-700">{drilldownData.metrics?.storeCount || 0} stores</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Total GMV</span>
                    <span className="font-bold text-brand-600">
                      {formatKes(drilldownData.metrics?.totalGmvMinor || 0)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Exit Discrepancies</span>
                    <span className="font-bold text-amber-600">{drilldownData.metrics?.discrepanciesCount || 0} cases</span>
                  </div>
                </div>
              </div>

              {/* Stores & Admins Tabs */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Branches under Org */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-navy-800 flex items-center space-x-2">
                      <StoreIcon className="w-4 h-4 text-brand-600" />
                      <span>Branches & Stores ({drilldownData.stores?.length || 0})</span>
                    </h3>
                    <button
                      onClick={() => setAddStoreOrg(selectedOrgDrilldown)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Branch</span>
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-80 overflow-y-auto">
                    {(drilldownData.stores || []).map((store: any) => (
                      <div
                        key={store._id}
                        className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-bold text-navy-800">{store.name}</p>
                          <p className="text-[11px] text-slate-500 font-mono">Code: {store.code} | {store.location}</p>
                        </div>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            store.active ? 'bg-brand-100 text-brand-800' : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {store.active ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </div>
                    ))}
                    {drilldownData.stores?.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-4">No branches opened yet.</p>
                    )}
                  </div>
                </div>

                {/* Admins under Org */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-navy-800 flex items-center space-x-2">
                      <UserPlus className="w-4 h-4 text-navy-600" />
                      <span>Appointed Admins ({drilldownData.admins?.length || 0})</span>
                    </h3>
                    <button
                      onClick={() => setAddAdminOrg(selectedOrgDrilldown)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-navy-50 text-navy-700 hover:bg-navy-100"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Appoint Admin</span>
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-80 overflow-y-auto">
                    {(drilldownData.admins || []).map((admin: any) => (
                      <div
                        key={admin._id}
                        className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-bold text-navy-800">{admin.name}</p>
                          <p className="text-[11px] text-slate-500 font-mono">Phone: {admin.phone}</p>
                        </div>
                        <button
                          onClick={() => handleResetAdminPassword(admin._id, admin.name)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/60"
                        >
                          Reset Pass
                        </button>
                      </div>
                    ))}
                    {drilldownData.admins?.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-4">No admins assigned.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        /* Workspace Cards Directory */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-navy-800">Supermarket Workspaces</h2>
              <p className="text-xs text-slate-500">
                Full lifecycle management, branding, store limits, and admin delegation
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-brand-600 text-white hover:bg-brand-700 shadow-xs transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create Supermarket Workspace</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {organizations.map((org) => (
              <div
                key={org._id}
                className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 hover:border-slate-300 transition flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-xs"
                        style={{ backgroundColor: org.branding?.primaryColor || '#3A8F27' }}
                      >
                        {org.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-navy-800 text-sm">{org.name}</h3>
                        <p className="text-[11px] text-slate-400 font-mono">{org.slug}</p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        org.status === 'ACTIVE'
                          ? 'bg-brand-100 text-brand-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {org.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Branches</span>
                      <span className="font-bold text-navy-700">{org.storeCount || 0} / {org.maxStores || 10}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Admins</span>
                      <span className="font-bold text-navy-700">{org.adminCount || 0} appointed</span>
                    </div>
                  </div>

                  {org.verificationStatus !== 'VERIFIED' && (
                    <div className="flex items-center justify-between text-xs bg-amber-50 p-2 rounded-xl text-amber-800 border border-amber-200">
                      <span>Verification Pending</span>
                      <button
                        onClick={() => handleVerifyOrg(org)}
                        className="px-2 py-0.5 rounded bg-amber-600 text-white text-[10px] font-bold"
                      >
                        Verify Now
                      </button>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <button
                    onClick={() => handleOpenDrilldown(org)}
                    className="inline-flex items-center space-x-1 text-xs font-bold text-navy-600 hover:text-navy-700"
                  >
                    <span>View Workspace</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setAddStoreOrg(org)}
                      title="Add branch store"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-navy-800 hover:bg-slate-100"
                    >
                      <StoreIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setAddAdminOrg(org)}
                      title="Appoint admin"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-navy-800 hover:bg-slate-100"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleToggleStatus(org)}
                      title={org.status === 'ACTIVE' ? 'Suspend workspace' : 'Activate workspace'}
                      className={`p-1.5 rounded-lg ${
                        org.status === 'ACTIVE' ? 'text-rose-500 hover:bg-rose-50' : 'text-brand-500 hover:bg-brand-50'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleToggleArchive(org)}
                      title={org.isArchived ? 'Unarchive' : 'Archive workspace'}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Create Workspace */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-navy-800">Create Supermarket Workspace</h3>
              <button onClick={() => setShowCreateModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>

            <form onSubmit={handleCreateOrg} className="space-y-4 text-xs">
              <div className="space-y-3">
                <p className="font-bold text-slate-700">1. Organization Details</p>
                <div>
                  <label className="text-slate-500 block mb-1">Company / Supermarket Name *</label>
                  <input
                    required
                    placeholder="e.g. QuickMart Supermarkets"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-500 block mb-1">Contact Email</label>
                    <input
                      type="email"
                      placeholder="hq@supermarket.co.ke"
                      value={createForm.contactEmail}
                      onChange={(e) => setCreateForm({ ...createForm, contactEmail: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1">Contact Phone</label>
                    <input
                      placeholder="0712345678"
                      value={createForm.contactPhone}
                      onChange={(e) => setCreateForm({ ...createForm, contactPhone: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-500 block mb-1">Max Branches Limit</label>
                    <input
                      type="number"
                      min={1}
                      value={createForm.maxStores}
                      onChange={(e) => setCreateForm({ ...createForm, maxStores: Number(e.target.value) })}
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1">Subscription Plan</label>
                    <select
                      value={createForm.planCode}
                      onChange={(e) => setCreateForm({ ...createForm, planCode: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl bg-white"
                    >
                      <option value="FREE">Free Tier</option>
                      <option value="BASIC">Basic Growth</option>
                      <option value="PRO">Pro Supermarket</option>
                      <option value="ENTERPRISE">Enterprise Cloud</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t">
                <p className="font-bold text-slate-700">2. Primary Supermarket Admin</p>
                <div>
                  <label className="text-slate-500 block mb-1">Admin Full Name *</label>
                  <input
                    required
                    placeholder="e.g. Samuel Karanja"
                    value={createForm.adminName}
                    onChange={(e) => setCreateForm({ ...createForm, adminName: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-500 block mb-1">Phone Number (Login ID) *</label>
                    <input
                      required
                      placeholder="07xxxxxxxx"
                      value={createForm.adminPhone}
                      onChange={(e) => setCreateForm({ ...createForm, adminPhone: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-1">Admin Email (Optional)</label>
                    <input
                      type="email"
                      placeholder="admin@supermarket.co.ke"
                      value={createForm.adminEmail}
                      onChange={(e) => setCreateForm({ ...createForm, adminEmail: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700"
                >
                  {submitting ? 'Creating...' : 'Create Workspace & Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Store */}
      {addStoreOrg && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-navy-800">Add Branch to {addStoreOrg.name}</h3>
              <button onClick={() => setAddStoreOrg(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleAddStore} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-500 block mb-1">Branch Store Name *</label>
                <input
                  required
                  placeholder="e.g. Sarit Centre Branch"
                  value={storeForm.name}
                  onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Store Code (Unique) *</label>
                <input
                  required
                  placeholder="e.g. QCK-SARIT-01"
                  value={storeForm.code}
                  onChange={(e) => setStoreForm({ ...storeForm, code: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Physical Location *</label>
                <input
                  required
                  placeholder="Westlands, Nairobi"
                  value={storeForm.location}
                  onChange={(e) => setStoreForm({ ...storeForm, location: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>
              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setAddStoreOrg(null)}
                  className="px-3 py-1.5 rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700"
                >
                  {submitting ? 'Adding...' : 'Add Branch Store'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Admin */}
      {addAdminOrg && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-navy-800">Appoint Admin to {addAdminOrg.name}</h3>
              <button onClick={() => setAddAdminOrg(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleAddAdmin} className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Role</label>
                <select
                  value={adminForm.role}
                  onChange={(e) => setAdminForm({ ...adminForm, role: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                >
                  <option value="ORG_ADMIN">Organization Admin</option>
                  <option value="ORG_OWNER">Organization Owner</option>
                </select>
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Admin Full Name *</label>
                <input
                  required
                  placeholder="Full Name"
                  value={adminForm.name}
                  onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Phone (Login Identifier) *</label>
                <input
                  required
                  placeholder="07xxxxxxxx"
                  value={adminForm.phone}
                  onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="admin@supermarket.co.ke"
                  value={adminForm.email}
                  onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>
              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setAddAdminOrg(null)}
                  className="px-3 py-1.5 rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-xl bg-navy-600 text-white font-semibold hover:bg-navy-700"
                >
                  {submitting ? 'Appointing...' : 'Appoint Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
