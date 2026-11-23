import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw, Building2, Users, Headphones } from 'lucide-react';
import { apiRequest } from '../../api.js';

/** Live platform activity: who is online right now, per supermarket. */
export const ActivitySection: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/platform/activity');
      if (res?.success) setData(res);
    } catch { /* permission-gated sections may 403 */ }
    finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const timeAgo = (d: string) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  };

  const kpis = [
    { label: 'Active supermarkets', value: data?.counts?.activeOrganizations ?? '—', icon: Building2 },
    { label: 'Active sessions', value: data?.counts?.activeSessions ?? '—', icon: Activity },
    { label: 'Staff online', value: data?.counts?.onlineStaff ?? '—', icon: Users },
    { label: 'Open tickets', value: data?.counts?.openTickets ?? '—', icon: Headphones },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Sessions active in the last {data?.onlineWindowMinutes ?? 15} minutes — based on real heartbeats, not login history.</p>
        <button onClick={load} className="p-2 border border-slate-200 rounded-xl text-slate-500 bg-white"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4">
              <Icon className="w-4 h-4 text-brand-600 mb-2" />
              <p className="text-2xl font-black text-navy-800">{k.value}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">{k.label}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-navy-800 text-sm mb-3">Recent active sessions</h3>
        <div className="space-y-2">
          {(data?.sessions || []).map((s: any, i: number) => (
            <div key={i} className="flex items-center justify-between border border-slate-100 rounded-xl px-3 py-2.5 text-xs">
              <div className="min-w-0">
                <p className="font-bold text-navy-800 truncate">{s.name} <span className="font-mono text-[10px] text-slate-400">{s.role}</span></p>
                <p className="text-[10px] text-slate-400 truncate">
                  {s.organizationName || 'Platform'}{s.storeName ? ` · ${s.storeName}` : ''}{s.ip ? ` · ${s.ip}` : ''}
                </p>
              </div>
              <span className="text-[10px] font-bold text-brand-700 shrink-0 ml-3">{timeAgo(s.lastActiveAt)}</span>
            </div>
          ))}
          {data && (data.sessions || []).length === 0 && <p className="text-xs text-slate-400 py-6 text-center">Nobody is online right now.</p>}
        </div>
      </div>
    </div>
  );
};
