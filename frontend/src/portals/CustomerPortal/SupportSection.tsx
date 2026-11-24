import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, LifeBuoy, Send } from 'lucide-react';
import { apiRequest, getToken } from '../../api.js';
import { CustomerOrder } from './customerTypes.js';

interface TicketMessage {
  sender: string;
  fromCustomer: boolean;
  message: string;
  createdAt: string;
}
interface Ticket {
  _id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  orderId?: string;
  assignedAgentName?: string;
  createdAt: string;
  updatedAt: string;
  messages: TicketMessage[];
}

const STATUS_STYLE: Record<Ticket['status'], string> = {
  OPEN: 'bg-amber-50 text-amber-800 border-amber-200',
  IN_PROGRESS: 'bg-azure-50 text-azure-800 border-azure-200',
  RESOLVED: 'bg-brand-50 text-brand-800 border-brand-200',
  CLOSED: 'bg-slate-100 text-slate-600 border-slate-200',
};

interface Props {
  orders: CustomerOrder[];
  prefill?: { subject: string; description: string } | null;
  onPrefillUsed: () => void;
}

export const SupportSection: React.FC<Props> = ({ orders, prefill, onPrefillUsed }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', orderId: '' });
  const [reply, setReply] = useState('');

  const load = useCallback(async () => {
    if (!getToken()) {
      setTickets([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const res = await apiRequest('/support/my/tickets');
      setTickets(res.tickets || []);
    } catch (e: any) {
      setError(e.message || 'Could not load your tickets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (prefill) {
      setForm({ subject: prefill.subject, description: prefill.description, orderId: '' });
      setCreating(true);
      onPrefillUsed();
    }
  }, [prefill, onPrefillUsed]);

  const selected = tickets.find((t) => t._id === selectedId) || null;

  const replaceTicket = (t: Ticket) => setTickets((prev) => [t, ...prev.filter((x) => x._id !== t._id)]);

  const createTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiRequest('/support/my/tickets', {
        method: 'POST',
        body: JSON.stringify({ subject: form.subject, description: form.description, orderId: form.orderId || undefined }),
      });
      replaceTicket(res.ticket);
      setForm({ subject: '', description: '', orderId: '' });
      setCreating(false);
      setSelectedId(res.ticket._id);
    } catch (err: any) {
      setError(err.message || 'Could not create the ticket.');
    } finally {
      setSaving(false);
    }
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !reply.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiRequest(`/support/my/tickets/${selected._id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: reply }),
      });
      replaceTicket(res.ticket);
      setReply('');
    } catch (err: any) {
      setError(err.message || 'Could not send your message.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  // ---- New ticket form ----
  if (creating) {
    return (
      <form onSubmit={createTicket} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 max-w-3xl">
        <button type="button" onClick={() => setCreating(false)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-navy-700">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <h2 className="font-bold text-base text-navy-800">How can we help?</h2>
        {error && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>}
        <div>
          <label htmlFor="t-subject" className="text-xs font-bold text-slate-600 block mb-1">Subject</label>
          <input id="t-subject" required minLength={3} maxLength={120} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs" />
        </div>
        <div>
          <label htmlFor="t-order" className="text-xs font-bold text-slate-600 block mb-1">Related order (optional)</label>
          <select id="t-order" value={form.orderId} onChange={(e) => setForm({ ...form, orderId: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs">
            <option value="">Not about a specific order</option>
            {orders.map((o) => (
              <option key={o._id} value={o._id}>#{o.orderNumber}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="t-desc" className="text-xs font-bold text-slate-600 block mb-1">What happened?</label>
          <textarea id="t-desc" required minLength={10} maxLength={2000} rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs" />
        </div>
        <button disabled={saving} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl text-xs">
          {saving ? 'Sending...' : 'Send to support'}
        </button>
      </form>
    );
  }

  // ---- Ticket thread ----
  if (selected) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 max-w-4xl">
        <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-navy-700">
          <ArrowLeft className="w-4 h-4" /> All tickets
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-mono text-slate-400">{selected.ticketNumber}</p>
            <h2 className="font-bold text-base text-navy-800">{selected.subject}</h2>
          </div>
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${STATUS_STYLE[selected.status]}`}>{selected.status.replace('_', ' ')}</span>
        </div>
        {error && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {selected.messages.map((m, i) => (
            <div key={i} className={`flex ${m.fromCustomer ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs ${m.fromCustomer ? 'bg-brand-600 text-white' : 'bg-slate-100 text-navy-700'}`}>
                <p className="whitespace-pre-wrap">{m.message}</p>
                <p className={`text-[10px] mt-1 ${m.fromCustomer ? 'text-brand-100' : 'text-slate-400'}`}>
                  {m.sender} · {new Date(m.createdAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
            </div>
          ))}
        </div>
        {selected.status === 'CLOSED' ? (
          <p className="text-xs text-slate-500">This ticket is closed. Open a new one if you still need help.</p>
        ) : (
          <form onSubmit={sendReply} className="flex gap-2">
            <input value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} placeholder="Write a reply" aria-label="Reply"
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs" />
            <button disabled={saving || !reply.trim()} className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 rounded-xl" aria-label="Send reply">
              <Send className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    );
  }

  // ---- Ticket list ----
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Problem with an order or payment? Our support team replies here.</p>
        <button onClick={() => setCreating(true)} className="bg-brand-600 hover:bg-brand-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs">
          New request
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>}
      {tickets.length === 0 ? (
        <div className="py-16 bg-white rounded-2xl border border-slate-200 text-center text-slate-400 space-y-2">
          <LifeBuoy className="w-10 h-10 mx-auto stroke-1" />
          <p className="text-sm font-bold">No support requests yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <button key={t._id} onClick={() => setSelectedId(t._id)} className="w-full text-left bg-white rounded-2xl border border-slate-200 hover:border-brand-300 p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-mono text-slate-400">{t.ticketNumber}</p>
                <p className="text-sm font-bold text-navy-700 truncate">{t.subject}</p>
                <p className="text-[11px] text-slate-400">Updated {new Date(t.updatedAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </div>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${STATUS_STYLE[t.status]}`}>{t.status.replace('_', ' ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};