import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../../config/environment.js';
import { sendCustomerPush } from '../../modules/notifications/push.service.js';

export interface SseClient {
  id: string;
  res: Response;
  userId?: string;
  role?: string;
  storeId?: string;
}

export interface StreamEvent {
  type:
    | 'order.created'
    | 'order.expired'
    | 'order.paid'
    | 'picking.started'
    | 'substitution.requested'
    | 'substitution.responded'
    | 'order.ready'
    | 'order.collected'
    | 'exit.scanned'
    | 'exit.cleared'
    | 'exit.flagged'
    | 'amber.overtime'
    | 'discrepancy.escalated'
    | 'store.config_updated'
    | 'approval.created'
    | 'stock.adjusted';
  payload: any;
  storeId?: string;
  targetRoles?: string[];
  targetUserId?: string;
}

const clients = new Map<string, SseClient>();

/**
 * Handle new SSE connection from any portal (Customer, Picker, Exit, Supervisor, Admin).
 * Authenticates via ?token=... query parameter or Authorization header.
 */
export function handleSseConnection(req: Request, res: Response) {
  let token = req.query.token as string | undefined;
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // SECURITY: the live stream carries order, payment and pickup data, so it is never open to
  // anonymous clients. A missing/invalid/expired token is rejected (the browser's EventSource
  // will retry, and the frontend sends a fresh token on every reconnect).
  let userId: string | undefined;
  let role: string | undefined;
  let storeId: string | undefined;

  if (token) {
    try {
      const decoded: any = jwt.verify(token, ENV.JWT_SECRET);
      userId = decoded.id;
      role = decoded.role;
      storeId = decoded.storeId;
    } catch {
      userId = undefined;
    }
  }

  if (!userId) {
    res.status(401).json({ success: false, error: 'Authentication required for the live event stream.' });
    return;
  }

  // Set SSE Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });

  const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const client: SseClient = { id: clientId, res, userId, role, storeId };
  clients.set(clientId, client);

  // Send initial connection handshake
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId, timestamp: new Date() })}\n\n`);

  req.on('close', () => {
    clients.delete(clientId);
  });
}

/**
 * Broadcast an event to relevant connected clients across portals.
 */
export function broadcastEvent(event: StreamEvent) {
  if (event.targetUserId) {
    const pushPayload = { orderId: event.payload?.orderId, orderNumber: event.payload?.orderNumber, orderType: event.payload?.orderType };
    void sendCustomerPush(event.targetUserId, event.type, pushPayload).catch(error => {
      console.warn('[Push] Customer notification could not be delivered:', error?.message || error);
    });
  }
  const data = JSON.stringify({
    type: event.type,
    payload: event.payload,
    timestamp: new Date().toISOString(),
  });

  const message = `event: ${event.type}\ndata: ${data}\n\n`;

  for (const [, client] of clients) {
    // 0. Never deliver to a connection we could not identify.
    if (!client.userId) continue;

    // 1. Customers only receive events addressed to them personally. Store-wide or role-wide
    //    events (other shoppers' orders, payments, exit scans) must never reach a customer.
    if (client.role === 'CUSTOMER') {
      if (!event.targetUserId || event.targetUserId !== client.userId) continue;
    } else {
      // 2. Direct user targeting for staff clients
      if (event.targetUserId && client.userId !== event.targetUserId) {
        continue;
      }

      // 3. Role targeting
      if (event.targetRoles && event.targetRoles.length > 0 && client.role) {
        if (!event.targetRoles.includes(client.role) && client.role !== 'SYSTEM_ADMIN') {
          continue;
        }
      }

      // 4. Store targeting (SYSTEM_ADMIN always receives, staff must match storeId)
      if (event.storeId && client.storeId && client.role !== 'SYSTEM_ADMIN') {
        if (client.storeId !== event.storeId) {
          continue;
        }
      }
    }

    try {
      client.res.write(message);
    } catch {
      // Client disconnected
    }
  }
}

// Keep-alive heartbeat ping every 25 seconds
setInterval(() => {
  for (const [id, client] of clients) {
    try {
      client.res.write(': ping\n\n');
    } catch {
      clients.delete(id);
    }
  }
}, 25000);
