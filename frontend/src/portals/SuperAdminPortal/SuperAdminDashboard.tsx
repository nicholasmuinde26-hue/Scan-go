import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Building2,
  Store as StoreIcon,
  Users,
  Headphones,
  DollarSign,
  ShieldAlert,
  FileCheck,
  Sliders,
  CheckSquare,
  Terminal,
  Activity,
  LogOut,
  Bell,
  RefreshCw,
  Sparkles,
  Shield,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';
import { apiRequest } from '../../api.js';
import { can, canAny } from '../../permissions.js';
import { User, Store } from '../../types.js';
import { SuperAdminSection, OverviewKPIs, QueueDepth, PlatformAlert, SystemHealth } from './superAdminTypes.js';

// Subsections
import { OverviewSection } from './OverviewSection.js';
import { OrganizationsSection } from './OrganizationsSection.js';
import { StoresSection } from './StoresSection.js';
import { UsersRolesSection } from './UsersRolesSection.js';
import { SupportDeskSection } from './SupportDeskSection.js';
import { FinanceSection } from './FinanceSection.js';
import { RiskFraudSection } from './RiskFraudSection.js';
import { ComplianceAuditSection } from './ComplianceAuditSection.js';
import { PlatformConfigSection } from './PlatformConfigSection.js';
import { ApprovalsInboxSection } from './ApprovalsInboxSection.js';
import { EngineeringSection } from './EngineeringSection.js';

