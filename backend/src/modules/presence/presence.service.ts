import crypto from 'crypto';
import { Types } from 'mongoose';
import Store, { IStore, IPresenceTierPolicy } from '../stores/store.model.js';
import EntryPoint from './entry-point.model.js';
import StoreSession, { IStoreSession, PresenceMethod, SessionEndReason } from './store-session.model.js';
import Basket from '../baskets/basket.model.js';

/** Absolute ceiling on a session's life, however much the shopper keeps scanning. */
export const SESSION_HARD_CAP_HOURS = 12;
/** Minimum gap between expiry-extension writes for the same session. */
const TOUCH_THROTTLE_MS = 60 * 1000;

export class PresenceError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 403) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export interface ResolvedPresencePolicy {
  enforced: boolean;
  sessionTtlMinutes: number;
  maxGpsAccuracyMetres: number;
  tier1: IPresenceTierPolicy;
  tier2: IPresenceTierPolicy;
}

const DEFAULT_TIER1: IPresenceTierPolicy = { enabled: true, requireSoftSignal: true, maxBasketMinor: 0, maxItems: 0, auditPercentage: 5 };
const DEFAULT_TIER2: IPresenceTierPolicy = { enabled: true, requireSoftSignal: true, maxBasketMinor: 500000, maxItems: 20, auditPercentage: 20 };

function plain(value: any): any {
  return value && typeof value.toObject === 'function' ? value.toObject() : value || {};
}

/** Merge a store's stored policy over safe defaults so older stores without the field still behave. */
export function resolvePolicy(store: Pick<IStore, 'presencePolicy'> | any): ResolvedPresencePolicy {
  const p = plain(store?.presencePolicy);
  const ttl = Number(p.sessionTtlMinutes);
  return {
    // SCAN_GO_REQUIRE_CHECKIN=false switches the QR-poster check-in off for every store (demos, pilots, local testing).
    enforced: process.env.SCAN_GO_REQUIRE_CHECKIN === 'false' ? false : p.enforced !== false,
    sessionTtlMinutes: Math.min(240, Math.max(120, Number.isFinite(ttl) && ttl > 0 ? ttl : 180)),
    maxGpsAccuracyMetres: Number(p.maxGpsAccuracyMetres) > 0 ? Number(p.maxGpsAccuracyMetres) : 100,
    tier1: { ...DEFAULT_TIER1, ...plain(p.tier1) },
    tier2: { ...DEFAULT_TIER2, ...plain(p.tier2) },
  };
}

export function tierPolicy(policy: ResolvedPresencePolicy, tier: number): IPresenceTierPolicy {
  return tier === 1 ? policy.tier1 : policy.tier2;
}

// ---------------------------------------------------------------------------
// Poster codes. The QR on a poster is "<entryPointId>.<signature>". Rotating the store's entry secret
// makes every printed poster for that store fail verification at once.
// ---------------------------------------------------------------------------

function posterSignature(entryPointId: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`poster:${entryPointId}`).digest('base64url').slice(0, 22);
}

