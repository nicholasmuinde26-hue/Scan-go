export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || '/api/v1';

// Unified token storage key: 'scango_access_token'
const TOKEN_STORAGE_KEY = 'scango_access_token';
const REFRESH_TOKEN_KEY = 'scango_refresh_token';
// Pre-rebrand key; migrated once so signed-in users are not logged out.
const LEGACY_TOKEN_KEYS = ['tusk_access_token', 'tusk_token', 'scan_and_go_token'];

function loadInitialToken(): string {
  const current = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (current) return current;
  for (const key of LEGACY_TOKEN_KEYS) {
    const legacy = localStorage.getItem(key);
    if (legacy) {
      localStorage.setItem(TOKEN_STORAGE_KEY, legacy);
      LEGACY_TOKEN_KEYS.forEach((k) => localStorage.removeItem(k));
      return legacy;
    }
  }
  return '';
}

let authToken = loadInitialToken();

export function setToken(token: string) {
  authToken = token;
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function getToken(): string {
  return authToken;
}

export function getRefreshToken(): string {
  return localStorage.getItem(REFRESH_TOKEN_KEY) || '';
}
function setRefreshToken(token: string) {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function clearToken() {
  authToken = '';
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  // Also clear legacy keys
  LEGACY_TOKEN_KEYS.forEach((k) => localStorage.removeItem(k));
}

function jwtExpiresAt(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

// Single in-flight refresh: parallel 401s must share one rotation, otherwise
// the first success invalidates the refresh token the others are still using.
let refreshPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const refreshToken = getRefreshToken();
        if (!refreshToken) {
          clearToken();
          return null;
        }
        const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ refreshToken }),
        });
        if (!refreshRes.ok) {
          clearToken();
          return null;
        }
        const refreshData = await refreshRes.json();
        if (!refreshData?.token) {
          clearToken();
          return null;
        }
        setToken(refreshData.token);
        if (refreshData.refreshToken) setRefreshToken(refreshData.refreshToken);
        return refreshData.token as string;
      } catch {
        clearToken();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

export async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  // Proactively refresh an expired/expiring token so requests don't 401 at all.
  if (authToken && jwtExpiresAt(authToken) - Date.now() < 60_000) {
    await refreshAccessToken();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  // Include credentials for httpOnly session cookies
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // If 401 Unauthorized and not already calling refresh or login, attempt silent refresh
  if (res.status === 401 && !endpoint.startsWith('/auth/login') && !endpoint.startsWith('/auth/refresh')) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      // Retry original request
      const retryRes = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include',
      });
      const retryData = await retryRes.json();
      if (!retryRes.ok) {
        // A freshly-minted token was still rejected — the session is dead.
        // Clear it and notify the app so it returns to login instead of looping.
        if (retryRes.status === 401) {
          clearToken();
          window.dispatchEvent(new Event('scango:session-expired'));
        }
        const error: any = new Error(retryData.error || retryData.message || 'API request failed');
        error.data = retryData;
        error.status = retryRes.status;
        throw error;
      }
      return retryData;
    }
  }

  const data = await res.json().catch(() => ({}));
  if (res.ok && data?.refreshToken) setRefreshToken(data.refreshToken);
  if (!res.ok) {
    const error: any = new Error(data.error || data.message || `API request failed with status ${res.status}`);
    error.data = data;
    error.status = res.status;
    throw error;
  }

  return data;
}

export function formatKes(cents: number): string {
  return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
