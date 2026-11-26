import { Types } from 'mongoose';
import RetailDevice from './device.model.js';
import DeviceEvent, { DeviceEventType } from './device-event.model.js';
import StoreSession from '../presence/store-session.model.js';
import Basket from '../baskets/basket.model.js';
import Store from '../stores/store.model.js';
import { resolvePolicy } from '../presence/presence.service.js';
import { applyProductScan, BasketOpError, recalculateBasket } from '../baskets/basket.service.js';
import { checkSubscriptionGate } from '../subscriptions/subscription.service.js';
import { broadcastEvent } from '../../shared/utils/eventStream.js';

/**
 * Single ingestion path for device events, shared by the HTTPS gateway
 * (POST /api/v1/devices/events) and the MQTT transport. Every event is logged
 * to DeviceEvent exactly once (deviceId+eventId unique) and applied to the
 * same basket engine the customer app uses.
 */

const EVENT_TYPES = new Set<DeviceEventType>([
  'HEARTBEAT', 'BASKET_BOUND', 'BASKET_UNBOUND', 'PRODUCT_SCAN', 'ITEM_REMOVED',
  'QUANTITY_CHANGE', 'WEIGHT_READING', 'RFID_READ', 'CAMERA_OBSERVATION', 'SCALE_LABEL', 'ERROR',
]);

export interface DeviceEventInput {
  eventId?: string;
  type?: string;
  occurredAt?: string;
  sessionId?: string;
  basketId?: string;
  payload?: Record<string, any>;
}

export interface IngestResult {
  httpStatus: number;
  body: Record<string, any>;
}

async function resolveSessionForDevice(device: any, sessionId: string | undefined) {
  if (!sessionId || !Types.ObjectId.isValid(sessionId)) return null;
  return StoreSession.findOne({
    _id: sessionId,
    storeId: device.storeId,
    status: 'ACTIVE',
    expiresAt: { $gt: new Date() },
  });
}

async function resolveOpenBasketForSession(session: any, deviceId?: string) {
  let basket = await Basket.findOne({ storeSessionId: session._id, status: 'OPEN' });
  if (!basket) {
    basket = await Basket.create({
      customerId: session.userId,
      storeId: session.storeId,
      deviceId: deviceId || 'DEVICE_GATEWAY',
      status: 'OPEN',
      items: [],
      storeSessionId: session._id,
      trustTier: session.trustTier,
      presenceMethod: session.presenceMethod,
    });
  }
  return basket;
}

async function resolveBasketForEvent(device: any, basketId: any, sessionId: any) {
  if (basketId && Types.ObjectId.isValid(String(basketId))) {
    const basket = await Basket.findById(basketId);
    if (basket && basket.storeId.toString() === device.storeId.toString() && basket.status === 'OPEN') return basket;
  }
  const session = await resolveSessionForDevice(device, sessionId ? String(sessionId) : undefined);
  if (session) return resolveOpenBasketForSession(session, device.deviceId);
  return null;
}

function broadcastDeviceEvent(device: any, event: any, result: any) {
  broadcastEvent({
    type: 'device.event',
    payload: {
      eventId: event.eventId,
      deviceId: device.deviceId,
      deviceKind: device.kind,
      eventType: event.type,
      basketId: event.basketId,
      sessionId: event.sessionId,
      status: event.status,
      applied: result?.applied,
      totals: result?.totals,
      riskSignal: result?.riskSignal,
    },
    storeId: device.storeId.toString(),
    targetRoles: ['SUPERVISOR', 'STORE_MANAGER', 'EXIT_STAFF', 'BRANCH_MANAGER'],
  });
}