export function signPosterCode(entryPointId: string, secret: string): string {
  return `${entryPointId}.${posterSignature(entryPointId, secret)}`;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** Make sure the store has a signing secret (older stores were created before the field existed). */
export async function ensureEntrySecret(storeId: string | Types.ObjectId): Promise<string> {
  const store = await Store.findById(storeId).select('+entrySecret');
  if (!store) throw new PresenceError('STORE_NOT_FOUND', 'Store not found.', 404);
  if (store.entrySecret) return store.entrySecret;
  const secret = crypto.randomBytes(32).toString('hex');
  await Store.updateOne({ _id: storeId }, { $set: { entrySecret: secret } });
  return secret;
}

export async function rotateEntrySecret(storeId: string): Promise<void> {
  const secret = crypto.randomBytes(32).toString('hex');
  const result = await Store.updateOne({ _id: storeId }, { $set: { entrySecret: secret } });
  if (!result.matchedCount) throw new PresenceError('STORE_NOT_FOUND', 'Store not found.', 404);
}

/** Verify a scanned poster code and return the entry point and its store. Same error for every failure on purpose. */
export async function resolvePosterCode(code: unknown) {
  const invalid = () => new PresenceError('INVALID_ENTRY_CODE', 'This entry code is not valid. Scan the QR poster at the store entrance again.', 400);
  if (typeof code !== 'string' || code.length > 80) throw invalid();
  const [entryPointId, signature] = code.split('.');
  if (!entryPointId || !signature || !Types.ObjectId.isValid(entryPointId)) throw invalid();

  const entryPoint = await EntryPoint.findById(entryPointId);
  if (!entryPoint) throw invalid();
  const store = await Store.findById(entryPoint.storeId).select('+entrySecret +allowedPublicIps');
  if (!store || !store.entrySecret) throw invalid();

  const expected = posterSignature(entryPointId, store.entrySecret);
  if (!safeEqual(signature, expected)) throw invalid();

  if (!entryPoint.active) throw new PresenceError('ENTRY_POINT_REVOKED', 'This poster has been switched off. Ask a staff member for help.', 403);
  if (!store.active) throw new PresenceError('STORE_INACTIVE', 'This store is not open for Scan & Go right now.', 403);
  return { entryPoint, store };
}

// ---------------------------------------------------------------------------
// Soft signals
// ---------------------------------------------------------------------------

export interface GpsReading {
  lat: number;
  lng: number;
  accuracyM?: number;
}

export function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function normaliseIp(ip?: string | null): string {
  if (!ip) return '';
  const trimmed = ip.trim();
  return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
}

export function parseGps(raw: any): GpsReading | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  const accuracy = Number(raw.accuracyM);
  return { lat, lng, accuracyM: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : undefined };
}

