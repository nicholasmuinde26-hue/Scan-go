import AsyncStorage from '@react-native-async-storage/async-storage';
import { config } from '../../core/config';
import { fetchWithTimeout } from '../../core/api/client';

const TOKEN_KEY = 'guest_token';
const PASS_KEY = 'guest_pass';

export interface GuestSession {
  token: string;
  passId: string;
  storeId: string;
  storeName?: string;
}

export const guestStore = {
  get: async (): Promise<GuestSession | null> => {
    try {
      const raw = await AsyncStorage.getItem(PASS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (!token) return null;
      return { ...parsed, token };
    } catch {
      return null;
    }
  },
  token: () => AsyncStorage.getItem(TOKEN_KEY),
  isGuest: async () => !!(await AsyncStorage.getItem(TOKEN_KEY)),
  save: async (session: GuestSession) => {
    await AsyncStorage.setItem(TOKEN_KEY, session.token);
    const { token: _t, ...rest } = session;
    await AsyncStorage.setItem(PASS_KEY, JSON.stringify(rest));
  },
  clear: async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(PASS_KEY);
  },
};

export class GuestApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

/**
 * Requests against /guest/* endpoints authenticated by X-Guest-Token.
 * No JWT involved — guest shadow users cannot log in.
 */
export async function guestRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await guestStore.token();
  const response = await fetchWithTimeout(`${config.apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Client': 'mobile',
      ...(token ? { 'X-Guest-Token': token } : {}),
      ...options.headers,
    },
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      await guestStore.clear();
    }
    throw new GuestApiError(data.error || 'Guest session problem. Please try again.', response.status, data.code);
  }
  return data as T;
}
