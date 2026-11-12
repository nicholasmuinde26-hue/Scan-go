import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone, Lock, User as UserIcon, ArrowRight, AlertTriangle, ShieldCheck, Mail, CheckCircle2 } from 'lucide-react';
import { ScanGoLogo } from '../components/ScanGoLogo.js';
import { apiRequest, setToken } from '../api.js';
import { postLoginPath } from '../presence.js';
import { User } from '../types.js';

interface CustomerRegisterPageProps {
  onLoginSuccess: (user: User, token: string, allowedPortals: string[], defaultPortal: string) => void;
}

export const CustomerRegisterPage: React.FC<CustomerRegisterPageProps> = ({ onLoginSuccess }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [termsConsent, setTermsConsent] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 10) {
      setErrorMsg('Please enter a valid Kenyan phone number (e.g. 0712345678).');
      return;
    }
    try {
      setSendingOtp(true);
      setErrorMsg(null);
      const res = await apiRequest('/auth/otp/send', {
        method: 'POST',
        body: JSON.stringify({
          phone: phone.trim(),
          purpose: 'REGISTRATION',
        }),
      });
      if (res?.success) {
        setOtpSent(true);
        if (res.devOtpCode) {
          setDevOtpHint(res.devOtpCode);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send verification OTP.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!termsConsent) {
      setErrorMsg('You must consent to the Terms of Service & Privacy Policy.');
      return;
    }
    if (password.length < 12) {
      setErrorMsg('Password must be at least 12 characters long.');
      return;
    }
    try {
      setRegistering(true);
      setErrorMsg(null);
      const res = await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          password,
          otp: otp.trim(),
          termsConsent,
        }),
      });

      if (res?.token) {
        setToken(res.token);
        onLoginSuccess(res.user, res.token, res.allowedPortals || ['CUSTOMER'], res.defaultPortal || 'CUSTOMER');
        navigate(postLoginPath());
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Registration failed.');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-azure-50 to-brand-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="flex justify-center mb-2">
          <ScanGoLogo size="lg" />
        </div>
        <h2 className="text-2xl font-black text-navy-800 tracking-tight">Create Customer Account</h2>
        <p className="text-xs text-slate-500">Scan & Go shopper registration with verified phone OTP</p>
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

          {!otpSent ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">M-Pesa Mobile Number *</label>
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
                <span className="text-[10px] text-slate-400 mt-1 block">
                  A 6-digit OTP will be sent to verify your M-Pesa phone number.
                </span>
              </div>

              <button
                type="submit"
                disabled={sendingOtp}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold py-3 rounded-2xl text-xs transition shadow-lg shadow-brand-600/20 flex items-center justify-center space-x-2"
              >
                <span>{sendingOtp ? 'Sending OTP...' : 'Send Verification OTP'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Full Legal Name *</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Kamau"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Phone Number (Verified)</label>
                <input
                  type="text"
                  disabled
                  value={phone}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Email (Optional)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    placeholder="john@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Password (12+ Characters) *</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    minLength={12}
                    placeholder="Min 12 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">6-Digit Verification OTP *</label>
                <input
                  type="text"
                  required
                  placeholder="123456"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold tracking-widest text-center"
                />
              </div>

              <div className="flex items-start space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="dpa-consent"
                  checked={termsConsent}
                  onChange={(e) => setTermsConsent(e.target.checked)}
                  className="mt-0.5 rounded text-brand-600 focus:ring-brand-500"
                />
                <label htmlFor="dpa-consent" className="text-[11px] text-slate-500 leading-tight">
                  I consent to the processing of my shopping & payment data in compliance with the{' '}
                  <strong className="text-slate-700">Kenya Data Protection Act</strong> and agree to the Terms of Service.
                </label>
              </div>

              <button
                type="submit"
                disabled={registering}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold py-3 rounded-2xl text-xs transition shadow-lg shadow-brand-600/20 flex items-center justify-center space-x-2"
              >
                <span>{registering ? 'Creating Account...' : 'Complete Registration'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          <div className="pt-3 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500">
              Already have an account?{' '}
              <Link to="/login" className="font-bold text-brand-600 hover:underline">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
