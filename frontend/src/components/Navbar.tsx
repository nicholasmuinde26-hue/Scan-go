import React from 'react';
import { ShoppingBag, Scan, ShieldCheck, ClipboardList, BarChart3, Store as StoreIcon, UserCheck } from 'lucide-react';
import { User, Store } from '../types.js';

interface NavbarProps {
  currentUser: User | null;
  currentStore: Store | null;
  stores: Store[];
  onSelectStore: (store: Store) => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onOpenPersonaModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  currentStore,
  stores,
  onSelectStore,
  activeTab,
  onSelectTab,
  onOpenPersonaModal,
}) => {
  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'CUSTOMER':
        return <span className="bg-brand-500/20 text-brand-400 border border-brand-500/30 px-2 py-0.5 rounded text-xs font-semibold">Customer</span>;
      case 'PICKER':
        return <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-xs font-semibold">Picker</span>;
      case 'EXIT_STAFF':
        return <span className="bg-azure-500/20 text-azure-400 border border-azure-500/30 px-2 py-0.5 rounded text-xs font-semibold">Exit Officer</span>;
      case 'SUPERVISOR':
        return <span className="bg-navy-500/20 text-navy-400 border border-navy-500/30 px-2 py-0.5 rounded text-xs font-semibold">Supervisor</span>;
      case 'STORE_MANAGER':
      case 'SYSTEM_ADMIN':
        return <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded text-xs font-semibold">Manager</span>;
      default:
        return null;
    }
  };

  return (
    <header className="bg-navy-700/90 backdrop-blur border-b border-slate-700/80 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Scan className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-white tracking-tight">Smart Scan & Go</span>
                <span className="text-[10px] bg-brand-500/20 text-brand-300 font-mono px-1.5 py-0.5 rounded border border-brand-500/30">
                  ANTI-FRAUD
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Retail Loss Prevention & Controlled Pickup</p>
            </div>
          </div>

          {/* Store Selector */}
          <div className="hidden md:flex items-center space-x-2 bg-navy-800/60 px-3 py-1.5 rounded-lg border border-slate-700">
            <StoreIcon className="w-4 h-4 text-brand-400" />
            <select
              value={currentStore?._id || ''}
              onChange={(e) => {
                const found = stores.find((s) => s._id === e.target.value);
                if (found) onSelectStore(found);
              }}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              {stores.map((s) => (
                <option key={s._id} value={s._id} className="bg-navy-700 text-slate-200">
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* User Persona & Switcher */}
          <div className="flex items-center space-x-3">
            <button
              onClick={onOpenPersonaModal}
              className="flex items-center space-x-2 bg-slate-700/60 hover:bg-slate-700 text-slate-200 hover:text-white px-3 py-1.5 rounded-lg border border-slate-600 transition text-xs font-medium shadow-sm"
              title="Switch demo persona (Customer, Picker, Exit Officer, Manager)"
            >
              <UserCheck className="w-4 h-4 text-brand-400" />
              <span className="hidden sm:inline font-semibold">{currentUser?.name?.split(' ')[0] || 'Switch User'}</span>
              {getRoleBadge(currentUser?.role)}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2 border-t border-slate-700/60 text-xs sm:text-sm no-scrollbar">
          <button
            onClick={() => onSelectTab('scan_and_go')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition whitespace-nowrap ${
              activeTab === 'scan_and_go'
                ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <Scan className="w-4 h-4" />
            <span>In-Store Scan & Go</span>
          </button>

          <button
            onClick={() => onSelectTab('click_and_collect')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition whitespace-nowrap ${
              activeTab === 'click_and_collect'
                ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Shop & Collect (Order Ahead)</span>
          </button>

          <button
            onClick={() => onSelectTab('staff_picking')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition whitespace-nowrap ${
              activeTab === 'staff_picking'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>Staff Fulfillment / Picking</span>
          </button>

          <button
            onClick={() => onSelectTab('exit_verification')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition whitespace-nowrap ${
              activeTab === 'exit_verification'
                ? 'bg-azure-600 text-white shadow-md shadow-azure-600/30'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Exit Lane Anti-Fraud</span>
          </button>

          <button
            onClick={() => onSelectTab('admin_dashboard')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium transition whitespace-nowrap ${
              activeTab === 'admin_dashboard'
                ? 'bg-navy-600 text-white shadow-md shadow-navy-600/30'
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Admin & Audit</span>
          </button>
        </div>
      </div>
    </header>
  );
};