/** Apply one event for an already-authenticated device. Never throws for bad input. */
export async function ingestDeviceEvent(device: any, input: DeviceEventInput): Promise<IngestResult> {
  const { eventId, type, occurredAt, sessionId, basketId, payload } = input || {};
  if (!eventId || !type || !EVENT_TYPES.has(type as DeviceEventType)) {
    return { httpStatus: 400, body: { success: false, error: 'eventId and a valid type are required.' } };
  }

  // Idempotent ingestion — a retried scan over a flaky network applies once.
  const existing = await DeviceEvent.findOne({ deviceId: device.deviceId, eventId: String(eventId) });
  if (existing) {
    return { httpStatus: 200, body: { success: true, duplicate: true, status: existing.status, result: existing.result } };
  }

  const event = await DeviceEvent.create({
    eventId: String(eventId),
    deviceId: device.deviceId,
    storeId: device.storeId,
    type,
    sessionId: sessionId && Types.ObjectId.isValid(sessionId) ? sessionId : undefined,
    basketId: basketId && Types.ObjectId.isValid(basketId) ? basketId : undefined,
    payload: payload || {},
    occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
    status: 'RECEIVED',
  });

  device.lastSeenAt = new Date();
  if (payload?.firmwareVersion) device.firmwareVersion = String(payload.firmwareVersion);
  await device.save();

  const result: Record<string, any> = { applied: false };
  let eventStatus: 'APPLIED' | 'REJECTED' = 'REJECTED';

  try {
    switch (type as DeviceEventType) {
      case 'HEARTBEAT':
        result.applied = true;
        eventStatus = 'APPLIED';
        break;

      case 'BASKET_BOUND': {
        const session = await resolveSessionForDevice(device, sessionId);
        if (!session) throw new BasketOpError(403, 'No active shopping session for this store.', { code: 'SESSION_INVALID' });
        const basket = await resolveOpenBasketForSession(session, device.deviceId);
        basket.deviceId = device.deviceId;
        await basket.save();
        device.boundBasketId = basket._id as any;
        event.basketId = basket._id as any;
        event.sessionId = session._id as any;
        result.applied = true;
        result.basketId = basket._id;
        result.totals = { totalMinor: basket.totalMinor, totalItems: basket.totalItems };
        eventStatus = 'APPLIED';
        break;
      }

      case 'BASKET_UNBOUND': {
        if (device.boundBasketId) {
          await Basket.updateOne({ _id: device.boundBasketId, deviceId: device.deviceId }, { $set: { deviceId: 'UNBOUND' } });
          device.boundBasketId = undefined;
        }
        result.applied = true;
        eventStatus = 'APPLIED';
        break;
      }

      case 'PRODUCT_SCAN': {
        const session = await resolveSessionForDevice(device, sessionId || String(event.sessionId || ''));
        if (!session) throw new BasketOpError(403, 'No active shopping session for this store.', { code: 'SESSION_INVALID' });
        const basket = await resolveOpenBasketForSession(session, device.deviceId);
        const store = await Store.findById(device.storeId).select('organizationId presencePolicy');
        if (store?.organizationId) {
          const gate = await checkSubscriptionGate(store.organizationId.toString(), 'scan_and_go');
          if (!gate.allowed) {
            throw new BasketOpError(gate.status || 402, gate.reason || 'Subscription is not active for this store.', { code: gate.code || 'SUBSCRIPTION_BLOCKED' });
          }
        }
        const policy = resolvePolicy(store);
        const scan = await applyProductScan(
          basket,
          { barcode: payload?.barcode, quantity: payload?.quantity ?? 1, isManualEntry: !!payload?.isManualEntry, tagSerial: payload?.tagSerial },
          policy,
          { source: device.kind, deviceId: device.deviceId },
        );
        event.basketId = basket._id as any;
        event.sessionId = session._id as any;
        device.boundBasketId = basket._id as any;
        result.applied = true;
        result.kind = scan.kind;
        result.product = { name: scan.product?.name, barcode: scan.product?.barcode, priceMinor: scan.product?.priceMinor };
        result.verification = scan.verification;
        result.totals = { totalMinor: basket.totalMinor, totalItems: basket.totalItems, expectedWeightGrams: basket.expectedWeightGrams };
        eventStatus = 'APPLIED';
        break;
      }

      case 'QUANTITY_CHANGE':
      case 'ITEM_REMOVED': {
        const basket = await resolveBasketForEvent(device, basketId || event.basketId, sessionId);
        if (!basket) throw new BasketOpError(404, 'No open basket for this device/session.', { code: 'BASKET_NOT_FOUND' });
        const barcode = String(payload?.barcode || '').trim();
        const itemIndex = basket.items.findIndex((i: any) => i.barcode === barcode || String(i.productId) === String(payload?.productId));
        if (itemIndex === -1) throw new BasketOpError(404, 'Item not found in basket.', { code: 'ITEM_NOT_FOUND' });
        const item = basket.items[itemIndex] as any;
        if (type === 'ITEM_REMOVED') {
          basket.removalCount += 1;
          basket.events.push({ eventType: 'REMOVAL', productId: item.productId, barcode: item.barcode, timestamp: new Date(), details: `Removed via ${device.kind} ${device.deviceId}.` });
          basket.items.splice(itemIndex, 1);
        } else {
          const newQty = Number(payload?.quantity);
          if (!Number.isInteger(newQty) || newQty < 1) throw new BasketOpError(400, 'quantity must be a positive integer.');
          if (newQty < item.quantity) basket.removalCount += item.quantity - newQty;
          item.quantity = newQty;
          basket.events.push({ eventType: 'QUANTITY_CHANGE', productId: item.productId, barcode: item.barcode, quantity: newQty, timestamp: new Date(), details: `Quantity changed via ${device.kind} ${device.deviceId}.` });
        }
        recalculateBasket(basket);
        await basket.save();
        result.applied = true;
        result.totals = { totalMinor: basket.totalMinor, totalItems: basket.totalItems };
        eventStatus = 'APPLIED';
        break;
      }

      case 'WEIGHT_READING': {
        const basket = await resolveBasketForEvent(device, basketId || event.basketId, sessionId);
        const weightGrams = Number(payload?.weightGrams);
        if (!Number.isFinite(weightGrams) || weightGrams < 0) throw new BasketOpError(400, 'weightGrams must be a non-negative number.');
        const expected = basket?.expectedWeightGrams ?? null;
        const tolerance = Number(payload?.toleranceGrams ?? 250);
        const delta = expected !== null ? weightGrams - expected : null;
        result.applied = true;
        result.weightCheck = {
          measuredGrams: weightGrams,
          expectedGrams: expected,
          deltaGrams: delta,
          withinTolerance: delta === null ? null : Math.abs(delta) <= tolerance,
        };
        // Weight is evidence for risk scoring, never an accusation.
        if (delta !== null && Math.abs(delta) > tolerance) {
          result.riskSignal = 'WEIGHT_ANOMALY';
        }
        eventStatus = 'APPLIED';
        break;
      }

      case 'RFID_READ': {
        const serials = Array.isArray(payload?.serials) ? payload.serials.map(String) : [];
        const basket = await resolveBasketForEvent(device, basketId || event.basketId, sessionId);
        const expectedTagSerials = (basket?.items || []).map((i: any) => i.tagSerial).filter(Boolean);
        const matched = serials.filter((s: string) => expectedTagSerials.includes(s));
        const unexpected = serials.filter((s: string) => !expectedTagSerials.includes(s));
        const missing = expectedTagSerials.filter((s: string) => !serials.includes(s));
        result.applied = true;
        result.rfid = { matched: matched.length, unexpected: unexpected.length, missingPaidTags: missing.length, serialsRead: serials.length };
        if (unexpected.length || missing.length) result.riskSignal = 'RFID_MISMATCH';
        eventStatus = 'APPLIED';
        break;
      }

      case 'CAMERA_OBSERVATION':
      case 'SCALE_LABEL':
      case 'ERROR':
      default:
        // Recorded for the AI/exit pipeline; nothing to apply server-side yet.
        result.applied = true;
        result.note = 'Event recorded for downstream verification.';
        eventStatus = 'APPLIED';
        break;
    }
  } catch (error: any) {
    result.error = error instanceof BasketOpError ? error.message : error?.message || 'Event rejected.';
    if (error instanceof BasketOpError) {
      result.code = error.code;
      Object.assign(result, error.data || {});
    }
    event.status = 'REJECTED';
    event.result = result;
    await event.save();
    broadcastDeviceEvent(device, event, result);
    return { httpStatus: 202, body: { success: false, eventId: event.eventId, ...result } };
  }

  event.status = eventStatus;
  event.result = result;
  await event.save();
  await device.save();
  broadcastDeviceEvent(device, event, result);

  return { httpStatus: 202, body: { success: true, eventId: event.eventId, status: eventStatus, ...result } };
}

/** Load an ACTIVE device by its public id (MQTT path resolves identity from the topic). */
export async function findActiveDevice(deviceId: string) {
  if (!deviceId) return null;
  return RetailDevice.findOne({ deviceId, status: 'ACTIVE' });
}
