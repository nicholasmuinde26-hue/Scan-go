import React, { useEffect, useState } from 'react';
import {
  Radio,
  Plus,
  RefreshCw,
  KeyRound,
  PauseCircle,
  PlayCircle,
  Ban,
  Copy,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { Store } from '../../types.js';
import { apiRequest } from '../../api.js';

interface DeviceManagerPanelProps {
  currentStore: Store;
}

const DEVICE_KINDS = [
  'BASKET_LITE', 'BASKET_PRO', 'EXIT_CAMERA', 'ENTRANCE_SCANNER',
  'KIOSK', 'POS_BRIDGE', 'SCALE', 'RFID_READER',
];

interface Device {
  deviceId: string;
  kind: string;
  label?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  firmwareVersion?: string;
  lastSeenAt?: string;
  boundBasketId?: string;
  createdAt: string;
}

interface DeviceEvent {
  _id: string;
  eventId: string;
  deviceId: string;
  type: string;
  status: 'RECEIVED' | 'APPLIED' | 'REJECTED';
  createdAt: string;
  result?: { applied?: boolean; error?: string; riskSignal?: string };
}

/**
 * Retail device registry: smart baskets, exit cameras, kiosks, POS bridges.
 * Registration and key rotation reveal the device secret exactly once.
 */
export const DeviceManagerPanel: React.FC<DeviceManagerPanelProps> = ({ currentStore }) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [events, setEvents] = useState<DeviceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [oneTimeSecret, setOneTimeSecret] = useState<{ deviceId: string; secret: string } | null>(null);

  const [showRegister, setShowRegister] = useState(false);
  const [form, setForm] = useState({ deviceId: '', kind: 'BASKET_PRO', label: '' });

  const load = async () => {
    try {
      setLoading(true);
      const [d, e] = await Promise.all([
        apiRequest(`/devices?storeId=${currentStore._id}`),
        apiRequest(`/devices/events?storeId=${currentStore._id}`),
      ]);
      setDevices(d.devices || []);
      setEvents((e.events || []).slice(0, 30));
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to load devices' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStore._id]);

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.deviceId.trim()) return;
    try {
      setBusy('register');
      setMsg(null);
      const res = await apiRequest('/devices', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: form.deviceId.trim(),
          storeId: currentStore._id,
          kind: form.kind,
          label: form.label || undefined,
        }),
      });
      setOneTimeSecret({ deviceId: form.deviceId.trim(), secret: res.secret });
      setForm({ deviceId: '', kind: 'BASKET_PRO', label: '' });
      setShowRegister(false);
      await load();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Registration failed' });
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (deviceId: string, status: string) => {
    try {
      setBusy(deviceId);
      await apiRequest(`/devices/${deviceId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Update failed' });
    } finally {
      setBusy(null);
    }
  };

  const rotateKey = async (deviceId: string) => {
    try {
      setBusy(deviceId);
      const res = await apiRequest(`/devices/${deviceId}/rotate-key`, { method: 'POST', body: '{}' });
      setOneTimeSecret({ deviceId, secret: res.secret });
      setMsg({ type: 'success', text: `Key rotated for ${deviceId} — copy the new secret now.` });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Rotation failed' });
    } finally {
      setBusy(null);
    }
  };

  const statusBadge = (s: string) =>
    s === 'ACTIVE'
      ? 'bg-brand-100 text-brand-800'
      : s === 'SUSPENDED'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-rose-100 text-rose-800';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-black text-navy-800 text-sm flex items-center space-x-2">
            <Radio className="w-4 h-4 text-brand-600" />
            <span>Retail Devices</span>
          </h3>
          <p className="text-[11px] text-slate-500">
            Smart baskets, exit cameras, kiosks and POS bridges registered to this store.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowRegister((v) => !v)}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Register Device</span>
          </button>
        </div>
      </div>

      {msg && (
        <div className={`p-3 rounded-xl text-xs font-bold ${msg.type === 'success' ? 'bg-brand-50 text-brand-800 border border-brand-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
          {msg.text}
        </div>
      )}

      {/* One-time secret banner */}
      {oneTimeSecret && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 space-y-2">
          <div className="flex items-center space-x-2 text-amber-800 font-black text-xs">
            <AlertTriangle className="w-4 h-4" />
            <span>Device secret — shown once. Copy it now; it cannot be retrieved later.</span>
          </div>
          <div className="flex items-center space-x-2">
            <code className="flex-1 bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs font-mono break-all">
              {oneTimeSecret.secret}
            </code>
            <button
              onClick={() => navigator.clipboard?.writeText(oneTimeSecret.secret)}
              className="p-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
              title="Copy"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button onClick={() => setOneTimeSecret(null)} className="px-3 py-2 text-xs font-bold text-amber-800 hover:underline">
              Done
            </button>
          </div>
          <p className="text-[10px] text-amber-700">
            Device: <strong>{oneTimeSecret.deviceId}</strong> — configure it with headers{' '}
            <code>X-Device-Id</code> + <code>X-Device-Key</code>, or MQTT topic{' '}
            <code>retail/{currentStore._id}/devices/{oneTimeSecret.deviceId}/events</code>.
          </p>
        </div>
      )}

      {/* Register form */}
      {showRegister && (
        <form onSubmit={register} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input
            type="text"
            placeholder="Device ID (e.g. basket-01)"
            value={form.deviceId}
            onChange={(e) => setForm({ ...form, deviceId: e.target.value })}
            className="sm:col-span-2 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
            required
          />
          <select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
            className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white"
          >
            {DEVICE_KINDS.map((k) => (
              <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Label (optional)"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs"
            />
            <button type="submit" disabled={!!busy} className="px-4 py-2 bg-navy-700 text-white rounded-xl text-xs font-bold">
              {busy === 'register' ? '…' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {/* Device list */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
            <tr>
              <th className="text-left px-4 py-2.5 font-black">Device</th>
              <th className="text-left px-3 py-2.5 font-black">Kind</th>
              <th className="text-left px-3 py-2.5 font-black">Status</th>
              <th className="text-left px-3 py-2.5 font-black">Firmware</th>
              <th className="text-left px-3 py-2.5 font-black">Last seen</th>
              <th className="text-right px-4 py-2.5 font-black">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
            )}
            {!loading && devices.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No devices registered yet.</td></tr>
            )}
            {devices.map((d) => (
              <tr key={d.deviceId} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5">
                  <p className="font-bold text-navy-800 font-mono">{d.deviceId}</p>
                  {d.label && <p className="text-[10px] text-slate-400">{d.label}</p>}
                </td>
                <td className="px-3 py-2.5 text-slate-600">{d.kind.replace(/_/g, ' ')}</td>
                <td className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${statusBadge(d.status)}`}>{d.status}</span>
                </td>
                <td className="px-3 py-2.5 text-slate-500 font-mono">{d.firmwareVersion || '—'}</td>
                <td className="px-3 py-2.5 text-slate-500">
                  {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'never'}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    {d.status === 'ACTIVE' ? (
                      <button onClick={() => setStatus(d.deviceId, 'SUSPENDED')} disabled={busy === d.deviceId} title="Suspend" className="p-1.5 border border-slate-200 rounded-lg text-amber-600 hover:bg-amber-50">
                        <PauseCircle className="w-3.5 h-3.5" />
                      </button>
                    ) : d.status === 'SUSPENDED' ? (
                      <button onClick={() => setStatus(d.deviceId, 'ACTIVE')} disabled={busy === d.deviceId} title="Reactivate" className="p-1.5 border border-slate-200 rounded-lg text-brand-600 hover:bg-brand-50">
                        <PlayCircle className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                    {d.status !== 'REVOKED' && (
                      <button onClick={() => setStatus(d.deviceId, 'REVOKED')} disabled={busy === d.deviceId} title="Revoke permanently" className="p-1.5 border border-slate-200 rounded-lg text-rose-600 hover:bg-rose-50">
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {d.status === 'ACTIVE' && (
                      <button onClick={() => rotateKey(d.deviceId)} disabled={busy === d.deviceId} title="Rotate key" className="p-1.5 border border-slate-200 rounded-lg text-navy-600 hover:bg-navy-50">
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recent events */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
        <h4 className="font-bold text-navy-800 text-xs">Recent device events</h4>
        <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
          {events.length === 0 && <p className="text-[11px] text-slate-400 py-3">No events yet — devices will appear here once they start reporting.</p>}
          {events.map((ev) => (
            <div key={ev._id} className="py-2 flex items-center justify-between text-[11px]">
              <div className="flex items-center space-x-2 min-w-0">
                <span className="font-mono font-bold text-navy-700">{ev.deviceId}</span>
                <span className="text-slate-500">{ev.type.replace(/_/g, ' ')}</span>
                {ev.result?.riskSignal && (
                  <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-[9px] font-black">{ev.result.riskSignal}</span>
                )}
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                  ev.status === 'APPLIED' ? 'bg-brand-100 text-brand-800' : ev.status === 'REJECTED' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  {ev.status}
                </span>
                <span className="text-slate-400">{new Date(ev.createdAt).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
