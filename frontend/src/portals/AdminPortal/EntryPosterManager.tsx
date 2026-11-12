import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Printer, Copy, Check, RefreshCw, Plus, Ban, RotateCcw, ShieldAlert } from 'lucide-react';
import { apiRequest } from '../../api.js';

interface EntryPoster {
  _id: string;
  label: string;
  tier: 1 | 2;
  active: boolean;
  createdAt: string;
  code: string;
  url: string; // the link the QR must carry: https://app/enter?p=<signed code>
}

interface Props {
  storeId: string;
  storeName: string;
  canManage: boolean;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/**
 * Branch Manager screen for the store check-in posters. Each poster is a signed link the shopper scans at the
 * entrance. Managers create, print, switch off or replace them here.
 */
export const EntryPosterManager: React.FC<Props> = ({ storeId, storeName, canManage }) => {
  const [posters, setPosters] = useState<EntryPoster[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [label, setLabel] = useState('Main entrance');
  const [tier, setTier] = useState<1 | 2>(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const qrRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/presence/stores/${encodeURIComponent(storeId)}/entry-points`);
      setPosters(res.entryPoints || []);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Could not load the store posters.' });
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiRequest(`/presence/stores/${encodeURIComponent(storeId)}/entry-points`, {
        method: 'POST',
        body: JSON.stringify({ label: label.trim(), tier }),
      });
      setMsg({ type: 'success', text: `Poster "${label.trim()}" created. Print it and put it up.` });
      setLabel('');
      await load();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Could not create the poster.' });
    } finally {
      setBusy(false);
    }
  };

  const setActive = async (poster: EntryPoster, active: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      await apiRequest(`/presence/stores/${encodeURIComponent(storeId)}/entry-points/${poster._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      });
      setMsg({ type: 'success', text: active ? `"${poster.label}" is working again.` : `"${poster.label}" is switched off. Shoppers who scan it will be refused.` });
      await load();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Could not update the poster.' });
    } finally {
      setBusy(false);
    }
  };

