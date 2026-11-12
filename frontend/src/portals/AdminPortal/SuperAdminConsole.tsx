import React, { useState, useEffect } from 'react';
import {
  Building2,
  Sliders,
  Plus,
  Shield,
  ShieldCheck,
  AlertTriangle,
  Users,
  Copy,
  Check,
  X,
  Power,
  Store as StoreIcon,
  Sparkles,
  Lock,
  Mail,
  Phone,
  Settings2,
  RefreshCw,
  Percent,
  Timer,
  FileCheck,
} from 'lucide-react';
import { Organization, SystemSettings, Store } from '../../types.js';
import { apiRequest, formatKes } from '../../api.js';

interface SuperAdminConsoleProps {
  onRefreshStores?: () => void;
  activeSubView: 'WORKSPACES' | 'SYSTEM_CONFIG';
}

export const SuperAdminConsole: React.FC<SuperAdminConsoleProps> = ({
  onRefreshStores,
  activeSubView,
}) => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal: Create Supermarket Workspace
  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [newOrgEmail, setNewOrgEmail] = useState('');
  const [newOrgPhone, setNewOrgPhone] = useState('');
  const [newOrgPlanCode, setNewOrgPlanCode] = useState('BASIC');
  const [subscriptionPlans, setSubscriptionPlans] = useState<Array<{ code: string; name: string; active: boolean }>>([]);
  const [adminName, setAdminName] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [submittingOrg, setSubmittingOrg] = useState(false);

  // Modal: Temporary Password Display
  const [tempPasswordModal, setTempPasswordModal] = useState<{
    open: boolean;
    adminName: string;
    phone: string;
    tempPass: string;
  } | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);

  // Modal: Manage Supermarket Admins
  const [selectedOrgForAdmins, setSelectedOrgForAdmins] = useState<Organization | null>(null);
  const [adminsList, setAdminsList] = useState<any[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [newAdminForOrgName, setNewAdminForOrgName] = useState('');
  const [newAdminForOrgPhone, setNewAdminForOrgPhone] = useState('');
  const [newAdminForOrgEmail, setNewAdminForOrgEmail] = useState('');
  const [isPromoteMode, setIsPromoteMode] = useState(false);
  const [promoteUserId, setPromoteUserId] = useState('');

  // Modal: Add Store Branch under Workspace
  const [selectedOrgForBranch, setSelectedOrgForBranch] = useState<Organization | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [branchLocation, setBranchLocation] = useState('');
  const [submittingBranch, setSubmittingBranch] = useState(false);

  // System Settings State
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [allowPublicRegistration, setAllowPublicRegistration] = useState(true);
  const [maxStoresPerOrg, setMaxStoresPerOrg] = useState(10);
  const [savingSettings, setSavingSettings] = useState(false);

  // Default fraud policy inputs
  const [defaultRandomAudit, setDefaultRandomAudit] = useState(5);
  const [defaultLargeBasketKes, setDefaultLargeBasketKes] = useState(10000);
  const [defaultMediumBasketKes, setDefaultMediumBasketKes] = useState(5000);
  const [defaultAmberTimeout, setDefaultAmberTimeout] = useState(15);

  // Fetch Workspaces
  const loadOrganizations = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [res, plansRes] = await Promise.all([
        apiRequest('/platform/organizations'),
        apiRequest('/subscriptions/plans'),
      ]);
      if (res?.organizations) {
        setOrganizations(res.organizations);
      }
      if (plansRes?.plans) {
        setSubscriptionPlans(plansRes.plans.filter((plan: any) => plan.active));
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load supermarket workspaces');
    } finally {
      setLoading(false);
    }
  };

  // Fetch System Settings
  const loadSettings = async () => {
    try {
      const res = await apiRequest('/platform/settings');
      if (res?.settings) {
        setSettings(res.settings);
        setMaintenanceMode(res.settings.maintenanceMode || false);
        setMaintenanceMessage(
          res.settings.maintenanceMessage || 'The system is under maintenance. Please try again shortly.'
        );
        setAllowPublicRegistration(res.settings.allowPublicRegistration ?? true);
        setMaxStoresPerOrg(res.settings.maxStoresPerOrg || 10);
        if (res.settings.defaultFraudConfig) {
          setDefaultRandomAudit(res.settings.defaultFraudConfig.randomAuditPercentage || 5);
          setDefaultLargeBasketKes((res.settings.defaultFraudConfig.largeBasketMinor || 1000000) / 100);
          setDefaultMediumBasketKes((res.settings.defaultFraudConfig.mediumBasketMinor || 500000) / 100);
          setDefaultAmberTimeout(res.settings.defaultFraudConfig.amberTimeoutSeconds || 15);
        }
      }
    } catch (err: any) {
      console.warn('Load settings error:', err);
    }
  };

  useEffect(() => {
    if (activeSubView === 'WORKSPACES') {
      loadOrganizations();
    } else if (activeSubView === 'SYSTEM_CONFIG') {
      loadSettings();
    }
  }, [activeSubView]);

  // Create Supermarket Workspace and initial Supermarket Admin
  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmittingOrg(true);
      setErrorMsg(null);
      const res = await apiRequest('/platform/organizations', {
        method: 'POST',
        body: JSON.stringify({
          name: newOrgName.trim(),
          slug: newOrgSlug.trim() || undefined,
          contactEmail: newOrgEmail.trim() || undefined,
          contactPhone: newOrgPhone.trim() || undefined,
          planCode: newOrgPlanCode,
          admin: {
            name: adminName.trim(),
            phone: adminPhone.trim(),
            email: adminEmail.trim() || undefined,
          },
        }),
      });

      if (res?.success) {
        setIsCreateOrgModalOpen(false);
        setNewOrgName('');
        setNewOrgSlug('');
        setNewOrgEmail('');
        setNewOrgPhone('');
        setNewOrgPlanCode('BASIC');
        setAdminName('');
        setAdminPhone('');
        setAdminEmail('');

        // Show temp password modal
        if (res.temporaryPassword) {
          setTempPasswordModal({
            open: true,
            adminName: res.admin.name,
            phone: res.admin.phone,
            tempPass: res.temporaryPassword,
          });
        }

        setSuccessMsg(`Supermarket workspace '${res.organization.name}' created with admin assigned!`);
        await loadOrganizations();
        if (onRefreshStores) onRefreshStores();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create workspace.');
    } finally {
      setSubmittingOrg(false);
    }
  };

  // Toggle Workspace Status (ACTIVE / SUSPENDED)
  const handleToggleOrgStatus = async (org: Organization) => {
    const nextStatus = org.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const confirmText =
      nextStatus === 'SUSPENDED'
        ? `Are you sure you want to SUSPEND '${org.name}'? This will disable all branches under this supermarket.`
        : `Activate '${org.name}' workspace and re-enable its branches?`;

    if (!window.confirm(confirmText)) return;

    try {
      const res = await apiRequest(`/platform/organizations/${org._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res?.success) {
        setSuccessMsg(`Workspace '${org.name}' is now ${nextStatus}.`);
        await loadOrganizations();
        if (onRefreshStores) onRefreshStores();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update workspace status.');
    }
  };

  // Open Admins Modal for an organization
  const handleOpenAdminsModal = async (org: Organization) => {
    setSelectedOrgForAdmins(org);
    setNewAdminForOrgName('');
    setNewAdminForOrgPhone('');
    setNewAdminForOrgEmail('');
    setIsPromoteMode(false);
    setPromoteUserId('');
    try {
      setLoadingAdmins(true);
      const res = await apiRequest(`/platform/organizations/${org._id}/admins`);
      if (res?.admins) {
        setAdminsList(res.admins);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load organization admins');
    } finally {
      setLoadingAdmins(false);
    }
  };

  // Assign or Create New Admin for Organization
  const handleAssignAdminToOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgForAdmins) return;

    try {
      setErrorMsg(null);
      const body = isPromoteMode
        ? { userId: promoteUserId.trim() }
        : {
            name: newAdminForOrgName.trim(),
            phone: newAdminForOrgPhone.trim(),
            email: newAdminForOrgEmail.trim() || undefined,
          };

      const res = await apiRequest(`/platform/organizations/${selectedOrgForAdmins._id}/admins`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (res?.success) {
        if (res.temporaryPassword) {
          setTempPasswordModal({
            open: true,
            adminName: res.admin.name,
            phone: res.admin.phone,
            tempPass: res.temporaryPassword,
          });
        }
        setSuccessMsg(`Assigned ${res.admin.name} as Supermarket Admin.`);
        // Reload admins
        const updated = await apiRequest(`/platform/organizations/${selectedOrgForAdmins._id}/admins`);
        if (updated?.admins) setAdminsList(updated.admins);
        loadOrganizations();
        setNewAdminForOrgName('');
        setNewAdminForOrgPhone('');
        setNewAdminForOrgEmail('');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to assign admin.');
    }
  };

  // Remove Admin from Organization
  const handleRemoveAdmin = async (userId: string, name: string) => {
    if (!selectedOrgForAdmins) return;
    if (!window.confirm(`Revoke admin privileges for ${name}?`)) return;

    try {
      const res = await apiRequest(`/platform/organizations/${selectedOrgForAdmins._id}/admins/${userId}`, {
        method: 'DELETE',
      });
      if (res?.success) {
        setSuccessMsg(`Revoked admin privileges for ${name}.`);
        const updated = await apiRequest(`/platform/organizations/${selectedOrgForAdmins._id}/admins`);
        if (updated?.admins) setAdminsList(updated.admins);
        loadOrganizations();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to remove admin.');
    }
  };

  // Create Branch under Organization
  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgForBranch) return;

    try {
      setSubmittingBranch(true);
      setErrorMsg(null);
      const res = await apiRequest(`/platform/organizations/${selectedOrgForBranch._id}/stores`, {
        method: 'POST',
        body: JSON.stringify({
          name: branchName.trim(),
          code: branchCode.trim().toUpperCase(),
          location: branchLocation.trim(),
        }),
      });

      if (res?.success) {
        setSelectedOrgForBranch(null);
        setBranchName('');
        setBranchCode('');
        setBranchLocation('');
        setSuccessMsg(`Store branch '${res.store.name}' created under ${selectedOrgForBranch.name}!`);
        await loadOrganizations();
        if (onRefreshStores) onRefreshStores();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create store branch.');
    } finally {
      setSubmittingBranch(false);
    }
  };

  // Save Platform System Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingSettings(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await apiRequest('/platform/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          maintenanceMode,
          maintenanceMessage,
          allowPublicRegistration,
          maxStoresPerOrg: Number(maxStoresPerOrg),
          defaultFraudConfig: {
            randomAuditPercentage: Number(defaultRandomAudit),
            largeBasketMinor: Number(defaultLargeBasketKes) * 100,
            mediumBasketMinor: Number(defaultMediumBasketKes) * 100,
            fullCheckBasketMinor: 1500000,
            amberTimeoutSeconds: Number(defaultAmberTimeout),
          },
        }),
      });

      if (res?.success) {
        setSettings(res.settings);
        setSuccessMsg('System configuration saved and applied globally across all supermarkets.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update system settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Alert Messages */}
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl flex items-center justify-between text-xs animate-fadeIn">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="bg-brand-50 border border-brand-200 text-brand-800 p-4 rounded-2xl flex items-center justify-between text-xs animate-fadeIn">
          <div className="flex items-center space-x-2">
            <Check className="w-4 h-4 text-brand-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-brand-500 hover:text-brand-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* VIEW 1: SUPERMARKET WORKSPACES */}
      {activeSubView === 'WORKSPACES' && (
        <div className="space-y-6">
          {/* Top Bar with Add Workspace Button */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-navy-800 text-white">
                  Super Admin
                </span>
                <h3 className="text-lg font-black text-navy-800 tracking-tight">Supermarket Workspaces</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage supermarket client organizations, assign supermarket admins, and provision store branches
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={loadOrganizations}
                disabled={loading}
                className="p-2.5 text-slate-600 hover:text-navy-800 hover:bg-slate-100 rounded-xl transition"
                title="Refresh Workspaces"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setIsCreateOrgModalOpen(true)}
                className="bg-navy-800 hover:bg-black text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md transition flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Create Supermarket Workspace</span>
              </button>
            </div>
          </div>

          {/* Workspaces Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {organizations.map((org) => {
              const isActive = org.status === 'ACTIVE';
              return (
                <div
                  key={org._id}
                  className={`bg-white border rounded-2xl p-5 shadow-xs transition flex flex-col justify-between ${
                    isActive ? 'border-slate-200 hover:border-slate-300' : 'border-rose-200 bg-rose-50/20'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700">
                        <Building2 className="w-5 h-5 text-navy-700" />
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isActive
                            ? 'bg-brand-50 text-brand-700 border-brand-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {org.status}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-black text-navy-800 text-base">{org.name}</h4>
                      <p className="text-[11px] font-mono text-slate-400">slug: {org.slug}</p>
                      {org.subscription && (
                        <p className="text-[11px] font-semibold text-navy-700 mt-1">
                          {org.subscription.planCode} · {org.subscription.status}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs py-2 border-y border-slate-100">
                      <div className="bg-slate-50 p-2.5 rounded-xl">
                        <span className="text-[10px] text-slate-400 block font-medium">Store Branches</span>
                        <span className="font-bold text-navy-700 text-sm">
                          {org.storeCount ?? 0} / {org.maxStores}
                        </span>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-xl">
                        <span className="text-[10px] text-slate-400 block font-medium">Assigned Admins</span>
                        <span className="font-bold text-navy-700 text-sm">{org.adminCount ?? 0}</span>
                      </div>
                    </div>

                    {(org.contactEmail || org.contactPhone) && (
                      <div className="space-y-1 text-[11px] text-slate-500">
                        {org.contactEmail && (
                          <div className="flex items-center space-x-1.5">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{org.contactEmail}</span>
                          </div>
                        )}
                        {org.contactPhone && (
                          <div className="flex items-center space-x-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{org.contactPhone}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Action Buttons */}
                  <div className="pt-4 mt-3 border-t border-slate-100 space-y-2">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleOpenAdminsModal(org)}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-navy-700 px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Admins ({org.adminCount ?? 0})</span>
                      </button>
                      <button
                        onClick={() => setSelectedOrgForBranch(org)}
                        className="flex-1 bg-navy-50 hover:bg-navy-100 text-navy-700 px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5"
                      >
                        <StoreIcon className="w-3.5 h-3.5" />
                        <span>+ Branch</span>
                      </button>
                    </div>

                    <button
                      onClick={() => handleToggleOrgStatus(org)}
                      className={`w-full py-1.5 rounded-xl text-[11px] font-bold transition flex items-center justify-center space-x-1.5 ${
                        isActive
                          ? 'text-rose-600 hover:bg-rose-50'
                          : 'text-brand-700 bg-brand-50 hover:bg-brand-100'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>{isActive ? 'Suspend Workspace' : 'Re-activate Workspace'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {organizations.length === 0 && !loading && (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-8">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h4 className="font-bold text-slate-700">No Supermarket Workspaces</h4>
              <p className="text-xs text-slate-400 mt-1">
                Create your first supermarket workspace to onboard a supermarket client and assign their admin.
              </p>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: SYSTEM CONFIGURATIONS */}
      {activeSubView === 'SYSTEM_CONFIG' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-navy-800 text-white">
                  Global Configuration
                </span>
                <h3 className="text-lg font-black text-navy-800 tracking-tight">System Controls & Baseline Policies</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure platform-wide security, maintenance mode, registration permissions, and baseline anti-fraud rules
              </p>
            </div>
            <button
              type="submit"
              disabled={savingSettings}
              className="bg-navy-800 hover:bg-black disabled:opacity-50 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition flex items-center space-x-2"
            >
              <Sparkles className="w-4 h-4 text-brand-400" />
              <span>{savingSettings ? 'Saving...' : 'Save Global Configurations'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Maintenance Mode & Access Gate */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center space-x-2.5 pb-3 border-b border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                  <Power className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-navy-800 text-sm">Platform Maintenance Mode</h4>
                  <p className="text-[11px] text-slate-400">Lock the customer mobile app during maintenance</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl">
                <div>
                  <span className="font-bold text-navy-700 text-xs block">Maintenance Gate</span>
                  <span className="text-[10px] text-slate-400">Only Super Admins can access when enabled</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMaintenanceMode(!maintenanceMode)}
                  className={`w-12 h-6 rounded-full transition relative ${
                    maintenanceMode ? 'bg-rose-600' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-md transition transform ${
                      maintenanceMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Maintenance Message Shown to Customers</label>
                <textarea
                  rows={2}
                  value={maintenanceMessage}
                  onChange={(e) => setMaintenanceMessage(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/30"
                  placeholder="The system is undergoing scheduled maintenance..."
                />
              </div>

              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl">
                <div>
                  <span className="font-bold text-navy-700 text-xs block">Public Customer Registration</span>
                  <span className="text-[10px] text-slate-400">Allow new shoppers to register accounts</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAllowPublicRegistration(!allowPublicRegistration)}
                  className={`w-12 h-6 rounded-full transition relative ${
                    allowPublicRegistration ? 'bg-brand-600' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow-md transition transform ${
                      allowPublicRegistration ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Max Stores Allowed Per Supermarket Workspace</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={maxStoresPerOrg}
                  onChange={(e) => setMaxStoresPerOrg(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/30"
                />
              </div>
            </div>

            {/* Global Baseline Anti-Fraud Policies */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center space-x-2.5 pb-3 border-b border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-navy-800 text-sm">Baseline Anti-Fraud Risk Engine</h4>
                  <p className="text-[11px] text-slate-400">Default policy thresholds provisioned for new supermarket branches</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="p-3 bg-slate-50 rounded-xl space-y-1.5">
                  <label className="text-xs font-bold text-navy-700 flex justify-between">
                    <span>Default Random Audit Rate:</span>
                    <span className="text-navy-600 font-mono font-black">{defaultRandomAudit}%</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={25}
                    value={defaultRandomAudit}
                    onChange={(e) => setDefaultRandomAudit(Number(e.target.value))}
                    className="w-full accent-navy-600"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl space-y-1.5">
                  <label className="text-xs font-bold text-navy-700 flex justify-between">
                    <span>Default Large Basket Limit (Forces AMBER):</span>
                    <span className="text-navy-800 font-mono font-bold">{formatKes(defaultLargeBasketKes * 100)}</span>
                  </label>
                  <input
                    type="number"
                    step={1000}
                    value={defaultLargeBasketKes}
                    onChange={(e) => setDefaultLargeBasketKes(Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono font-bold"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl space-y-1.5">
                  <label className="text-xs font-bold text-navy-700 flex justify-between">
                    <span>Default Medium Basket Limit (+10 Risk Points):</span>
                    <span className="text-navy-800 font-mono font-bold">{formatKes(defaultMediumBasketKes * 100)}</span>
                  </label>
                  <input
                    type="number"
                    step={500}
                    value={defaultMediumBasketKes}
                    onChange={(e) => setDefaultMediumBasketKes(Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono font-bold"
                  />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl space-y-1.5">
                  <label className="text-xs font-bold text-navy-700 flex justify-between">
                    <span>Staff Exit AMBER Inspection Timeout:</span>
                    <span className="text-amber-600 font-mono font-bold">{defaultAmberTimeout} seconds</span>
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={defaultAmberTimeout}
                    onChange={(e) => setDefaultAmberTimeout(Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono font-bold"
                  />
                </div>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* MODAL 1: CREATE SUPERMARKET WORKSPACE + ASSIGN SUPERMARKET ADMIN */}
      {isCreateOrgModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl space-y-5 animate-scaleUp max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-navy-50 border border-navy-200 text-navy-700 flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-navy-800">Create Supermarket Workspace</h3>
                  <p className="text-xs text-slate-500">Provision a new retail company & assign its primary admin</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateOrgModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrganization} className="space-y-4">
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">1. Workspace Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Supermarket Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. QuickMart Supermarkets"
                      value={newOrgName}
                      onChange={(e) => {
                        setNewOrgName(e.target.value);
                        if (!newOrgSlug) {
                          setNewOrgSlug(
                            e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, '-')
                              .replace(/(^-|-$)/g, '')
                          );
                        }
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Workspace Slug *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. quickmart"
                      value={newOrgSlug}
                      onChange={(e) => setNewOrgSlug(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Contact Email</label>
                    <input
                      type="email"
                      placeholder="hq@supermarket.co.ke"
                      value={newOrgEmail}
                      onChange={(e) => setNewOrgEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Contact Phone</label>
                    <input
                      type="tel"
                      placeholder="0711000111"
                      value={newOrgPhone}
                      onChange={(e) => setNewOrgPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Subscription Plan</label>
                    <select
                      value={newOrgPlanCode}
                      onChange={(e) => setNewOrgPlanCode(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/30"
                    >
                      {subscriptionPlans.length > 0 ? (
                        subscriptionPlans.map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)
                      ) : (
                        <option value="BASIC">Basic</option>
                      )}
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  2. Primary Supermarket Admin Account
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Admin Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Daniel Mutua"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Admin Phone Number *</label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 0712334455"
                      value={adminPhone}
                      onChange={(e) => setAdminPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/30"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Admin Email (Optional)</label>
                  <input
                    type="email"
                    placeholder="daniel@quickmart.co.ke"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/30"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  A secure temporary password will be generated automatically and revealed to you on the next screen.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateOrgModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:text-navy-800 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingOrg}
                  className="bg-navy-600 hover:bg-navy-700 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md transition"
                >
                  {submittingOrg ? 'Provisioning...' : 'Create Workspace & Assign Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: TEMPORARY PASSWORD DISPLAY */}
      {tempPasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-200 text-brand-600 flex items-center justify-center mx-auto">
              <KeyIcon className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-navy-800">Admin Account Credentials</h3>
              <p className="text-xs text-slate-500">
                Share these temporary credentials with <strong>{tempPasswordModal.adminName}</strong>
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Phone:</span>
                <span className="font-mono font-bold text-navy-700">{tempPasswordModal.phone}</span>
              </div>
              <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200">
                <span className="text-slate-400">Temporary Password:</span>
                <span className="font-mono font-black text-navy-700 bg-navy-50 px-2 py-0.5 rounded-lg border border-navy-200">
                  {tempPasswordModal.tempPass}
                </span>
              </div>
            </div>

            <button
              onClick={() => copyToClipboard(tempPasswordModal.tempPass)}
              className="w-full bg-navy-800 hover:bg-black text-white py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2"
            >
              {copiedPass ? <Check className="w-4 h-4 text-brand-400" /> : <Copy className="w-4 h-4" />}
              <span>{copiedPass ? 'Password Copied to Clipboard!' : 'Copy Temporary Password'}</span>
            </button>

            <button
              onClick={() => setTempPasswordModal(null)}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl text-xs font-bold transition"
            >
              Done & Close
            </button>
          </div>
        </div>
      )}

      {/* MODAL 3: MANAGE SUPERMARKET ADMINS */}
      {selectedOrgForAdmins && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-scaleUp max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-navy-800">
                  Supermarket Admins • {selectedOrgForAdmins.name}
                </h3>
                <p className="text-xs text-slate-400">Manage users authorized to administer this retail workspace</p>
              </div>
              <button
                onClick={() => setSelectedOrgForAdmins(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Existing Admins List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Current Admins</h4>
              {loadingAdmins ? (
                <div className="text-center py-4 text-xs text-slate-400">Loading admins...</div>
              ) : adminsList.length > 0 ? (
                <div className="space-y-2">
                  {adminsList.map((adm) => (
                    <div
                      key={adm._id || adm.id}
                      className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs"
                    >
                      <div>
                        <span className="font-bold text-navy-800 block">{adm.name}</span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {adm.phone} {adm.email ? `• ${adm.email}` : ''}
                        </span>
                      </div>
                      {adminsList.length > 1 && (
                        <button
                          onClick={() => handleRemoveAdmin(adm._id || adm.id, adm.name)}
                          className="text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition"
                          title="Revoke Admin"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-400 py-2">No admins assigned yet.</div>
              )}
            </div>

            {/* Assign / Create Another Admin */}
            <form onSubmit={handleAssignAdminToOrg} className="space-y-3 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-700">Add Another Supermarket Admin</h4>
                <button
                  type="button"
                  onClick={() => setIsPromoteMode(!isPromoteMode)}
                  className="text-[11px] text-navy-600 font-bold hover:underline"
                >
                  {isPromoteMode ? 'Switch to Create New Account' : 'Promote Existing Customer by ID'}
                </button>
              </div>

              {isPromoteMode ? (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Customer User ID</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter Mongo User ID"
                    value={promoteUserId}
                    onChange={(e) => setPromoteUserId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Full Name"
                    value={newAdminForOrgName}
                    onChange={(e) => setNewAdminForOrgName(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium"
                  />
                  <input
                    type="tel"
                    required
                    placeholder="Phone (07...)"
                    value={newAdminForOrgPhone}
                    onChange={(e) => setNewAdminForOrgPhone(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium"
                  />
                  <input
                    type="email"
                    placeholder="Email (Optional)"
                    value={newAdminForOrgEmail}
                    onChange={(e) => setNewAdminForOrgEmail(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium"
                  />
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-navy-600 hover:bg-navy-700 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-xs"
              >
                Assign Supermarket Admin
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: ADD STORE BRANCH UNDER WORKSPACE */}
      {selectedOrgForBranch && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-navy-800">Add Store Branch</h3>
                <p className="text-xs text-slate-400">Workspace: {selectedOrgForBranch.name}</p>
              </div>
              <button
                onClick={() => setSelectedOrgForBranch(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBranch} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Branch Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. QuickMart Kilimani Branch"
                  value={branchName}
                  onChange={(e) => {
                    setBranchName(e.target.value);
                    if (!branchCode) {
                      setBranchCode(
                        e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]+/g, '-')
                          .slice(0, 10)
                      );
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Branch Code (Unique) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. QM-KIL-01"
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Physical Location *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Argwings Kodhek Rd, Kilimani, Nairobi"
                  value={branchLocation}
                  onChange={(e) => setBranchLocation(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium"
                />
              </div>

              <p className="text-[11px] text-slate-400">
                Default checkout exit lanes and Shop & Collect pickup slots will be provisioned automatically from system settings.
              </p>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedOrgForBranch(null)}
                  className="px-3 py-2 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingBranch}
                  className="bg-navy-600 hover:bg-navy-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs transition"
                >
                  {submittingBranch ? 'Provisioning...' : 'Provision Store Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

function KeyIcon(props: any) {
  return (
    <svg
      {...props}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
      />
    </svg>
  );
}
