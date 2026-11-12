import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Key, Lock, CheckCircle2, AlertTriangle, ArrowRight, Building2, Store } from 'lucide-react';
import { ScanGoLogo } from '../components/ScanGoLogo.js';
import { apiRequest } from '../api.js';

export const AcceptInvitePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [requiresMfaEnrollment, setRequiresMfaEnrollment] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function validateToken() {
      if (!token) return;
      try {
        setLoading(true);
        setErrorMsg(null);
        const res = await apiRequest(`/invites/validate/${token}`);
        if (res?.invite) {
          setInvite(res.invite);
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Invitation is invalid or has expired.');
      } finally {
        setLoading(false);
      }
    }
    validateToken();
  }, [token]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (password.length < 12) {
      setErrorMsg('Password must be at least 12 characters long.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);
      const res = await apiRequest(`/invites/accept/${token}`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      if (res?.success) {
        setAccepted(true);
        setRequiresMfaEnrollment(res.requiresMfaEnrollment || false);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to accept invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-azure-50 to-brand-50 flex items-center justify-center p-4">
        <div className="text-xs font-bold text-slate-500 animate-pulse">Validating single-use invitation...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-azure-50 to-brand-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="flex justify-center mb-2">
          <ScanGoLogo size="lg" />
        </div>
        <h2 className="text-2xl font-black text-navy-800 tracking-tight">Onboard Supermarket Staff</h2>
        <p className="text-xs text-slate-500">Set your password to activate your verified account</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-xl rounded-3xl border border-slate-200 sm:px-10 space-y-5">
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-2xl flex items-center space-x-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {accepted ? (
            <div className="text-center py-6 space-y-4">
              <CheckCircle2 className="w-14 h-14 text-brand-600 mx-auto" />
              <h3 className="text-lg font-bold text-navy-800">Account Activated Successfully!</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Your role ({invite?.role}) is now active.
                {requiresMfaEnrollment && ' Two-factor authentication (TOTP) is required for your role.'}
              </p>
              <button
                onClick={() => navigate('/staff')}
                className="w-full bg-navy-800 hover:bg-black text-white font-bold py-3 rounded-2xl text-xs transition shadow-md flex items-center justify-center space-x-2"
              >
                <span>Proceed to Staff Login</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : invite ? (
            <form onSubmit={handleAccept} className="space-y-4">
              {/* Scope Card */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Invitee:</span>
                  <span className="font-bold text-navy-700">{invite.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Phone:</span>
                  <span className="font-mono font-bold text-navy-700">{invite.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Assigned Role:</span>
                  <span className="font-bold text-navy-700 bg-navy-50 px-2 py-0.5 rounded-lg border border-navy-200">
                    {invite.role}
                  </span>
                </div>
                {invite.organization && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Supermarket:</span>
                    <span className="font-bold text-navy-700">{invite.organization.name}</span>
                  </div>
                )}
                {invite.store && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Branch:</span>
                    <span className="font-bold text-navy-700">{invite.store.name}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Set Password (12+ Characters) *</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    minLength={12}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/30"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Confirm Password *</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    minLength={12}
                    placeholder="••••••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-600/30"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-navy-600 hover:bg-navy-700 disabled:opacity-50 text-white font-bold py-3 rounded-2xl text-xs transition shadow-lg shadow-navy-600/20 flex items-center justify-center space-x-2"
              >
                <span>{submitting ? 'Activating Account...' : 'Activate Staff Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="text-center py-6 space-y-3">
              <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
              <h4 className="font-bold text-navy-700">Invalid or Expired Invitation</h4>
              <p className="text-xs text-slate-400">
                This single-use invitation link is either expired (valid 48 hours) or has already been accepted.
              </p>
              <Link to="/staff" className="inline-block text-xs font-bold text-navy-600 hover:underline">
                Go to Staff Login
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