interface SuperAdminDashboardProps {
  currentUser: User | null;
  currentStore?: Store | null;
  onRefreshStores?: () => void;
  onLogout?: () => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({
  currentUser,
  currentStore,
  onRefreshStores,
  onLogout,
}) => {
  const [activeSection, setActiveSection] = useState<SuperAdminSection>('OVERVIEW');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Live Data State
  const [kpis, setKpis] = useState<OverviewKPIs | null>(null);
  const [queueDepth, setQueueDepth] = useState<QueueDepth | null>(null);
  const [alerts, setAlerts] = useState<PlatformAlert[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [recentDiscrepancies, setRecentDiscrepancies] = useState<any[]>([]);

  // Organizations & Stores
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const ask = (path: string) => apiRequest(path).catch(() => null);
      const [ovRes, orgsRes, storesRes, setRes] = await Promise.all([
        canAny(currentUser, ['platform:overview:read', 'system:admin']) ? ask('/platform/overview') : null,
        canAny(currentUser, ['platform:orgs:read', 'system:admin']) ? ask('/platform/organizations') : null,
        canAny(currentUser, ['platform:orgs:read', 'system:admin']) ? ask('/platform/stores') : null,
        canAny(currentUser, ['platform:settings:read', 'system:admin']) ? ask('/platform/settings') : null,
      ]);

      if (ovRes?.success) {
        setKpis(ovRes.kpis);
        setQueueDepth(ovRes.queueDepth);
        setAlerts(ovRes.alerts || []);
        setSystemHealth(ovRes.systemHealth);
        setRecentDiscrepancies(ovRes.recentDiscrepancies || []);
      }

      if (orgsRes?.organizations) {
        setOrganizations(orgsRes.organizations);
      }

      if (storesRes?.stores) {
        setStores(storesRes.stores);
      }

      if (setRes?.settings) {
        setSettings(setRes.settings);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to synchronize platform data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Auto sync every 30 seconds
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, []);

  const isOwner = can(currentUser, 'system:admin');
  const sees = (perms: string[]) => isOwner || canAny(currentUser, perms);
  const allNavItems: { id: SuperAdminSection; label: string; icon: any; badge?: number; allowed: boolean }[] = [
    { id: 'OVERVIEW', label: 'Overview', icon: LayoutDashboard, allowed: sees(['platform:overview:read']) },
    { id: 'ORGANIZATIONS', label: 'Organizations', icon: Building2, badge: organizations.length, allowed: sees(['platform:orgs:read']) },
    { id: 'STORES', label: 'Stores / Branches', icon: StoreIcon, badge: stores.length, allowed: sees(['platform:orgs:read']) },
    { id: 'USERS_ROLES', label: 'Users & Roles', icon: Users, allowed: sees(['platform:admins:create']) },
    { id: 'SUPPORT_DESK', label: 'Support Desk', icon: Headphones, allowed: sees(['support:view:any']) },
    { id: 'FINANCE', label: 'Finance & Ledger', icon: DollarSign, allowed: sees(['finance:ledger:read','finance:export']) },
    { id: 'RISK_FRAUD', label: 'Risk & Fraud', icon: ShieldAlert, badge: kpis?.todayExitMismatches || undefined, allowed: sees(['fraud:view']) },
    { id: 'COMPLIANCE_AUDIT', label: 'Compliance & Audit', icon: FileCheck, allowed: sees(['compliance:read','audit:read']) },
    { id: 'PLATFORM_CONFIG', label: 'Platform Config', icon: Sliders, allowed: sees(['platform:settings:read']) },
    {
      id: 'APPROVALS_INBOX',
      label: 'Approvals Inbox',
      icon: CheckSquare,
      badge: queueDepth?.pendingApprovals || undefined,
      allowed: sees(['payouts:approve', 'platform:admins:approve']),
    },
    { id: 'ENGINEERING', label: 'Engineering View', icon: Terminal, allowed: sees(['system:health']) },
  ];
  const navItems = allNavItems.filter((n) => n.allowed);
  const sectionAllowed = navItems.some((n) => n.id === activeSection);

  // Land on the first section this person may open.
  useEffect(() => {
    if (!sectionAllowed && navItems[0]) setActiveSection(navItems[0].id);
  }, [sectionAllowed, navItems.length]);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Platform Emergency Maintenance / Announcement Top Banner if Active */}
      {settings?.announcement?.active && (
        <div
          className={`py-2 px-4 text-xs font-bold text-center flex items-center justify-center space-x-2 ${
            settings.announcement.level === 'CRITICAL'
              ? 'bg-rose-600 text-white'
              : settings.announcement.level === 'WARNING'
              ? 'bg-amber-500 text-navy-800'
              : 'bg-navy-700 text-white'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>{settings.announcement.message}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-[1600px] w-full mx-auto p-3 sm:p-6 flex-1 flex flex-col lg:flex-row gap-6">
        {/* Mobile Nav Toggle */}
        <div className="lg:hidden flex items-center justify-between bg-white p-3 rounded-2xl border shadow-xs">
          <div className="flex items-center space-x-2 font-bold text-navy-800 text-xs">
            <Shield className="w-4 h-4 text-navy-600" />
            <span>Super Admin Navigation</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-xl bg-slate-100 text-slate-700"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {/* Sidebar Navigation */}
        <aside
          className={`lg:w-64 shrink-0 bg-white border border-slate-200 rounded-3xl p-4 shadow-xs flex flex-col justify-between space-y-4 ${
            mobileMenuOpen ? 'block' : 'hidden lg:flex'
          }`}
        >
          <div className="space-y-4">
            {/* Header Badge */}
            <div className="px-3 py-2 bg-navy-800 rounded-2xl text-white space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono tracking-widest text-navy-400 font-bold uppercase">
                  Root Control
                </span>
                <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
              </div>
              <h1 className="font-black text-sm tracking-wide">Enterprise Console</h1>
              <p className="text-[10px] text-slate-400 truncate">Admin: {currentUser?.name || 'alex.kibet'}</p>
            </div>

            {/* Navigation Links */}
            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isSelected = activeSection === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveSection(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition ${
                      isSelected
                        ? 'bg-navy-600 text-white shadow-xs font-bold'
                        : 'text-slate-600 hover:text-navy-800 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </div>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isSelected ? 'bg-navy-800 text-white' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Bottom Telemetry Health Status */}
          <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-500" />
                <span>Sync: Active</span>
              </span>
              <button
                onClick={loadData}
                disabled={loading}
                className="text-navy-600 hover:text-navy-800 font-bold"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="text-[10px] text-slate-400">Scan & Go Platform v2.4</p>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0">
          {sectionAllowed && activeSection === 'OVERVIEW' && (
            <OverviewSection
              kpis={kpis}
              queueDepth={queueDepth}
              alerts={alerts}
              systemHealth={systemHealth}
              recentDiscrepancies={recentDiscrepancies}
              loading={loading}
              onRefresh={loadData}
              onNavigateSection={(sec) => setActiveSection(sec)}
            />
          )}

          {sectionAllowed && activeSection === 'ORGANIZATIONS' && (
            <OrganizationsSection organizations={organizations} onRefresh={loadData} />
          )}

          {sectionAllowed && activeSection === 'STORES' && (
            <StoresSection stores={stores} organizations={organizations} onRefresh={loadData} />
          )}

          {sectionAllowed && activeSection === 'USERS_ROLES' && (
            <UsersRolesSection organizations={organizations} stores={stores} currentUser={currentUser} />
          )}

          {sectionAllowed && activeSection === 'SUPPORT_DESK' && <SupportDeskSection />}

          {sectionAllowed && activeSection === 'FINANCE' && (
            <FinanceSection organizations={organizations} stores={stores} />
          )}

          {sectionAllowed && activeSection === 'RISK_FRAUD' && (
            <RiskFraudSection organizations={organizations} stores={stores} />
          )}

          {sectionAllowed && activeSection === 'COMPLIANCE_AUDIT' && <ComplianceAuditSection />}

          {sectionAllowed && activeSection === 'PLATFORM_CONFIG' && (
            <PlatformConfigSection settings={settings} onRefresh={loadData} />
          )}

          {sectionAllowed && activeSection === 'APPROVALS_INBOX' && <ApprovalsInboxSection currentUser={currentUser} />}

          {sectionAllowed && activeSection === 'ENGINEERING' && <EngineeringSection />}
        </main>
      </div>
    </div>
  );
};
