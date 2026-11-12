const API_BASE = '/api/v1';

// Unified token storage key: 'scango_access_token'
const TOKEN_STORAGE_KEY = 'scango_access_token';
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

export function clearToken() {
  authToken = '';
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  // Also clear legacy keys
  LEGACY_TOKEN_KEYS.forEach((k) => localStorage.removeItem(k));
}

export async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
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
    try {
      const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        if (refreshData?.token) {
          setToken(refreshData.token);
          headers['Authorization'] = `Bearer ${refreshData.token}`;
          // Retry original request
          const retryRes = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
            credentials: 'include',
          });
          const retryData = await retryRes.json();
          if (!retryRes.ok) {
            const error: any = new Error(retryData.error || retryData.message || 'API request failed');
            error.data = retryData;
            error.status = retryRes.status;
            throw error;
          }
          return retryData;
        }
      } else {
        clearToken();
      }
    } catch {
      clearToken();
    }
  }

  const data = await res.json().catch(() => ({}));
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
