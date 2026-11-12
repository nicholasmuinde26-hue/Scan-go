import { Router, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import SupportTicket from './ticket.model.js';
import Order from '../orders/order.model.js';
import { authenticate, AuthRequest } from '../../middleware/auth.js';

/**
 * Customer help desk: a signed-in CUSTOMER can open tickets and chat on their OWN tickets only.
 * Mounted at /api/v1/support/my. Staff use /api/v1/support and /api/v1/platform/tickets.
 */
const router = Router();

router.use(authenticate);
router.use((req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'CUSTOMER') {
    res.status(403).json({ success: false, error: 'This help desk is for customer accounts.' });
    return;
  }
  next();
});

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many support requests. Please try again later.' },
});

const MAX_OPEN_TICKETS = 5;

// Never expose staff-internal notes or internal routing fields to the customer.
function toCustomerView(t: any) {
  return {
    _id: t._id,
    ticketNumber: t.ticketNumber,
    subject: t.subject,
    description: t.description,
    status: t.status,
    orderId: t.orderId,
    assignedAgentName: t.assignedAgentName,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    messages: (t.messages || [])
      .filter((m: any) => !m.isInternal)
      .map((m: any) => ({
        sender: m.senderRole === 'CUSTOMER' ? 'You' : m.sender,
        fromCustomer: m.senderRole === 'CUSTOMER',
        message: m.message,
        createdAt: m.createdAt,
      })),
  };
}

// GET /api/v1/support/my/tickets
router.get('/tickets', async (req: AuthRequest, res: Response) => {
  try {
    const tickets = await SupportTicket.find({ customerId: req.user!.id }).sort({ updatedAt: -1 }).limit(50).lean();
    res.json({ success: true, tickets: tickets.map(toCustomerView) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Could not load your tickets.' });
  }
});

// POST /api/v1/support/my/tickets  { subject, description, orderId? }
router.post('/tickets', createLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const subject = String(req.body.subject || '').trim();
    const description = String(req.body.description || '').trim();
    const orderId = req.body.orderId ? String(req.body.orderId) : undefined;

    if (subject.length < 3 || subject.length > 120) {
      res.status(400).json({ success: false, error: 'Subject must be 3-120 characters.' });
      return;
    }
    if (description.length < 10 || description.length > 2000) {
      res.status(400).json({ success: false, error: 'Please describe the problem in 10-2000 characters.' });
      return;
    }

    if (orderId) {
      if (!mongoose.isValidObjectId(orderId)) {
        res.status(400).json({ success: false, error: 'Invalid order.' });
        return;
      }
      const owned = await Order.exists({ _id: orderId, customerId: req.user!.id });
      if (!owned) {
        res.status(404).json({ success: false, error: 'Order not found.' });
        return;
      }
    }

    const openCount = await SupportTicket.countDocuments({
      customerId: req.user!.id,
      status: { $in: ['OPEN', 'IN_PROGRESS'] },
    });
    if (openCount >= MAX_OPEN_TICKETS) {
      res.status(429).json({
        success: false,
        error: `You already have ${MAX_OPEN_TICKETS} open tickets. Please wait for a reply or add to an existing ticket.`,
      });
      return;
    }

    const slaExpiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // MEDIUM priority = 12h

    // ticketNumber is unique; retry if two tickets are created at the same moment.
    let ticket: any = null;
    let base = await SupportTicket.countDocuments();
    for (let attempt = 0; attempt < 5 && !ticket; attempt++) {
      try {
        ticket = await SupportTicket.create({
          ticketNumber: `TICK-${1000 + base + 1 + attempt}`,
          customerId: req.user!.id,
          customerPhone: req.user!.phone,
          customerName: req.user!.name,
          orderId,
          subject,
          description,
          priority: 'MEDIUM',
          status: 'OPEN',
          tier: 'TIER_1',
          slaExpiresAt,
          messages: [
            { sender: req.user!.name, senderRole: 'CUSTOMER', message: description, isInternal: false, createdAt: new Date() },
          ],
        });
      } catch (e: any) {
        if (e?.code !== 11000) throw e;
      }
    }
    if (!ticket) {
      res.status(503).json({ success: false, error: 'Could not create the ticket. Please try again.' });
      return;
    }

    res.status(201).json({ success: true, ticket: toCustomerView(ticket.toObject()) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Could not create the ticket.' });
  }
});

// POST /api/v1/support/my/tickets/:id/messages  { message }
router.post('/tickets/:id/messages', async (req: AuthRequest, res: Response) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(404).json({ success: false, error: 'Ticket not found.' });
      return;
    }
    const message = String(req.body.message || '').trim();
    if (message.length < 1 || message.length > 2000) {
      res.status(400).json({ success: false, error: 'Message must be 1-2000 characters.' });
      return;
    }

    // Ownership is part of the query, so another customer's ticket is simply "not found".
    const ticket = await SupportTicket.findOne({ _id: req.params.id, customerId: req.user!.id });
    if (!ticket) {
      res.status(404).json({ success: false, error: 'Ticket not found.' });
      return;
    }
    if (ticket.status === 'CLOSED') {
      res.status(400).json({ success: false, error: 'This ticket is closed. Please open a new one.' });
      return;
    }

    ticket.messages.push({
      sender: req.user!.name,
      senderRole: 'CUSTOMER',
      message,
      isInternal: false,
      createdAt: new Date(),
    });
    if (ticket.status === 'RESOLVED') ticket.status = 'OPEN'; // customer replied: reopen
    await ticket.save();

    res.json({ success: true, ticket: toCustomerView(ticket.toObject()) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Could not send your message.' });
  }
});

export default router;