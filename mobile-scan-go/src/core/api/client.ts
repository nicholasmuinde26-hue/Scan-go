import { config } from '../config';
import { tokens } from '../session/tokens';

export class ApiError extends Error { constructor(message: string, readonly status: number, readonly code?: string) { super(message); } }
type RequestOptions = RequestInit & { idempotencyKey?: string; retryAuth?: boolean };
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccess(): Promise<string | null> {
  if (!refreshInFlight) refreshInFlight = (async () => {
    const refreshToken = await tokens.refresh();
    if (!refreshToken) return null;
    try {
      const response = await fetch(`${config.apiUrl}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client': 'mobile' }, body: JSON.stringify({ refreshToken }) });
      const data = await response.json();
      if (!response.ok || !data.token || !data.refreshToken) { await tokens.clear(); return null; }
      await tokens.save(data.token, data.refreshToken);
      return data.token as string;
    } catch { return null; }
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { idempotencyKey, retryAuth = true, ...init } = options;
  const send = async (accessToken?: string) => fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Client': 'mobile', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}), ...init.headers },
  });
  let response = await send((await tokens.access()) ?? undefined);
  const authEndpointsWithoutRefresh=['/auth/login','/auth/register','/auth/otp/send','/auth/refresh','/auth/logout'];
  if (response.status === 401 && retryAuth && !authEndpointsWithoutRefresh.includes(path)) {
    const accessToken = await refreshAccess();
    if (accessToken) response = await send(accessToken);
  }
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || 'Something went wrong. Please try again.', response.status, data.code);
  return data as T;
}
