import React, { useState, useEffect } from 'react';
import {
  Headphones,
  Search,
  Clock,
  Send,
  AlertTriangle,
  RotateCcw,
  Unlock,
  KeyRound,
  FileText,
  User,
  ShoppingBag,
  CreditCard,
  CheckCircle2,
  X,
  ArrowUpRight,
  MessageSquare,
  ShieldAlert,
  Plus,
} from 'lucide-react';
import { apiRequest, formatKes } from '../../api.js';
import { SupportTicketItem } from './superAdminTypes.js';

export const SupportDeskSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'TICKETS' | 'LOOKUP'>('TICKETS');

  // Ticketing state
  const [tickets, setTickets] = useState<SupportTicketItem[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketItem | null>(null);
  const [ticketFilter, setTicketFilter] = useState({ status: '', priority: '', tier: '' });
  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);

  // New Ticket Modal
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [newTicketForm, setNewTicketForm] = useState({
    customerPhone: '',
    customerName: '',
    subject: '',
    description: '',
    priority: 'MEDIUM',
  });

  // Customer Lookup state
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeEntity, setActiveEntity] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [newNote, setNewNote] = useState('');

  // Safe action dialogs
  const [heldReason, setHeldReason] = useState('');
  const [showReleaseModal, setShowReleaseModal] = useState<string | null>(null);

  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const cannedReplies = [
    'We have verified your M-Pesa transaction and resent your digital checkout receipt.',
    'Our technical team is requerying the Safaricom Daraja STK callback. Please stand by.',
    'Your held order has been cleared by the store supervisor and is ready for collection.',
    'We have initiated a temporary access credential reset sent via secure SMS to your registered phone.',
  ];

  const loadTickets = async () => {
    try {
      setLoadingTickets(true);
      const params = new URLSearchParams();
      if (ticketFilter.status) params.set('status', ticketFilter.status);
      if (ticketFilter.priority) params.set('priority', ticketFilter.priority);
      if (ticketFilter.tier) params.set('tier', ticketFilter.tier);

      const res = await apiRequest(`/platform/tickets?${params.toString()}`);
      if (res?.tickets) {
        setTickets(res.tickets);
        if (selectedTicket) {
          const updated = res.tickets.find((t: any) => t._id === selectedTicket._id);
          if (updated) setSelectedTicket(updated);
        }
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to load tickets' });
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [ticketFilter]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/platform/tickets', {
        method: 'POST',
        body: JSON.stringify(newTicketForm),
      });
      setMsg({ type: 'success', text: 'Support ticket opened successfully.' });
      setShowNewTicketModal(false);
      setNewTicketForm({ customerPhone: '', customerName: '', subject: '', description: '', priority: 'MEDIUM' });
      loadTickets();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to create ticket' });
    }
  };

  const handleSendTicketMessage = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    try {
      const res = await apiRequest(`/platform/tickets/${selectedTicket._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          newMessage: replyText.trim(),
          isInternal: isInternalNote,
        }),
      });
      if (res?.ticket) {
        setSelectedTicket(res.ticket);
      }
      setReplyText('');
      loadTickets();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to post message' });
    }
  };

  const handleUpdateTicketStatus = async (status: string) => {
    if (!selectedTicket) return;
    try {
      const res = await apiRequest(`/platform/tickets/${selectedTicket._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (res?.ticket) setSelectedTicket(res.ticket);
      loadTickets();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to update ticket' });
    }
  };

  const handleEscalateToTier2 = async () => {
    if (!selectedTicket) return;
    if (!window.confirm(`Escalate ticket ${selectedTicket.ticketNumber} to Tier 2 Support Lead?`)) return;
    try {
      const res = await apiRequest(`/platform/tickets/${selectedTicket._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          tier: 'TIER_2',
          newMessage: '🚨 Ticket escalated from Tier 1 to Tier 2 Lead for advanced technical resolution.',
          isInternal: true,
        }),
      });
      if (res?.ticket) setSelectedTicket(res.ticket);
      setMsg({ type: 'success', text: `Ticket ${selectedTicket.ticketNumber} escalated to Tier 2.` });
      loadTickets();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to escalate ticket' });
    }
  };

  // Customer Lookup
  const handleSearchLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      setSearching(true);
      setActiveEntity(null);
      setTimeline([]);
      const res = await apiRequest(`/support/search?q=${encodeURIComponent(query.trim())}`);
      if (res?.results) {
        setSearchResults(res.results);
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Search failed' });
    } finally {
      setSearching(false);
    }
  };

  const handleSelectEntity = async (item: any) => {
    setActiveEntity(item);
    setLoadingTimeline(true);
    try {
      const res = await apiRequest(`/support/timeline/${item.type.toLowerCase()}/${item.id}`);
      if (res?.timeline) {
        setTimeline(res.timeline);
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to load timeline' });
    } finally {
      setLoadingTimeline(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !activeEntity) return;
    try {
      await apiRequest(`/support/notes/${activeEntity.type.toLowerCase()}/${activeEntity.id}`, {
        method: 'POST',
        body: JSON.stringify({ note: newNote.trim() }),
      });
      setNewNote('');
      setMsg({ type: 'success', text: 'Internal note attached.' });
      handleSelectEntity(activeEntity);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to add note' });
    }
  };

  // Safe Actions
  const handleResendReceipt = async (orderId: string) => {
    try {
      await apiRequest(`/support/actions/resend-receipt/${orderId}`, { method: 'POST' });
      setMsg({ type: 'success', text: 'Receipt resent successfully to customer.' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to resend receipt' });
    }
  };

  const handleRequerySTK = async (paymentId: string) => {
    try {
      await apiRequest(`/support/actions/requery-stk/${paymentId}`, { method: 'POST' });
      setMsg({ type: 'success', text: 'STK push status requery sent to Safaricom Daraja.' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to requery STK' });
    }
  };

  const handleReleaseHeldOrder = async (orderId: string) => {
    if (!heldReason.trim()) return;
    try {
      await apiRequest(`/support/actions/release-held-order/${orderId}`, {
        method: 'POST',
        body: JSON.stringify({ reason: heldReason.trim() }),
      });
      setMsg({ type: 'success', text: 'Held order released to customer approval queue.' });
      setShowReleaseModal(null);
      setHeldReason('');
      if (activeEntity) handleSelectEntity(activeEntity);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to release order' });
    }
  };

  const handleResetPassword = async (userId: string) => {
    try {
      await apiRequest(`/support/actions/reset-password/${userId}`, { method: 'POST' });
      setMsg({ type: 'success', text: 'Password reset initiated. Temporary passphrase SMS sent.' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to reset password' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {msg && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center justify-between ${
            msg.type === 'success'
              ? 'bg-brand-50 text-brand-800 border border-brand-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-navy-800">Support Desk & Customer Incident Command</h2>
          <p className="text-xs text-slate-500">
            Customer lookup, order/payment timeline, safe operational actions, and ticketing with Tier 1 & 2 escalation
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setActiveTab('TICKETS')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === 'TICKETS' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
              }`}
            >
              Ticket Queue
            </button>
            <button
              onClick={() => setActiveTab('LOOKUP')}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === 'LOOKUP' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
              }`}
            >
              Customer Lookup & Timeline
            </button>
          </div>

          {activeTab === 'TICKETS' && (
            <button
              onClick={() => setShowNewTicketModal(true)}
              className="inline-flex items-center space-x-1 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Ticket</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'TICKETS' ? (
        /* Ticketing System Layout: Left ticket list, Right message thread */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Ticket List */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-4">
            {/* Filters */}
            <div className="flex items-center gap-2">
              <select
                value={ticketFilter.status}
                onChange={(e) => setTicketFilter({ ...ticketFilter, status: e.target.value })}
                className="px-2 py-1 bg-slate-50 border rounded-xl text-xs flex-1"
              >
                <option value="">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
              </select>
              <select
                value={ticketFilter.tier}
                onChange={(e) => setTicketFilter({ ...ticketFilter, tier: e.target.value })}
                className="px-2 py-1 bg-slate-50 border rounded-xl text-xs"
              >
                <option value="">All Tiers</option>
                <option value="TIER_1">Tier 1</option>
                <option value="TIER_2">Tier 2</option>
              </select>
            </div>

            <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
              {tickets.map((t) => {
                const isSelected = selectedTicket?._id === t._id;
                const isSlaBreached = new Date(t.slaExpiresAt).getTime() < Date.now() && t.status !== 'RESOLVED' && t.status !== 'CLOSED';

                return (
                  <div
                    key={t._id}
                    onClick={() => setSelectedTicket(t)}
                    className={`p-3.5 rounded-xl border text-xs cursor-pointer transition space-y-1.5 ${
                      isSelected
                        ? 'border-navy-600 bg-navy-50/50 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-navy-700">{t.ticketNumber}</span>
                      <div className="flex items-center space-x-1.5">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                            t.tier === 'TIER_2' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {t.tier}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            t.status === 'OPEN'
                              ? 'bg-rose-100 text-rose-800'
                              : t.status === 'IN_PROGRESS'
                              ? 'bg-azure-100 text-azure-800'
                              : 'bg-brand-100 text-brand-800'
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                    </div>

                    <p className="font-semibold text-navy-800 line-clamp-1">{t.subject}</p>
                    <p className="text-[11px] text-slate-500 font-mono">Customer: {t.customerPhone}</p>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-400">
                      <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                      <span className={isSlaBreached ? 'font-bold text-rose-600' : ''}>
                        SLA: {isSlaBreached ? 'BREACHED' : 'Within SLA'}
                      </span>
                    </div>
                  </div>
                );
              })}

              {tickets.length === 0 && (
                <div className="py-12 text-center text-xs text-slate-400">No support tickets found.</div>
              )}
            </div>
          </div>

          {/* Ticket Messages & Actions */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 min-h-[500px]">
            {selectedTicket ? (
              <>
                {/* Header */}
                <div className="space-y-3 pb-3 border-b border-slate-100">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-navy-700 text-sm">
                          {selectedTicket.ticketNumber}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            selectedTicket.tier === 'TIER_2'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {selectedTicket.tier}
                        </span>
                      </div>
                      <h3 className="font-bold text-navy-800 text-base mt-0.5">{selectedTicket.subject}</h3>
                      <p className="text-xs text-slate-500 font-mono">
                        Customer Phone: {selectedTicket.customerPhone}{' '}
                        {selectedTicket.customerName ? `(${selectedTicket.customerName})` : ''}
                      </p>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {selectedTicket.tier === 'TIER_1' && (
                        <button
                          onClick={handleEscalateToTier2}
                          className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
                        >
                          Escalate to Tier 2
                        </button>
                      )}
                      <select
                        value={selectedTicket.status}
                        onChange={(e) => handleUpdateTicketStatus(e.target.value)}
                        className="px-2 py-1 bg-slate-50 border rounded-xl text-xs font-semibold"
                      >
                        <option value="OPEN">Mark OPEN</option>
                        <option value="IN_PROGRESS">Mark IN PROGRESS</option>
                        <option value="RESOLVED">Mark RESOLVED</option>
                        <option value="CLOSED">Mark CLOSED</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Message Thread */}
                <div className="space-y-3 flex-1 overflow-y-auto max-h-[350px] pr-2">
                  {selectedTicket.messages.map((m, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl text-xs space-y-1 ${
                        m.isInternal
                          ? 'bg-amber-50/70 border border-amber-200/80 text-amber-950 ml-6'
                          : 'bg-slate-50 border border-slate-200 text-navy-700'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] opacity-80">
                        <span className="font-bold">
                          {m.sender} ({m.senderRole}) {m.isInternal && '• INTERNAL NOTE'}
                        </span>
                        <span>{new Date(m.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{m.message}</p>
                    </div>
                  ))}
                </div>

                {/* Canned Replies */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-[11px]">
                    <span className="text-slate-400 font-semibold shrink-0">Canned:</span>
                    {cannedReplies.map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setReplyText(c)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg shrink-0 line-clamp-1 max-w-[200px]"
                        title={c}
                      >
                        {c}
                      </button>
                    ))}
                  </div>

                  {/* Input Box */}
                  <div className="space-y-2">
                    <textarea
                      rows={3}
                      placeholder={
                        isInternalNote
                          ? 'Type internal team note (hidden from customer)...'
                          : 'Type reply to customer...'
                      }
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="w-full px-3 py-2 border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-navy-500"
                    />

                    <div className="flex items-center justify-between">
                      <label className="flex items-center space-x-1.5 text-xs text-amber-800 cursor-pointer font-medium">
                        <input
                          type="checkbox"
                          checked={isInternalNote}
                          onChange={(e) => setIsInternalNote(e.target.checked)}
                          className="rounded text-amber-600"
                        />
                        <span>Post as Internal Staff Note</span>
                      </label>

                      <button
                        onClick={handleSendTicketMessage}
                        disabled={!replyText.trim()}
                        className="inline-flex items-center space-x-1.5 px-4 py-1.5 bg-navy-600 hover:bg-navy-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Send</span>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="m-auto text-center text-xs text-slate-400 py-16 space-y-2">
                <Headphones className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="font-semibold text-slate-600">Select a support ticket</p>
                <p>View conversation history, dispatch canned replies, or escalate to Tier 2.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Customer Lookup & Event Timeline */
        <div className="space-y-6">
          {/* Search Box */}
          <form
            onSubmit={handleSearchLookup}
            className="flex items-center space-x-2 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                placeholder="Lookup by customer phone (07...), order number, or M-Pesa receipt..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-500"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="px-4 py-2 bg-navy-600 text-white font-semibold rounded-xl text-xs hover:bg-navy-700"
            >
              {searching ? 'Searching...' : 'Search Telemetry'}
            </button>
          </form>

          {/* Results List */}
          {searchResults.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {searchResults.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSelectEntity(item)}
                  className={`p-4 bg-white border rounded-2xl shadow-xs cursor-pointer text-xs space-y-2 transition ${
                    activeEntity?.id === item.id ? 'border-navy-600 ring-2 ring-navy-100' : 'hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-navy-700">{item.type}</span>
                    <span className="text-[10px] text-navy-700 bg-navy-50 px-2 py-0.5 rounded-full font-mono">
                      {item.id.slice(-6)}
                    </span>
                  </div>
                  {item.type === 'USER' && (
                    <div>
                      <p className="font-bold">{item.data.name}</p>
                      <p className="font-mono text-slate-500">{item.data.phone}</p>
                    </div>
                  )}
                  {item.type === 'ORDER' && (
                    <div>
                      <p className="font-mono font-bold text-navy-700">{item.data.orderNumber}</p>
                      <p className="font-semibold">{formatKes(item.data.totalMinor)}</p>
                      <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-bold">{item.data.status}</span>
                    </div>
                  )}
                  {item.type === 'PAYMENT' && (
                    <div>
                      <p className="font-mono font-bold text-brand-700">{item.data.mpesaReceiptNumber || item.data.checkoutRequestId}</p>
                      <p className="font-semibold">{formatKes(item.data.amountMinor)}</p>
                      <span className="text-[10px] bg-brand-50 text-brand-800 px-1.5 py-0.5 rounded font-bold">
                        {item.data.status}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Selected Entity Timeline & Safe Actions */}
          {activeEntity && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Timeline */}
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-navy-800 flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-navy-600" />
                  <span>Audit & Operational Event Timeline: {activeEntity.type}</span>
                </h3>

                {loadingTimeline ? (
                  <p className="text-xs text-slate-400 py-8 text-center">Loading full event history...</p>
                ) : (
                  <div className="space-y-3 relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                    {timeline.map((event, idx) => (
                      <div key={idx} className="relative text-xs space-y-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-navy-600 absolute -left-[21px] top-1" />
                        <div className="flex items-center justify-between text-slate-400 text-[10px]">
                          <span className="font-bold text-slate-700">{event.type || event.action}</span>
                          <span>{new Date(event.timestamp).toLocaleString()}</span>
                        </div>
                        {event.actor && <p className="text-slate-500 text-[11px]">By: {event.actor} ({event.actorRole})</p>}
                        {event.details && (
                          <pre className="p-2 bg-slate-50 rounded-lg text-[10px] font-mono text-slate-600 overflow-x-auto">
                            {JSON.stringify(event.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                    {timeline.length === 0 && (
                      <p className="text-xs text-slate-400">No events recorded for this entity.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Safe Operational Actions & Notes */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3 text-xs">
                  <h4 className="font-bold text-navy-800">Authoritative Safe Actions</h4>
                  <p className="text-[11px] text-slate-400">All actions are logged in the immutable audit log</p>

                  <div className="space-y-2">
                    {activeEntity.type === 'ORDER' && (
                      <>
                        <button
                          onClick={() => handleResendReceipt(activeEntity.id)}
                          className="w-full py-2 px-3 rounded-xl bg-navy-50 text-navy-700 font-semibold hover:bg-navy-100 border border-navy-200 text-left flex items-center justify-between"
                        >
                          <span>Resend Digital Receipt</span>
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setShowReleaseModal(activeEntity.id)}
                          className="w-full py-2 px-3 rounded-xl bg-amber-50 text-amber-800 font-semibold hover:bg-amber-100 border border-amber-200 text-left flex items-center justify-between"
                        >
                          <span>Release Held Order</span>
                          <Unlock className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}

                    {activeEntity.type === 'PAYMENT' && (
                      <button
                        onClick={() => handleRequerySTK(activeEntity.id)}
                        className="w-full py-2 px-3 rounded-xl bg-brand-50 text-brand-800 font-semibold hover:bg-brand-100 border border-brand-200 text-left flex items-center justify-between"
                      >
                        <span>Requery STK Status from Daraja</span>
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {activeEntity.type === 'USER' && (
                      <button
                        onClick={() => handleResetPassword(activeEntity.id)}
                        className="w-full py-2 px-3 rounded-xl bg-rose-50 text-rose-800 font-semibold hover:bg-rose-100 border border-rose-200 text-left flex items-center justify-between"
                      >
                        <span>Reset Account Password</span>
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Attach Internal Note */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3 text-xs">
                  <h4 className="font-bold text-navy-800">Attach Internal Incident Note</h4>
                  <form onSubmit={handleAddNote} className="space-y-2">
                    <textarea
                      rows={3}
                      placeholder="Enter investigation note..."
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      className="w-full p-2 border rounded-xl text-xs"
                    />
                    <button
                      type="submit"
                      disabled={!newNote.trim()}
                      className="w-full py-1.5 bg-navy-800 text-white rounded-xl font-semibold disabled:opacity-50"
                    >
                      Attach Note to Audit Log
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: New Support Ticket */}
      {showNewTicketModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-navy-800">Open Customer Support Ticket</h3>
              <button onClick={() => setShowNewTicketModal(false)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleCreateTicket} className="space-y-3">
              <div>
                <label className="text-slate-500 block mb-1">Customer Phone Number *</label>
                <input
                  required
                  placeholder="07xxxxxxxx"
                  value={newTicketForm.customerPhone}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, customerPhone: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-xl"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Customer Name (Optional)</label>
                <input
                  placeholder="e.g. Mary Kamau"
                  value={newTicketForm.customerName}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, customerName: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-xl"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Priority & SLA Tier</label>
                <select
                  value={newTicketForm.priority}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, priority: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-xl bg-white"
                >
                  <option value="LOW">LOW (24 Hour SLA)</option>
                  <option value="MEDIUM">MEDIUM (12 Hour SLA)</option>
                  <option value="HIGH">HIGH (4 Hour SLA)</option>
                  <option value="URGENT">URGENT (2 Hour SLA)</option>
                </select>
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Subject *</label>
                <input
                  required
                  placeholder="e.g. STK Push timed out but funds deducted"
                  value={newTicketForm.subject}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, subject: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-xl"
                />
              </div>
              <div>
                <label className="text-slate-500 block mb-1">Description *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Details of the incident..."
                  value={newTicketForm.description}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, description: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-xl"
                />
              </div>
              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowNewTicketModal(false)}
                  className="px-3 py-1.5 rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700"
                >
                  Open Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Release Held Order */}
      {showReleaseModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-xs">
            <h3 className="font-bold text-base text-navy-800">Release Held Order</h3>
            <p className="text-slate-500">Provide an authoritative operational reason for releasing this order.</p>
            <textarea
              rows={3}
              placeholder="e.g. Verified by phone with store supervisor; customer presented secondary M-Pesa receipt."
              value={heldReason}
              onChange={(e) => setHeldReason(e.target.value)}
              className="w-full p-2 border rounded-xl text-xs"
            />
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowReleaseModal(null)}
                className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleReleaseHeldOrder(showReleaseModal)}
                disabled={!heldReason.trim()}
                className="px-4 py-1.5 bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 disabled:opacity-50"
              >
                Confirm Release
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