export function evaluateSoftSignals(
  store: Pick<IStore, 'geo' | 'geoRadiusMetres' | 'allowedPublicIps'> | any,
  policy: ResolvedPresencePolicy,
  gps: GpsReading | undefined,
  requestIp: string | undefined
): { gps: boolean; wifi: boolean } {
  let gpsOk = false;
  const coords = store.geo?.coordinates;
  if (gps && Array.isArray(coords) && coords.length === 2) {
    const [storeLng, storeLat] = coords;
    const radius = store.geoRadiusMetres || 150;
    const accuracyOk = gps.accuracyM === undefined || gps.accuracyM <= policy.maxGpsAccuracyMetres;
    gpsOk = accuracyOk && haversineMetres(gps.lat, gps.lng, storeLat, storeLng) <= radius;
  }

  const ip = normaliseIp(requestIp);
  const allowed: string[] = (store.allowedPublicIps || []).map((x: string) => normaliseIp(x)).filter(Boolean);
  const wifiOk = !!ip && allowed.includes(ip);

  return { gps: gpsOk, wifi: wifiOk };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

async function expireStale(filter: Record<string, any>) {
  await StoreSession.updateMany(
    { ...filter, status: 'ACTIVE', expiresAt: { $lte: new Date() } },
    { $set: { status: 'ENDED', endedAt: new Date(), endReason: 'EXPIRED' } }
  );
}

/**
 * Record shopper activity on a session and slide its expiry forward.
 * expiresAt becomes now + ttlMinutes, capped at createdAt + SESSION_HARD_CAP_HOURS.
 * Writes are throttled to once per TOUCH_THROTTLE_MS per session, so a burst of
 * scans costs at most one write per minute. Safe to call for missing/ended
 * sessions — it is a no-op then.
 */
export async function touchSession(sessionId: string | Types.ObjectId): Promise<void> {
  try {
    const session = await StoreSession.findOne({ _id: sessionId, status: 'ACTIVE' })
      .select('ttlMinutes createdAt lastActivityAt expiresAt')
      .lean();
    if (!session) return;

    const now = new Date();
    const lastActivity = session.lastActivityAt ? new Date(session.lastActivityAt).getTime() : 0;
    if (now.getTime() - lastActivity < TOUCH_THROTTLE_MS) return;

    const ttlMinutes = session.ttlMinutes || 180;
    const hardCap = new Date(new Date(session.createdAt).getTime() + SESSION_HARD_CAP_HOURS * 60 * 60 * 1000);
    const sliding = new Date(now.getTime() + ttlMinutes * 60 * 1000);
    const expiresAt = sliding < hardCap ? sliding : hardCap;
    // Never shorten an expiry that is already later (e.g. created just now).
    const finalExpiry = expiresAt > new Date(session.expiresAt) ? expiresAt : session.expiresAt;

    await StoreSession.updateOne(
      { _id: sessionId, status: 'ACTIVE' },
      { $set: { lastActivityAt: now, expiresAt: finalExpiry }, $inc: { activityCount: 1 } }
    );
  } catch (error) {
    // Activity tracking must never break a scan.
    console.error('[presence] touchSession failed:', error);
  }
}

export interface StartSessionInput {
  userId: string;
  code: unknown;
  deviceId?: string;
  gps?: GpsReading;
  requestIp?: string;
}

export async function startSession(input: StartSessionInput): Promise<{ session: IStoreSession; store: IStore; entryPoint: any }> {
  const { entryPoint, store } = await resolvePosterCode(input.code);
  const policy = resolvePolicy(store);
  const tier = entryPoint.tier as 1 | 2;
  const tierRules = tierPolicy(policy, tier);

  if (!tierRules.enabled) {
    throw new PresenceError('TIER_DISABLED', 'This entry point is not enabled for this store.', 403);
  }

  const signals = evaluateSoftSignals(store, policy, input.gps, input.requestIp);
  const anySignal = signals.gps || signals.wifi;

  if (tierRules.requireSoftSignal && !anySignal) {
    const configured = !!store.geo?.coordinates?.length || (store.allowedPublicIps || []).length > 0;
    throw new PresenceError(
      configured ? 'SOFT_SIGNAL_REQUIRED' : 'PRESENCE_NOT_CONFIGURED',
      configured
        ? 'We could not confirm you are inside the store. Turn on location, or connect to the store Wi-Fi, then scan the poster again.'
        : 'This store has not finished setting up in-store check-in yet. Please ask a staff member.',
      403
    );
  }

  let method: PresenceMethod = 'STATIC_QR_ONLY';
  if (signals.wifi) method = 'STATIC_QR_WIFI';
  else if (signals.gps) method = 'STATIC_QR_GPS';

  // Ending the previous session first keeps the one-active-session-per-user rule, including across stores.
  await expireStale({ userId: input.userId });
  await StoreSession.updateMany(
    { userId: input.userId, status: 'ACTIVE' },
    { $set: { status: 'ENDED', endedAt: new Date(), endReason: 'REPLACED' } }
  );

  const session = await StoreSession.create({
    userId: input.userId,
    storeId: store._id,
    entryPointId: entryPoint._id,
    deviceId: (input.deviceId || 'WEB_CLIENT').slice(0, 80),
    trustTier: tier,
    presenceMethod: method,
    softSignals: signals,
    status: 'ACTIVE',
    ttlMinutes: policy.sessionTtlMinutes,
    lastActivityAt: new Date(),
    activityCount: 0,
    expiresAt: new Date(Date.now() + policy.sessionTtlMinutes * 60 * 1000),
  });

  return { session, store, entryPoint };
}

/** The user's active, unexpired session for a store, or null. Expired sessions are closed as a side effect. */
export async function getActiveSession(userId: string, storeId?: string): Promise<IStoreSession | null> {
  await expireStale({ userId });
  const filter: Record<string, any> = { userId, status: 'ACTIVE', expiresAt: { $gt: new Date() } };
  if (storeId) filter.storeId = storeId;
  const session = await StoreSession.findOne(filter);
  // Reading the session is shopper activity (the app polls this while in store);
  // keep the visit alive while they are actually using it.
  if (session) void touchSession(session._id);
  return session;
}

/**
 * The only legal transition out of ACTIVE is ENDED. The update is guarded on
 * status:'ACTIVE', so calling this twice (or racing with the janitor) is a
 * no-op the second time. Returns true when this call performed the transition.
 */
export async function transitionSession(
  sessionId: string | Types.ObjectId,
  reason: SessionEndReason,
  endedBy?: string
): Promise<boolean> {
  const result = await StoreSession.updateOne(
    { _id: sessionId, status: 'ACTIVE' },
    { $set: { status: 'ENDED', endedAt: new Date(), endReason: reason, ...(endedBy ? { endedBy } : {}) } }
  );
  return result.modifiedCount > 0;
}

export async function endSession(sessionId: string | Types.ObjectId, reason: SessionEndReason, endedBy?: string): Promise<void> {
  await transitionSession(sessionId, reason, endedBy);
}

/**
 * Expire every stale ACTIVE session and abandon the OPEN baskets that were
 * attached to them — a basket whose session died can never be scanned again,
 * so leaving it OPEN forever just litters the database. Runs in batches so a
 * backlog after downtime can't lock the collection.
 */
export async function sweepExpiredSessions(batchSize = 500): Promise<{ expired: number; basketsAbandoned: number }> {
  const stale = await StoreSession.find({ status: 'ACTIVE', expiresAt: { $lte: new Date() } })
    .select('_id')
    .limit(batchSize)
    .lean();
  if (!stale.length) return { expired: 0, basketsAbandoned: 0 };

  const ids = stale.map((s) => s._id);
  const result = await StoreSession.updateMany(
    { _id: { $in: ids }, status: 'ACTIVE' },
    { $set: { status: 'ENDED', endedAt: new Date(), endReason: 'EXPIRED' } }
  );
  const baskets = await Basket.updateMany(
    { storeSessionId: { $in: ids }, status: 'OPEN' },
    { $set: { status: 'ABANDONED' } }
  );
  return { expired: result.modifiedCount, basketsAbandoned: baskets.modifiedCount };
}

/** Periodic janitor: closes expired sessions even when nobody touches them. */
export function startPresenceJanitor(intervalMs = 60 * 1000): void {
  const tick = () => {
    sweepExpiredSessions()
      .then(({ expired, basketsAbandoned }) => {
        if (expired || basketsAbandoned) {
          console.log(`[presence] janitor expired ${expired} session(s), abandoned ${basketsAbandoned} basket(s)`);
        }
      })
      .catch((error) => console.error('[presence] janitor failed:', error));
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
}

/** Called when an order leaves the store. Safe to call more than once and for orders with no session. */
export async function endSessionForOrder(order: { storeSessionId?: any } | null | undefined): Promise<void> {
  if (!order?.storeSessionId) return;
  try {
    await endSession(order.storeSessionId, 'PAID_AND_EXITED');
  } catch (error) {
    console.error('[presence] could not end store session after exit:', error);
  }
}

// ---------------------------------------------------------------------------
// Basket limits for the session's tier
// ---------------------------------------------------------------------------

/** Returns an error message if the basket would exceed the tier's limits, otherwise null. */
export function checkTierLimits(
  policy: ResolvedPresencePolicy,
  tier: number | undefined,
  totals: { totalMinor: number; totalItems: number }
): string | null {
  if (!tier) return null; // basket created before presence was enforced
  const rules = tierPolicy(policy, tier);
  if (rules.maxItems > 0 && totals.totalItems > rules.maxItems) {
    return `Scan & Go from this entry point is limited to ${rules.maxItems} items. Scan the main entrance poster for a larger basket, or finish this basket and start another.`;
  }
  if (rules.maxBasketMinor > 0 && totals.totalMinor > rules.maxBasketMinor) {
    return `Scan & Go from this entry point is limited to KES ${(rules.maxBasketMinor / 100).toLocaleString('en-KE')} per basket. Scan the main entrance poster for a larger basket, or finish this basket and start another.`;
  }
  return null;
}
