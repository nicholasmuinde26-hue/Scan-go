import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone, Lock, ArrowRight, AlertTriangle, ShieldCheck } from 'lucide-react';
import { ScanGoLogo } from '../components/ScanGoLogo.js';
import { apiRequest, setToken } from '../api.js';
import { postLoginPath } from '../presence.js';
import { User, Store } from '../types.js';

interface CustomerLoginPageProps {
  onLoginSuccess: (user: User, token: string, allowedPortals: string[], defaultPortal: string) => void;
}

export const CustomerLoginPage: React.FC<CustomerLoginPageProps> = ({ onLoginSuccess }) => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setErrorMsg(null);

      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          phone: phone.trim(),
          password,
          portal: 'CUSTOMER',
        }),
      });

      if (res?.token) {
        setToken(res.token);
        onLoginSuccess(res.user, res.token, res.allowedPortals || ['CUSTOMER'], res.defaultPortal || 'CUSTOMER');
        navigate(postLoginPath());
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid credentials or login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-azure-50 to-brand-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="flex justify-center mb-2">
          <ScanGoLogo size="lg" />
        </div>
        <h2 className="text-2xl font-black text-navy-800 tracking-tight">Customer Sign In</h2>
        <p className="text-xs text-slate-500">Sign in to your Scan & Go shopper trolley</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-xl rounded-3xl border border-slate-200 sm:px-10 space-y-6">
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-2xl flex items-center space-x-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">M-Pesa Registered Phone Number</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  type="tel"
                  required
                  placeholder="0712345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">Password</label>
                <Link to="/forgot-password" className="text-[11px] font-bold text-brand-600 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold py-3 rounded-2xl text-xs transition shadow-lg shadow-brand-600/20 flex items-center justify-center space-x-2"
            >
              <span>{loading ? 'Signing In...' : 'Sign In as Shopper'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100 text-center space-y-3">
            <p className="text-xs text-slate-500">
              New to Scan & Go?{' '}
              <Link to="/register" className="font-bold text-brand-600 hover:underline">
                Create a Customer Account
              </Link>
            </p>
            <p className="text-[11px] text-slate-400">
              Are you supermarket staff?{' '}
              <Link to="/staff" className="font-bold text-slate-700 hover:underline">
                Staff Portal Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
