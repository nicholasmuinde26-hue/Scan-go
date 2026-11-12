import React, { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, LogOut } from 'lucide-react';
import { apiRequest } from '../../api.js';

interface Profile {
  name: string;
  phone: string;
  email?: string;
  tripsCompleted?: number;
  cleanTrips?: number;
}

interface Props {
  onLogout?: () => void;
  onRequestData: () => void; // opens a prefilled help request (export / delete my data)
}

export const AccountSection: React.FC<Props> = ({ onLogout, onRequestData }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOutAll, setSigningOutAll] = useState(false);

  useEffect(() => {
    let alive = true;
    apiRequest('/auth/me')
      .then((res) => alive && setProfile(res.user))
      .catch((e: any) => alive && setError(e.message || 'Could not load your profile.'));
    return () => {
      alive = false;
    };
  }, []);

  const signOutEverywhere = async () => {
    if (!window.confirm('Sign out of every device where you are logged in?')) return;
    setSigningOutAll(true);
    try {
      await apiRequest('/auth/logout-all', { method: 'POST' });
    } catch {
      /* even if the call fails we still sign this device out below */
    }
    onLogout?.();
  };

  if (error) return <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>;
  if (!profile) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  const trips = profile.tripsCompleted ?? 0;
  const clean = profile.cleanTrips ?? 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5 items-start">
      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-bold text-base text-navy-800">Your details</h2>
        <dl className="text-xs space-y-3">
          {[
            ['Name', profile.name],
            ['Phone', profile.phone],
            ['Email', profile.email || 'Not provided'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2">
              <dt className="text-slate-500">{k}</dt>
              <dd className="font-semibold text-navy-700 text-right break-all">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[11px] text-slate-400">To change your name, phone or email, send us a help request.</p>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="font-bold text-base text-navy-800 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-brand-600" /> Scan &amp; Go record
        </h2>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-2xl font-black text-navy-800">{trips}</p>
            <p className="text-[11px] text-slate-500">Trips completed</p>
          </div>
          <div className="bg-brand-50 rounded-xl p-4">
            <p className="text-2xl font-black text-brand-700">{clean}</p>
            <p className="text-[11px] text-slate-500">Clean exits</p>
          </div>
        </div>
        <p className="text-[11px] text-slate-500">Customers with a clean record get faster exit checks.</p>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3 lg:col-span-2">
        <h2 className="font-bold text-base text-navy-800">Privacy and sign-in</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={onRequestData} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-navy-700 rounded-xl text-xs font-bold">
            Request my data or account deletion
          </button>
          <button
            disabled={signingOutAll}
            onClick={signOutEverywhere}
            className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" /> Sign out of all devices
          </button>
        </div>
      </section>
    </div>
  );
};