  const rotateAll = async () => {
    if (!window.confirm('This stops every poster already printed for this store. You will need to print and put up the new ones. Continue?')) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiRequest(`/presence/stores/${encodeURIComponent(storeId)}/rotate-secret`, { method: 'POST' });
      setMsg({ type: 'success', text: res.message || 'All old posters stopped. Print the new codes.' });
      await load();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Could not replace the codes.' });
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (poster: EntryPoster) => {
    try {
      await navigator.clipboard.writeText(poster.url);
      setCopiedId(poster._id);
      setTimeout(() => setCopiedId((id) => (id === poster._id ? null : id)), 2000);
    } catch {
      window.prompt('Copy this link:', poster.url);
    }
  };

  const printPoster = (poster: EntryPoster) => {
    const svg = qrRefs.current[poster._id]?.querySelector('svg');
    if (!svg) return;
    const w = window.open('', '_blank', 'width=800,height=1000');
    if (!w) {
      setMsg({ type: 'error', text: 'Your browser blocked the print window. Allow pop-ups for this site and try again.' });
      return;
    }
    w.document.write(`<!doctype html><html><head><title>${escapeHtml(poster.label)} - ${escapeHtml(storeName)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: Arial, Helvetica, sans-serif; text-align: center; color: #0f2a4a; margin: 0; }
  h1 { font-size: 44px; margin: 24px 0 4px; }
  h2 { font-size: 26px; font-weight: 600; margin: 0 0 24px; color: #3f8f29; }
  .qr svg { width: 420px; height: 420px; }
  p { font-size: 22px; margin: 18px 40px; }
  small { display: block; font-size: 14px; color: #64748b; margin-top: 28px; }
</style></head><body>
  <h1>Skip the queue</h1>
  <h2>${escapeHtml(storeName)}</h2>
  <div class="qr">${svg.outerHTML}</div>
  <p><b>1.</b> Scan this code with your phone camera<br/><b>2.</b> Sign in and tap <b>Check in</b><br/><b>3.</b> Scan your items as you shop and pay on your phone</p>
  <small>${escapeHtml(poster.label)} · Staff may spot-check your bags at the exit</small>
  <script>window.onload = function () { window.print(); };</script>
</body></html>`);
    w.document.close();
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Store Check-in Posters</h3>
          <p className="text-xs text-slate-500">
            Shoppers scan these QR codes at the store to start Scan &amp; Go. Print one for the entrance, and extra ones for other spots if you want.
          </p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {msg && (
        <div role="status" className={`rounded-2xl border p-3 text-xs font-bold ${msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          {msg.text}
        </div>
      )}

      {canManage && (
        <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end text-xs border border-slate-200 rounded-2xl p-4">
          <label className="space-y-1.5">
            <span className="font-bold text-navy-700 block">Poster name</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="e.g. Main entrance" className="w-full border border-slate-200 rounded-xl p-3 font-bold text-navy-800" />
          </label>
          <label className="space-y-1.5">
            <span className="font-bold text-navy-700 block">Where it goes</span>
            <select value={tier} onChange={(e) => setTier(Number(e.target.value) as 1 | 2)} className="w-full border border-slate-200 rounded-xl p-3 font-bold text-navy-800 bg-white">
              <option value={1}>Main entrance (full basket limits)</option>
              <option value={2}>Other spot, e.g. aisle or side door (smaller basket limits)</option>
            </select>
          </label>
          <button type="submit" disabled={busy || !label.trim()} className="flex items-center justify-center gap-1.5 px-5 py-3 bg-azure-600 hover:bg-azure-700 disabled:opacity-50 text-white rounded-xl font-bold">
            <Plus className="w-4 h-4" /> Create poster
          </button>
        </form>
      )}

      {!loading && posters.length === 0 && (
        <div className="border border-dashed border-slate-300 rounded-2xl p-8 text-center text-xs text-slate-500 space-y-2">
          <QrCode className="w-8 h-8 mx-auto text-slate-300" />
          <p className="font-bold text-navy-700">No posters yet for {storeName}.</p>
          <p>Create a "Main entrance" poster above, print it and put it up at the door.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {posters.map((poster) => (
          <div key={poster._id} className={`border rounded-2xl p-5 space-y-4 ${poster.active ? 'border-slate-200' : 'border-rose-200 bg-rose-50/40'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-black text-navy-800">{poster.label}</p>
                <p className="text-[11px] text-slate-500">{poster.tier === 1 ? 'Main entrance' : 'Other spot, smaller basket limits'}</p>
              </div>
              <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${poster.active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {poster.active ? 'Active' : 'Switched off'}
              </span>
            </div>

            <div ref={(el) => { qrRefs.current[poster._id] = el; }} className={`flex justify-center bg-white p-3 rounded-xl border border-slate-200 ${poster.active ? '' : 'opacity-40'}`}>
              <QRCodeSVG value={poster.url} size={190} level="M" includeMargin />
            </div>

            <p className="text-[10px] font-mono text-slate-400 break-all line-clamp-2" title={poster.url}>{poster.url}</p>

            <div className="flex flex-wrap gap-2 text-xs">
              <button onClick={() => printPoster(poster)} disabled={!poster.active} className="flex items-center gap-1.5 px-3 py-2 bg-azure-600 hover:bg-azure-700 disabled:opacity-40 text-white rounded-xl font-bold">
                <Printer className="w-3.5 h-3.5" /> Print poster
              </button>
              <button onClick={() => void copyLink(poster)} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50">
                {copiedId === poster._id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedId === poster._id ? 'Copied' : 'Copy link'}
              </button>
              {canManage && (
                <button onClick={() => void setActive(poster, !poster.active)} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50">
                  {poster.active ? <><Ban className="w-3.5 h-3.5" /> Switch off</> : <><RotateCcw className="w-3.5 h-3.5" /> Switch on</>}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {canManage && posters.length > 0 && (
        <div className="flex items-start justify-between gap-4 border border-amber-200 bg-amber-50 rounded-2xl p-4 text-xs">
          <div className="flex items-start gap-2 text-amber-900">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              <b>A poster was photographed and shared?</b> Switch that poster off, or replace all codes for this store. Replacing stops every poster already printed, so you will need to print and put up the new ones.
            </p>
          </div>
          <button onClick={() => void rotateAll()} disabled={busy} className="shrink-0 px-3 py-2 bg-white border border-amber-300 text-amber-900 rounded-xl font-bold hover:bg-amber-100">
            Replace all codes
          </button>
        </div>
      )}
    </div>
  );
};

export default EntryPosterManager;