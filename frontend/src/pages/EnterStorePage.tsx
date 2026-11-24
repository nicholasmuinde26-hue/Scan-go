import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MapPin, ShieldCheck, AlertTriangle, ArrowRight } from 'lucide-react';
import { ScanGoLogo } from '../components/ScanGoLogo.js';
import { apiRequest, getToken } from '../api.js';
import { Store, User } from '../types.js';
import { clearEntryCode, getDeviceId, getGps, markStartInScanAndGo, rememberEntryCode } from '../presence.js';

interface Props {
  currentUser: User | null;
  stores: Store[];
  onSelectStore: (store: Store) => void | Promise<void>;
}

interface EntryInfo {
  store: { _id: string; name: string; location?: string };
  entryPoint: { label: string };
}

/**
 * Landing page for the QR posters in the store. The poster link looks like /enter?p=<signed code>.
 * It shows which store the poster belongs to, asks the shopper to sign in if needed, confirms they are inside the
 * store (location or store Wi-Fi), then opens Scan & Go for that store.
 */
export const EnterStorePage: React.FC<Props> = ({ currentUser, stores, onSelectStore }) => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = params.get('p') || '';

  const [info, setInfo] = useState<EntryInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!code) {
        setError('This link is missing its store code. Scan the QR poster at the store entrance again.');
        setLoading(false);
        return;
      }
      try {
        const res = await apiRequest(`/presence/entry-info?p=${encodeURIComponent(code)}`);
        if (!cancelled) setInfo({ store: res.store, entryPoint: res.entryPoint });
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'This entry code is not valid. Scan the QR poster at the store entrance again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [code]);

  // Keep the code while the shopper signs in or registers, so they come straight back here.
  useEffect(() => {
    if (code && !currentUser) rememberEntryCode(code);
  }, [code, currentUser]);

  const checkIn = async () => {
    if (!currentUser || !getToken()) {
      setError('Please sign in to your shopper account first.');
      navigate('/login');
      return;
    }
    setError('');
    setCheckingIn(true);
    try {
      // The location is read once, only to confirm the shopper is at the store. The server keeps just yes or no.
      const gps = await getGps();
      const res = await apiRequest('/presence/enter', {
        method: 'POST',
        body: JSON.stringify({ code, deviceId: getDeviceId(), gps: gps || undefined }),
      });
      clearEntryCode();
      const store = stores.find((s) => s._id === res.store?._id);
      if (store) await onSelectStore(store);
      markStartInScanAndGo();
      navigate('/app', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Check-in failed. Please try again.');
    } finally {
      setCheckingIn(false);
    }
  };

  const isShopper = currentUser?.role === 'CUSTOMER';

  return (
    <div className="min-h-screen bg-gradient-to-b from-azure-50 to-brand-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="flex justify-center mb-2">
          <ScanGoLogo size="lg" />
        </div>
        <h1 className="text-2xl font-black text-navy-800 tracking-tight">Start Scan &amp; Go</h1>
        <p className="text-xs text-slate-500">Check in at the store to begin scanning your shopping.</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-xl rounded-3xl border border-slate-200 sm:px-10 space-y-5">
          {loading && <p className="text-xs font-bold text-slate-400 text-center animate-pulse">Checking the poster…</p>}

          {!loading && info && (
            <div className="flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4">
              <MapPin className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-bold text-navy-800">{info.store.name}</p>
                <p className="text-xs text-slate-500">{info.entryPoint.label}</p>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-2xl flex items-start gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!loading && info && (!currentUser || !getToken()) && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">Sign in to your shopper account to continue. You will come straight back here.</p>
              <Link to="/login" className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-xl text-xs transition">
                Sign in <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/register" className="w-full flex items-center justify-center gap-2 border border-slate-200 text-slate-700 font-bold py-3 rounded-xl text-xs hover:bg-slate-50 transition">
                Create an account
              </Link>
            </div>
          )}

          {!loading && info && currentUser && !isShopper && (
            <p className="text-xs text-slate-600">In-store check-in is for shopper accounts. Staff accounts cannot start Scan &amp; Go.</p>
          )}

          {!loading && info && currentUser && isShopper && Boolean(getToken()) && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-[11px] text-slate-500">
                <ShieldCheck className="w-4 h-4 text-brand-600 shrink-0" />
                <span>
                  We use your location once to confirm you are inside the store. It is not saved. If you cannot share it, connect to the store Wi-Fi instead.
                </span>
              </div>
              <button
                onClick={() => void checkIn()}
                disabled={checkingIn}
                className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-xs transition shadow-md shadow-brand-600/20"
              >
                {checkingIn ? 'Checking you in…' : 'Check in and start scanning'}
                {!checkingIn && <ArrowRight className="w-4 h-4" />}
              </button>
              <Link to="/app" className="block text-center text-[11px] font-semibold text-slate-400 hover:text-slate-600">
                Not now
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EnterStorePage;
