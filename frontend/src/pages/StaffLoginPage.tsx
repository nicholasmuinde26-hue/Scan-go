import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone, Lock, ArrowRight, AlertTriangle, ShieldCheck, Building2, Key } from 'lucide-react';
import { ScanGoLogo } from '../components/ScanGoLogo.js';
import { apiRequest, setToken } from '../api.js';
import { User } from '../types.js';

interface StaffLoginPageProps {
  onLoginSuccess: (user: User, token: string, allowedPortals: string[], defaultPortal: string) => void;
}

export const StaffLoginPage: React.FC<StaffLoginPageProps> = ({ onLoginSuccess }) => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [requireMfa, setRequireMfa] = useState(false);
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
          portal: 'STAFF',
          mfaCode: mfaCode.trim() || undefined,
        }),
      });

      if (res?.requireMfa) {
        setRequireMfa(true);
        setErrorMsg('Please enter the 6-digit TOTP code from your authenticator app.');
        return;
      }

      if (res?.token) {
        setToken(res.token);
        onLoginSuccess(res.user, res.token, res.allowedPortals || ['STAFF_PICKER'], res.defaultPortal || 'STAFF_PICKER');
        navigate('/app');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Staff sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-800 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-slate-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="flex justify-center mb-2">
          <ScanGoLogo size="lg" tone="onDark" />
        </div>
        <div className="inline-flex items-center space-x-1.5 bg-navy-900/40 border border-navy-500/30 text-navy-300 px-3 py-1 rounded-full text-[11px] font-bold">
          <Building2 className="w-3.5 h-3.5" />
          <span>Supermarket Staff Operations</span>
        </div>
        <h2 className="text-2xl font-black text-white tracking-tight">Supermarket Staff Login</h2>
        <p className="text-xs text-slate-400">Branch pickers, exit verification officers, supervisors & managers</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-navy-700/90 py-8 px-6 shadow-2xl rounded-3xl border border-slate-700 sm:px-10 space-y-5">
          {errorMsg && (
            <div className="bg-rose-950/60 border border-rose-800 text-rose-300 p-3.5 rounded-2xl flex items-center space-x-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Staff Phone Number</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  type="tel"
                  required
                  placeholder="07xxxxxxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-navy-800/80 border border-slate-700 rounded-xl text-xs font-semibold text-white focus:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-500/40"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-navy-800/80 border border-slate-700 rounded-xl text-xs font-semibold text-white focus:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-navy-500/40"
                />
              </div>
            </div>

            {requireMfa && (
              <div>
                <label className="text-xs font-bold text-navy-300 block mb-1">
                  Two-Factor Authenticator Code (TOTP)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-navy-400">
                    <Key className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="123456"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-navy-800/80 border border-navy-500/50 rounded-xl text-xs font-mono font-bold tracking-widest text-center text-white focus:outline-none focus:ring-2 focus:ring-navy-500"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-navy-600 hover:bg-navy-700 disabled:opacity-50 text-white font-bold py-3 rounded-2xl text-xs transition shadow-lg shadow-navy-600/30 flex items-center justify-center space-x-2"
            >
              <span>{loading ? 'Authenticating...' : requireMfa ? 'Verify & Sign In' : 'Sign In to Staff Desk'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="pt-3 border-t border-slate-700 text-center space-y-2">
            <p className="text-xs text-slate-400">
              Staff accounts are created by invitation only. Check your invitation link if you have not onboarded.
            </p>
            <p className="text-[11px] text-slate-500">
              Are you a shopper?{' '}
              <Link to="/login" className="text-brand-400 hover:underline">
                Customer Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
