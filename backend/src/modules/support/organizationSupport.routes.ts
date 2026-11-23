import { Router, Response } from 'express';
import SupportTicket from './ticket.model.js';
import Store from '../stores/store.model.js';
import AuditLog from '../audits/audit.model.js';
import { authenticate, canAccessStore, canAccessOrganization, AuthRequest } from '../../middleware/auth.js';

const router = Router();
router.use(authenticate);

const handle = (fn: (req: AuthRequest, res: Response) => Promise<any>) => (req: AuthRequest, res: Response) =>
  fn(req, res).catch((e: any) => res.status(e.status || 500).json({ success: false, error: e.message }));

const fail = (status: number, message: string) => Object.assign(new Error(message), { status });

// Any staff member of the organization may raise a ticket; the ticket is pinned to
// their organization and (when given) one of their accessible branches.
async function resolveScope(req: AuthRequest, storeId?: string) {
  const u = req.user!;
  const organizationId = u.organizationId;
  if (!organizationId) throw fail(403, 'Your account is not attached to a supermarket.');
  if (!canAccessOrganization(u, organizationId)) throw fail(403, 'Forbidden.');
  if (storeId) {
    if (!(await canAccessStore(u, storeId))) throw fail(403, 'That branch is outside your scope.');
    const store = await Store.findById(storeId).select('organizationId');
    if (!store || store.organizationId?.toString() !== organizationId) throw fail(400, 'Branch does not belong to your supermarket.');
  }
  return { organizationId, storeId };
}

// Tickets raised by this organization (optionally filtered by branch/status).
router.get('/tickets', handle(async (req: AuthRequest, res) => {
  const { organizationId, storeId } = await resolveScope(req);
  const filter: any = { organizationId, source: { $ne: 'PLATFORM' } };
  if (storeId) filter.storeId = storeId;
  if (req.query.storeId) {
    if (!(await canAccessStore(req.user!, String(req.query.storeId)))) throw fail(403, 'That branch is outside your scope.');
    filter.storeId = req.query.storeId;
  }
  if (req.query.status) filter.status = req.query.status;
  const tickets = await SupportTicket.find(filter)
    .select('-messages.isInternal')
    .sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, tickets });
}));

router.post('/tickets', handle(async (req: AuthRequest, res) => {
  const { subject, description, storeId, priority = 'MEDIUM' } = req.body;
  if (!subject || !description) throw fail(400, 'Subject and description are required.');
  const { organizationId } = await resolveScope(req, storeId ? String(storeId) : undefined);

  const count = await SupportTicket.countDocuments();
  const ticketNumber = `TICK-${1000 + count + 1}`;
  const slaHours = priority === 'URGENT' ? 2 : priority === 'HIGH' ? 4 : priority === 'MEDIUM' ? 12 : 24;

  const ticket = await SupportTicket.create({
    ticketNumber,
    source: 'STAFF',
    organizationId,
    storeId: storeId || undefined,
    raisedBy: req.user!.id,
    raisedByName: req.user!.name,
    customerPhone: req.user!.phone,
    customerName: req.user!.name,
    subject: String(subject).trim(),
    description: String(description).trim(),
    priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority) ? priority : 'MEDIUM',
    status: 'OPEN',
    tier: 'TIER_1',
    slaExpiresAt: new Date(Date.now() + slaHours * 60 * 60 * 1000),
    messages: [{
      sender: req.user!.name,
      senderRole: req.user!.role,
      message: String(description).trim(),
      isInternal: false,
      createdAt: new Date(),
    }],
  });

  await AuditLog.create({
    actorId: req.user!.id, actorRole: req.user?.role, actorName: req.user?.name,
    action: 'RAISE_SUPPORT_TICKET', entityType: 'SYSTEM', entityId: ticket._id.toString(),
    storeId: ticket.storeId, newValue: { ticketNumber, organizationId },
    reason: 'Organization support ticket raised',
  });
  res.status(201).json({ success: true, ticket });
}));

router.get('/tickets/:id', handle(async (req: AuthRequest, res) => {
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket || !ticket.organizationId || !canAccessOrganization(req.user!, ticket.organizationId.toString())) {
    return res.status(404).json({ success: false, error: 'Ticket not found.' });
  }
  // Strip internal agent notes before returning to the organization.
  const obj = ticket.toObject() as any;
  obj.messages = (obj.messages || []).filter((m: any) => !m.isInternal);
  res.json({ success: true, ticket: obj });
}));

// Organization replies to its own ticket (visible to support, never internal).
router.post('/tickets/:id/messages', handle(async (req: AuthRequest, res) => {
  const { message } = req.body;
  if (!message) throw fail(400, 'Message is required.');
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket || !ticket.organizationId || !canAccessOrganization(req.user!, ticket.organizationId.toString())) {
    return res.status(404).json({ success: false, error: 'Ticket not found.' });
  }
  if (['RESOLVED', 'CLOSED'].includes(ticket.status)) {
    return res.status(409).json({ success: false, error: `Ticket is ${ticket.status}; reopen it via support first.` });
  }
  ticket.messages.push({
    sender: req.user!.name,
    senderRole: req.user!.role,
    message: String(message).trim(),
    isInternal: false,
    createdAt: new Date(),
  });
  if (ticket.status === 'WAITING_CUSTOMER' || ticket.status === 'ASSIGNED') ticket.status = 'IN_PROGRESS';
  await ticket.save();
  res.json({ success: true, ticket });
}));

export default router;
