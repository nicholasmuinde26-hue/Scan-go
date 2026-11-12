import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Lock, ArrowRight, AlertTriangle, Key, Terminal, Sparkles } from 'lucide-react';
import { ScanGoLogo } from '../components/ScanGoLogo.js';
import { apiRequest, setToken } from '../api.js';
import { User } from '../types.js';

interface PlatformAdminLoginPageProps {
  onLoginSuccess: (user: User, token: string, allowedPortals: string[], defaultPortal: string) => void;
}

export const PlatformAdminLoginPage: React.FC<PlatformAdminLoginPageProps> = ({ onLoginSuccess }) => {
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
          portal: 'ADMIN',
          mfaCode: mfaCode.trim() || undefined,
        }),
      });

      if (res?.requireMfa) {
        setRequireMfa(true);
        setErrorMsg('Please enter your 6-digit TOTP code from your authenticator app.');
        return;
      }

      if (res?.token) {
        setToken(res.token);
        onLoginSuccess(res.user, res.token, res.allowedPortals || ['ADMIN'], res.defaultPortal || 'ADMIN');
        navigate('/app');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Platform administrator sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-mono text-slate-200">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-navy-800 border border-navy-700 text-navy-400 flex items-center justify-center mx-auto shadow-inner">
          <Terminal className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-black text-white tracking-wider uppercase">Scan & Go Platform Root</h2>
        <p className="text-[11px] text-slate-500">Platform Super-Admin & Systems Operations Console</p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-navy-950 py-8 px-6 shadow-2xl rounded-3xl border border-navy-700 sm:px-10 space-y-5">
          {errorMsg && (
            <div className="bg-rose-950/40 border border-rose-900 text-rose-300 p-3 rounded-2xl flex items-center space-x-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Root Admin Identifier / Phone</label>
              <input
                type="tel"
                required
                placeholder="07xxxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-navy-800 border border-navy-700 rounded-xl text-white font-mono focus:border-navy-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Passphrase (12+ Characters)</label>
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-navy-800 border border-navy-700 rounded-xl text-white font-mono focus:border-navy-500 focus:outline-none"
              />
            </div>

            {requireMfa && (
              <div className="p-3.5 bg-navy-800/90 border border-navy-500/40 rounded-2xl space-y-1.5">
                <label className="text-navy-300 font-bold flex items-center space-x-1.5">
                  <Key className="w-3.5 h-3.5" />
                  <span>Hardware / Authenticator TOTP Code</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="123456"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  className="w-full px-3 py-2 bg-black border border-navy-500/60 rounded-xl text-white font-mono text-center tracking-widest text-sm focus:outline-none"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-100 hover:bg-white text-navy-950 font-bold py-3 rounded-2xl transition shadow-lg flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-navy-600" />
              <span>{loading ? 'Authenticating...' : requireMfa ? 'Verify TOTP & Unlock' : 'Root Authentication'}</span>
            </button>
          </form>

          <div className="pt-3 border-t border-navy-800 text-center text-[10px] text-slate-600">
            Platform administrators are provisioned strictly via safe offline bootstrap. All login attempts are audited
            with IP and device fingerprinting.
          </div>
        </div>
      </div>
    </div>
  );
};
