import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from './api.js';

/** The shopper's in-store check-in, as returned by the server. */
export interface PresenceSessionInfo {
  id: string;
  storeId: string;
  trustTier: 1 | 2;
  presenceMethod: string;
  expiresAt: string;
  limits: { maxItems: number; maxBasketMinor: number }; // 0 means no limit
}

const PENDING_CODE_KEY = 'pendingEntryCode';
const DEVICE_ID_KEY = 'scango_device_id';
const START_IN_SCAN_GO_KEY = 'startInScanAndGo';

/** A random id for this browser, sent with check-in so the server can record which device started the session. */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `web_${crypto.randomUUID()}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'WEB_CLIENT';
  }
}

// The poster code is kept while the shopper signs in or registers, then used to finish checking in.
export function rememberEntryCode(code: string) {
  try {
    sessionStorage.setItem(PENDING_CODE_KEY, code);
  } catch {
    /* private mode: the shopper simply scans the poster again after signing in */
  }
}
export function clearEntryCode() {
  try {
    sessionStorage.removeItem(PENDING_CODE_KEY);
  } catch {
    /* ignore */
  }
}
/** Where to send the shopper after signing in: back to check-in if they arrived from a poster, otherwise the app. */
export function postLoginPath(): string {
  try {
    const code = sessionStorage.getItem(PENDING_CODE_KEY);
    if (code) return `/enter?p=${encodeURIComponent(code)}`;
  } catch {
    /* ignore */
  }
  return '/app';
}

export function markStartInScanAndGo() {
  try {
    sessionStorage.setItem(START_IN_SCAN_GO_KEY, '1');
  } catch {
    /* ignore */
  }
}
/** True once after a successful check-in, so the shop screen opens on Scan & Go. */
export function consumeStartInScanAndGo(): boolean {
  try {
    const flag = sessionStorage.getItem(START_IN_SCAN_GO_KEY) === '1';
    if (flag) sessionStorage.removeItem(START_IN_SCAN_GO_KEY);
    return flag;
  } catch {
    return false;
  }
}

/**
 * One-time location reading used only to confirm the shopper is at the store. Resolves to null when location is
 * blocked or unavailable (the server can still accept the store Wi-Fi as the second signal).
 */
export function getGps(timeoutMs = 8000): Promise<{ lat: number; lng: number; accuracyM: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

/** Mirror of the server's limit check, so the shopper sees the problem before paying. */
export function presenceLimitMessage(
  session: PresenceSessionInfo | null,
  totals: { totalItems: number; totalMinor: number }
): string | null {
  if (!session) return null;
  const { maxItems, maxBasketMinor } = session.limits;
  if (maxItems > 0 && totals.totalItems > maxItems) {
    return `This check-in allows up to ${maxItems} items. Scan the main entrance poster for a larger basket, or remove some items.`;
  }
  if (maxBasketMinor > 0 && totals.totalMinor > maxBasketMinor) {
    return `This check-in allows up to KES ${(maxBasketMinor / 100).toLocaleString('en-KE')} per basket. Scan the main entrance poster for a larger basket, or remove some items.`;
  }
  return null;
}

/** The shopper's active check-in for a store. Pass undefined to skip the request. */
export function usePresenceSession(storeId: string | undefined) {
  const [session, setSession] = useState<PresenceSessionInfo | null>(null);
  const [enforced, setEnforced] = useState(true);
  const [loading, setLoading] = useState(Boolean(storeId));

  const refresh = useCallback(async () => {
    if (!storeId) {
      setSession(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest(`/presence/session?storeId=${encodeURIComponent(storeId)}`);
      setSession(res.session || null);
      setEnforced(res.enforced !== false);
    } catch {
      // Not a shopper account, or offline: treat as not checked in and keep requiring a poster scan.
      setSession(null);
      setEnforced(true);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { session, enforced, loading, refresh };
}
