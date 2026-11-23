import React, { useState } from 'react';
import {
  Lock,
  Phone,
  ArrowRight,
  ShieldAlert,
  UserCheck,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Award,
  PackageCheck,
  Shield,
  Building2,
  Sliders,
} from 'lucide-react';
import { ScanGoLogo } from './ScanGoLogo.js';
import { apiRequest, setToken } from '../api.js';
import { User, UserRole } from '../types.js';

interface LoginPageProps {
  onLoginSuccess: (
    user: User,
    token: string,
    allowedPortals: string[],
    defaultPortal: string,
    permissions: string[]
  ) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setErrorMessage(null);

      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, password }),
      });

      if (res?.token) {
        setToken(res.token);
        onLoginSuccess(
          res.user,
          res.token,
          res.allowedPortals || ['CUSTOMER'],
          res.defaultPortal || 'CUSTOMER',
          res.permissions || []
        );
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Quick switch for development environments
  const handleDemoLogin = async (role: UserRole) => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const res = await apiRequest('/auth/demo-switch', {
        method: 'POST',
        body: JSON.stringify({ role }),
      });

      if (res?.token) {
        setToken(res.token);
        onLoginSuccess(
          res.user,
          res.token,
          res.allowedPortals || ['CUSTOMER'],
          res.defaultPortal || 'CUSTOMER',
          res.permissions || []
        );
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Demo login failed.');
    } finally {
      setLoading(false);
    }
  };

  const demoAccounts = [
    {
      role: 'CUSTOMER' as UserRole,
      title: 'John Kamau',
      roleLabel: 'Customer',
      phone: '0712345678',
      desc: 'Scan & Go shopping, loyalty points, order tracking',
      icon: Award,
      badgeColor: 'bg-brand-100 text-brand-800 border-brand-300',
    },
    {
      role: 'PICKER' as UserRole,
      title: 'Mary Wanjiku',
      roleLabel: 'Store Picker',
      phone: '0733111222',
      desc: 'Shelf picking tasks, produce weighing scale, substitutions',
      icon: PackageCheck,
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
    },
    {
      role: 'EXIT_STAFF' as UserRole,
      title: 'David Kiprop',
      roleLabel: 'Exit Officer',
      phone: '0744222333',
      desc: 'Exit lane terminal, QR audit check, gate clearance',
      icon: Shield,
      badgeColor: 'bg-azure-100 text-azure-800 border-azure-300',
    },
    {
      role: 'SUPERVISOR' as UserRole,
      title: 'Grace Muthoni',
      roleLabel: 'Supervisor',
      phone: '0755333444',
      desc: 'Cart discrepancy resolution, escalation queue, PIN override',
      icon: UserCheck,
      badgeColor: 'bg-navy-100 text-navy-800 border-navy-300',
    },
    {
      role: 'STOCK_CONTROLLER' as UserRole,
      title: 'Peter Ouma',
      roleLabel: 'Stock Manager (Naivas)',
      phone: '0777555666',
      desc: 'Receive stock, print labels, unknown barcodes & approve goods received',
      icon: PackageCheck,
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
    },
    {
      role: 'CATALOGUE_INVENTORY_MANAGER' as UserRole,
      title: 'Faith Njeri',
      roleLabel: 'Catalogue & Inventory Manager (Naivas)',
      phone: '0788666777',
      desc: 'Master product catalogue, prices, receiving approvals & promotions',
      icon: Building2,
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
    },
    {
      role: 'STORE_MANAGER' as UserRole,
      title: 'James Mwangi',
      roleLabel: 'Store Manager',
      phone: '0766444555',
      desc: 'Store KPIs, pricing & inventory, fraud detection rules',
      icon: Building2,
      badgeColor: 'bg-azure-100 text-azure-800 border-azure-300',
    },
    {
      role: 'ORG_ADMIN' as UserRole,
      title: 'Sarah Njeri',
      roleLabel: 'Supermarket Admin',
      phone: '0777000111',
      desc: 'Workspace chain admin, manages supermarket branches and store managers',
      icon: Building2,
      badgeColor: 'bg-brand-100 text-brand-800 border-brand-300',
    },
    {
      role: 'SYSTEM_ADMIN' as UserRole,
      title: 'Alex Kibet',
      roleLabel: 'Super Admin',
      phone: '0700000000',
      desc: 'Platform root admin, create supermarket workspaces, system configuration',
      icon: Sliders,
      badgeColor: 'bg-navy-800 text-white border-slate-700',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-azure-50 to-brand-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="flex justify-center mb-2">
          <ScanGoLogo size="lg" />
        </div>
        <h2 className="text-2xl font-black text-navy-800 tracking-tight">
          Welcome to Scan & Go
        </h2>
        <p className="text-xs text-slate-500">
          Sign in to access your role-specific dashboard and retail operations
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-xl rounded-3xl border border-slate-200 sm:px-10 space-y-6">
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-2xl text-xs font-semibold flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  placeholder="e.g. 0712345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-navy-800 focus:outline-none focus:border-brand-600 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-navy-800 focus:outline-none focus:border-brand-600 font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-xs transition shadow-md shadow-brand-600/20 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Role Selector in Dev Mode */}
          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Demo Quick Access
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                DEV
              </span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {demoAccounts.map((acc, idx) => {
                const Icon = acc.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleDemoLogin(acc.role)}
                    className="w-full text-left p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-2.5">
                      <div className="p-1.5 rounded-lg bg-white border border-slate-200 shadow-2xs group-hover:border-brand-400">
                        <Icon className="w-3.5 h-3.5 text-brand-600" />
                      </div>
                      <div>
                        <span className="font-bold text-xs text-navy-700 block">
                          {acc.title}
                        </span>
                        <span className="text-[10px] text-slate-400 block truncate max-w-[180px]">
                          {acc.desc}
                        </span>
                      </div>
                    </div>
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${acc.badgeColor}`}>
                      {acc.roleLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};