import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone, Lock, ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ScanGoLogo } from '../components/ScanGoLogo.js';
import { apiRequest } from '../api.js';

export const ForgotPasswordPage: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await apiRequest('/auth/otp/send', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.trim(), purpose: 'FORGOT_PASSWORD' }),
      });
      if (res?.success) {
        setOtpSent(true);
        if (res.devOtpCode) setDevOtpHint(res.devOtpCode);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send reset code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 12) {
      setErrorMsg('Password must be at least 12 characters long.');
      return;
    }
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          phone: phone.trim(),
          otp: otp.trim(),
          newPassword,
        }),
      });
      if (res?.success) {
        setSuccess(true);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Password reset failed.');
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
        <h2 className="text-2xl font-black text-navy-800 tracking-tight">Reset Password</h2>
        <p className="text-xs text-slate-500">Recover your shopper account using your M-Pesa phone number</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-xl rounded-3xl border border-slate-200 sm:px-10 space-y-5">
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-2xl flex items-center space-x-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {devOtpHint && (
            <div className="bg-brand-50 border border-brand-200 text-brand-800 p-3.5 rounded-2xl text-xs space-y-1">
              <span className="font-bold block">Development OTP Code:</span>
              <span className="font-mono font-black text-base tracking-widest">{devOtpHint}</span>
            </div>
          )}

          {success ? (
            <div className="text-center py-6 space-y-4">
              <CheckCircle2 className="w-12 h-12 text-brand-600 mx-auto" />
              <h3 className="text-base font-bold text-navy-800">Password Reset Completed</h3>
              <p className="text-xs text-slate-500">
                All existing device sessions have been revoked. You can now sign in with your new password.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-2.5 rounded-xl text-xs transition"
              >
                Sign In Now
              </button>
            </div>
          ) : !otpSent ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Phone Number</label>
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

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold py-3 rounded-2xl text-xs transition shadow-lg shadow-brand-600/20 flex items-center justify-center space-x-2"
              >
                <span>{loading ? 'Sending OTP...' : 'Send Password Reset Code'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">6-Digit Verification OTP</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold tracking-widest text-center"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">New Password (12+ Characters)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    minLength={12}
                    placeholder="Min 12 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold py-3 rounded-2xl text-xs transition shadow-lg shadow-brand-600/20 flex items-center justify-center space-x-2"
              >
                <span>{loading ? 'Updating Password...' : 'Save New Password'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          <div className="pt-3 border-t border-slate-100 text-center">
            <Link to="/login" className="text-xs font-bold text-slate-600 hover:underline">
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
