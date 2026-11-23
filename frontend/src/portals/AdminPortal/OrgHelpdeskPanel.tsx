import React, { useEffect, useState } from 'react';
import { Headphones, Plus, Send, RefreshCw } from 'lucide-react';
import { apiRequest } from '../../api.js';
import { can } from '../../permissions.js';
import { User, Store } from '../../types.js';

interface Props {
  currentUser?: User | null;
  stores: Store[];
}

/** Organization-facing support desk: raise tickets, track status, reply to agents. */
export const OrgHelpdeskPanel: React.FC<Props> = ({ currentUser, stores }) => {
  const [tickets, setTickets] = useState<any[]>([]);
  const [open, setOpen] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState({ subject: '', description: '', storeId: '', priority: 'MEDIUM' });
  const [reply, setReply] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/support/org/tickets');
      if (res?.success) setTickets(res.tickets || []);
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/support/org/tickets', { method: 'POST', body: JSON.stringify({ ...form, storeId: form.storeId || undefined }) });
      setMsg({ type: 'success', text: 'Ticket raised — our support team has been notified.' });
      setForm({ subject: '', description: '', storeId: '', priority: 'MEDIUM' });
      load();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };

  const view = async (id: string) => {
    try {
      const res = await apiRequest(`/support/org/tickets/${id}`);
      if (res?.success) setOpen(res.ticket);
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };

  const sendReply = async () => {
    if (!open || !reply.trim()) return;
    try {
      await apiRequest(`/support/org/tickets/${open._id}/messages`, { method: 'POST', body: JSON.stringify({ message: reply }) });
      setReply('');
      view(open._id);
      load();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };

  const statusColor = (s: string) =>
    s === 'RESOLVED' || s === 'CLOSED' ? 'bg-brand-50 text-brand-700' :
    s === 'IN_PROGRESS' || s === 'ASSIGNED' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700';

  return (
    <div className="space-y-4">
      {msg && <div className={`p-3 rounded-xl text-xs font-semibold ${msg.type === 'success' ? 'bg-brand-50 text-brand-800 border border-brand-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{msg.text}</div>}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* New ticket */}
        <form onSubmit={create} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="font-bold text-navy-800 text-sm flex items-center gap-2"><Plus className="w-4 h-4 text-brand-600" /> Raise a ticket</h3>
          <input placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full border border-slate-200 rounded-xl p-2.5 text-xs" required />
          <select value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value })} className="w-full border border-slate-200 rounded-xl p-2.5 text-xs bg-white">
            <option value="">Whole organization</option>
            {stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full border border-slate-200 rounded-xl p-2.5 text-xs bg-white">
            <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
          </select>
          <textarea placeholder="Describe the issue…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} className="w-full border border-slate-200 rounded-xl p-2.5 text-xs" required />
          <button className="w-full py-2.5 bg-brand-600 text-white rounded-xl text-xs font-bold">Submit ticket</button>
        </form>

        {/* Ticket list */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-navy-800 text-sm flex items-center gap-2"><Headphones className="w-4 h-4 text-brand-600" /> Support tickets</h3>
            <button onClick={load} className="text-navy-600"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>
          <div className="space-y-2">
            {tickets.map((t) => (
              <button key={t._id} onClick={() => view(t._id)} className="w-full text-left border border-slate-100 rounded-xl px-3 py-2.5 hover:bg-slate-50">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-slate-400">{t.ticketNumber}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor(t.status)}`}>{t.status.replace(/_/g, ' ')}</span>
                </div>
                <p className="text-xs font-bold text-navy-800 mt-1">{t.subject}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{t.priority} · {new Date(t.createdAt).toLocaleDateString()}</p>
              </button>
            ))}
            {tickets.length === 0 && !loading && <p className="text-xs text-slate-400 py-6 text-center">No tickets yet.</p>}
          </div>
        </div>
      </div>

      {/* Ticket detail modal */}
      {open && (
        <div className="fixed inset-0 bg-navy-800/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full border border-slate-200 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[10px] text-slate-400">{open.ticketNumber}</p>
                <h3 className="font-bold text-navy-800">{open.subject}</h3>
              </div>
              <button onClick={() => setOpen(null)} className="text-slate-400 hover:text-slate-700 text-lg">×</button>
            </div>
            <div className="space-y-2">
              {(open.messages || []).map((m: any, i: number) => (
                <div key={i} className={`rounded-xl p-3 text-xs ${m.senderRole === currentUser?.role && m.sender === currentUser?.name ? 'bg-brand-50 ml-6' : 'bg-slate-50 mr-6'}`}>
                  <p className="font-bold text-[10px] text-slate-500">{m.sender} · {new Date(m.createdAt).toLocaleString()}</p>
                  <p className="mt-1 text-slate-700">{m.message}</p>
                </div>
              ))}
            </div>
            {!['RESOLVED', 'CLOSED'].includes(open.status) && (
              <div className="flex gap-2">
                <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" className="flex-1 border border-slate-200 rounded-xl p-2.5 text-xs" />
                <button onClick={sendReply} className="px-4 py-2.5 bg-navy-800 text-white rounded-xl text-xs font-bold flex items-center gap-1"><Send className="w-3 h-3" /></button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
