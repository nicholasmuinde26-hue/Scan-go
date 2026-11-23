import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Smartphone,
  PackageCheck,
  ShieldCheck,
  LayoutDashboard,
  UserCheck,
  ShieldAlert,
  LogOut,
  MapPin,
  Building2,
  ChevronDown,
  Search,
} from 'lucide-react';
import { ScanGoLogo } from './ScanGoLogo.js';
import { Store, User } from '../types.js';

export type PortalType = 'CUSTOMER' | 'STAFF_PICKER' | 'EXIT_OFFICER' | 'SUPERVISOR' | 'ADMIN';

interface PortalSwitcherProps {
  currentPortal: PortalType;
  onSelectPortal: (portal: PortalType) => void;
  currentUser: User | null;
  currentStore: Store | null;
  stores: Store[];
  onSelectStore: (store: Store) => void | boolean;
  allowedPortals?: PortalType[];
  onLogout?: () => void;
}

export const PortalSwitcher: React.FC<PortalSwitcherProps> = ({
  currentPortal,
  onSelectPortal,
  currentUser,
  currentStore,
  stores,
  onSelectStore,
  allowedPortals = [],
  onLogout,
}) => {
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');
  const storePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!storePickerOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (storePickerRef.current && !storePickerRef.current.contains(event.target as Node)) setStorePickerOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStorePickerOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [storePickerOpen]);

  const groupedStores = useMemo(() => {
    const query = storeSearch.trim().toLowerCase();
    const groups = new Map<string, { label: string; stores: Store[] }>();
    stores.forEach((store) => {
      const label = store.organization?.name || (store.organizationId ? 'Registered supermarket' : 'Independent stores');
      const matches = !query || `${label} ${store.name} ${store.location}`.toLowerCase().includes(query);
      if (!matches) return;
      if (!groups.has(label)) groups.set(label, { label, stores: [] });
      groups.get(label)!.stores.push(store);
    });
    return [...groups.values()]
      .map((group) => ({ ...group, stores: group.stores.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [stores, storeSearch]);

  const selectedBranchLabel = currentStore?.organization?.name && currentStore.name.toLowerCase().startsWith(currentStore.organization.name.toLowerCase())
    ? currentStore.name.slice(currentStore.organization.name.length).replace(/^\s*[-–—|·:]\s*/, '').trim() || currentStore.name
    : currentStore?.name;

  const isSuperAdmin = currentUser?.role === 'SYSTEM_ADMIN';
  const isManagerOrAdmin =
    currentUser?.role === 'STORE_MANAGER' ||
    currentUser?.role === 'BRANCH_MANAGER' ||
    currentUser?.role === 'ORG_ADMIN' ||
    currentUser?.role === 'ORG_OWNER' ||
    currentUser?.role === 'GENERAL_MANAGER' ||
    currentUser?.role === 'REGION_MANAGER' ||
    currentUser?.role === 'STOCK_CONTROLLER' ||
    currentUser?.role === 'CATALOGUE_INVENTORY_MANAGER' ||
    currentUser?.role === 'LOSS_PREVENTION_MANAGER' ||
    currentUser?.role === 'ORG_AUDITOR';

  const portalDefinitions: { id: PortalType; label: string; short: string; icon: any; activeClass: string }[] = [
    {
      id: 'CUSTOMER',
      label: 'Customer App',
      short: 'Shop',
      icon: Smartphone,
      activeClass: 'bg-brand-600 text-white shadow-xs',
    },
    {
      id: 'STAFF_PICKER',
      label: 'Picker Portal',
      short: 'Picking',
      icon: PackageCheck,
      activeClass: 'bg-amber-600 text-white shadow-xs',
    },
    {
      id: 'EXIT_OFFICER',
      label: 'Exit Verification',
      short: 'Exit Lane',
      icon: ShieldCheck,
      activeClass: 'bg-azure-600 text-white shadow-xs',
    },
    {
      id: 'SUPERVISOR',
      label: 'Supervisor Desk',
      short: 'Supervisor',
      icon: ShieldAlert,
      activeClass: 'bg-azure-600 text-white shadow-xs',
    },
    {
      id: 'ADMIN',
      label: 'Admin Command',
      short: 'Admin',
      icon: LayoutDashboard,
      activeClass: 'bg-navy-800 text-white shadow-xs',
    },
  ];

  // Filter only authorized portals for the logged-in role
  const visiblePortals = portalDefinitions.filter((p) => allowedPortals.includes(p.id));

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-xs">
      <div className={`mx-auto px-4 sm:px-6 ${currentPortal === 'CUSTOMER' ? 'max-w-[1760px] lg:px-10 2xl:px-12' : 'max-w-7xl lg:px-8'}`}>
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Store Location */}
          <div className="flex min-w-0 items-center space-x-2 sm:space-x-5">
            <ScanGoLogo size={currentPortal === 'CUSTOMER' ? 'sm' : 'md'} />

            {/* If Manager/Admin: Branch Selector Dropdown. If Staff/Customer: Fixed Branch Pin */}
            {isSuperAdmin ? null : isManagerOrAdmin ? (
              <div className="hidden lg:flex items-center space-x-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-slate-500 font-medium">Branch:</span>
                <select
                  value={currentStore?._id || ''}
                  onChange={(e) => {
                    const s = stores.find((item) => item._id === e.target.value);
                    if (s) onSelectStore(s);
                  }}
                  className="bg-transparent font-semibold text-navy-700 focus:outline-none cursor-pointer"
                >
                  {stores.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : currentPortal === 'CUSTOMER' ? (
              <div className="relative" ref={storePickerRef}>
                <button
                  type="button"
                  aria-label="Choose supermarket and branch"
                  aria-expanded={storePickerOpen}
                  onClick={() => setStorePickerOpen((open) => !open)}
                  title={`${currentStore?.organization?.name || 'Choose supermarket'} · ${currentStore?.name || 'Select a branch'} · ${currentStore?.location || ''}`}
                  className="flex max-w-[min(38vw,24rem)] items-center gap-2 rounded-2xl border border-brand-200 bg-brand-50/70 px-2 py-1.5 text-left text-xs text-navy-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 sm:max-w-[min(52vw,24rem)] sm:px-3"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 shadow-sm">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="hidden truncate text-[10px] font-bold uppercase tracking-wider text-brand-800 sm:block">
                      {currentStore?.organization?.name || 'Choose supermarket'}
                    </span>
                    <span className="hidden truncate font-semibold text-navy-800 sm:block">
                      {currentStore ? `${selectedBranchLabel} · ${currentStore.location}` : 'Select a branch'}
                    </span>
                    <span className="block truncate text-[10px] font-bold text-navy-800 sm:hidden">{selectedBranchLabel || 'Choose store'}</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-navy-500 transition ${storePickerOpen ? 'rotate-180' : ''}`} />
                </button>

                {storePickerOpen && (
                  <div className="fixed left-3 right-3 top-[4.5rem] z-[70] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-[min(24rem,calc(100vw-1.5rem))]">
                    <div className="border-b border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-sm font-extrabold text-navy-800">Choose where to shop</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Select a supermarket, then pick one of its registered branches.</p>
                      <div className="relative mt-3">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          autoFocus
                          value={storeSearch}
                          onChange={(event) => setStoreSearch(event.target.value)}
                          placeholder="Search supermarket or location"
                          aria-label="Search supermarkets and branches"
                          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs text-navy-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                        />
                      </div>
                    </div>
                    <div className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
                      {groupedStores.length === 0 ? (
                        <p className="px-3 py-8 text-center text-xs text-slate-500">No registered branches match that search.</p>
                      ) : groupedStores.map((group) => (
                        <section key={group.label} className="mb-2 last:mb-0">
                          <div className="sticky top-0 flex items-center gap-2 bg-white px-2.5 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                            <Building2 className="h-3.5 w-3.5 text-brand-600" />
                            {group.label}
                            <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">{group.stores.length}</span>
                          </div>
                          {group.stores.map((store) => {
                            const selected = store._id === currentStore?._id;
                            return (
                              <button
                                type="button"
                                key={store._id}
                                onClick={() => {
                                  if (!selected && onSelectStore(store) === false) return;
                                  setStorePickerOpen(false);
                                  setStoreSearch('');
                                }}
                                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${selected ? 'bg-brand-50 ring-1 ring-inset ring-brand-200' : 'hover:bg-slate-50'}`}
                              >
                                <MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? 'text-brand-700' : 'text-slate-400'}`} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-bold text-navy-800">{store.name}</span>
                                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">{store.location}</span>
                                </span>
                                {selected && <span className="shrink-0 text-[10px] font-bold text-brand-700">Current</span>}
                              </button>
                            );
                          })}
                        </section>
                      ))}
                    </div>
                    <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
                      Prices, stock, and pickup times are set by each branch.
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden md:flex items-center space-x-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80 text-xs text-slate-600 font-medium">
                <MapPin className="w-3.5 h-3.5 text-brand-600" />
                <span>{currentStore?.name || 'Nairobi CBD Branch'}</span>
              </div>
            )}
          </div>

          {/* Role-Filtered Dedicated Standalone Dashboard Navigation */}
          {visiblePortals.length > 1 && (
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-semibold">
              {visiblePortals.map((p) => {
                const Icon = p.icon;
                const isSelected = currentPortal === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => onSelectPortal(p.id)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl transition ${
                      isSelected
                        ? p.activeClass
                        : 'text-slate-600 hover:text-navy-800 hover:bg-slate-200/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{p.label}</span>
                    <span className="sm:hidden">{p.short}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* User Profile, Role Badge & Sign Out */}
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1.5 bg-slate-50 text-slate-700 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold shadow-2xs">
              <UserCheck className="w-4 h-4 text-brand-600" />
              <span className="hidden lg:inline">{currentUser?.name?.split(' ')[0] || 'User'}</span>
              <span className="bg-brand-100 text-brand-800 text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase">
                {currentUser?.role?.replace('_', ' ')}
              </span>
            </div>

            {/* Logout button */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition border border-transparent hover:border-rose-100"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
