import { Request } from 'express';
import crypto from 'crypto';
import { ENV } from '../../config/environment.js';

// Official Safaricom Daraja IP ranges (production webhooks) + localhost
export const SAFARICOM_DARAJA_IPS = [
  '196.201.214.200',
  '196.201.214.206',
  '196.201.213.114',
  '196.201.214.207',
  '196.201.214.208',
  '196.201.213.44',
  '196.201.212.127',
  '196.201.212.138',
  '196.201.212.129',
  '196.201.212.136',
  '196.201.212.74',
  '196.201.212.69',
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
];

export function getClientIp(req: Request): string {
  // Security fix: Don't blindly trust X-Forwarded-For as it can be spoofed
  // Only trust it if we're behind a trusted proxy (check app settings)
  // For now, prefer direct connection IP over forwarded header
  const directIp = req.socket.remoteAddress || req.ip || '';
  
  // Behind a reverse proxy (Render, Railway, Nginx, ngrok...) the socket address is the proxy, not the caller.
  // When TRUST_PROXY_HOPS is set, Express resolves req.ip from X-Forwarded-For for exactly that many trusted hops,
  // so it cannot be spoofed by the client.
  if (ENV.TRUST_PROXY_HOPS > 0 && req.ip) {
    return req.ip;
  }

  return directIp;
}

/**
 * Verify Daraja Callback authenticity:
 * Either the secret in the URL (?secret=...) or client IP in Daraja IP allowlist.
 */
export function verifyDarajaCallback(req: Request): { valid: boolean; reason?: string } {
  const secretInUrl = req.query.secret as string | undefined;
  const secretHeader = req.headers['x-callback-secret'] as string | undefined;
  const providedSecret = secretInUrl || secretHeader;

  const expectedSecret = ENV.MPESA_CALLBACK_SECRET;
  const expected = Buffer.from(expectedSecret || '');
  const received = Buffer.from(providedSecret || '');
  const secretMatches = Boolean(expected.length && received.length === expected.length && crypto.timingSafeEqual(expected, received));

  const clientIp = getClientIp(req);
  const configuredAllowedIps = ENV.MPESA_ALLOWED_IPS
    ? ENV.MPESA_ALLOWED_IPS.split(',').map(s => s.trim())
    : [];
  const loopbackIps = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
  const providerIps = ENV.NODE_ENV === 'production'
    ? SAFARICOM_DARAJA_IPS.filter(ip => !loopbackIps.has(ip))
    : SAFARICOM_DARAJA_IPS;
  const allAllowedIps = [...providerIps, ...configuredAllowedIps];
  const ipAllowed = allAllowedIps.includes(clientIp);

  if (!secretMatches && !ipAllowed) {
    return {
      valid: false,
      reason: `Unauthorized: missing or invalid callback secret, and IP '${clientIp}' is not in Daraja allowlist.`,
    };
  }

  return { valid: true };
}

export interface DarajaCallbackItem {
  Name: string;
  Value?: any;
}

export interface DarajaStkCallbackPayload {
  Body?: {
    stkCallback?: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: DarajaCallbackItem[];
      };
    };
  };
}

export interface ParsedDarajaCallback {
  isValidFormat: boolean;
  merchantRequestId?: string;
  checkoutRequestId?: string;
  resultCode?: number;
  resultDesc?: string;
  amountKes?: number;
  amountMinor?: number;
  mpesaReceiptNumber?: string;
  transactionDate?: string;
  phoneNumber?: string;
  errorMessage?: string;
}

/**
 * Strictly parse and validate the official Daraja STK Push callback structure.
 * Rejects any arbitrary top-level body formats.
 */
export function parseDarajaCallback(body: any): ParsedDarajaCallback {
  if (!body || typeof body !== 'object' || !body.Body || !body.Body.stkCallback) {
    return {
      isValidFormat: false,
      errorMessage: 'Invalid payload: missing Body.stkCallback in Daraja callback structure.',
    };
  }

  const { stkCallback } = body.Body;
  const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

  if (!CheckoutRequestID || ResultCode === undefined) {
    return {
      isValidFormat: false,
      errorMessage: 'Invalid payload: missing CheckoutRequestID or ResultCode in stkCallback.',
    };
  }

  let amountKes: number | undefined;
  let amountMinor: number | undefined;
  let mpesaReceiptNumber: string | undefined;
  let transactionDate: string | undefined;
  let phoneNumber: string | undefined;

  if (CallbackMetadata && Array.isArray(CallbackMetadata.Item)) {
    for (const item of CallbackMetadata.Item) {
      if (item.Name === 'Amount' && item.Value !== undefined) {
        amountKes = Number(item.Value);
        if (!isNaN(amountKes)) {
          amountMinor = Math.round(amountKes * 100);
        }
      } else if (item.Name === 'MpesaReceiptNumber' && item.Value !== undefined) {
        mpesaReceiptNumber = String(item.Value).trim();
      } else if (item.Name === 'TransactionDate' && item.Value !== undefined) {
        transactionDate = String(item.Value);
      } else if (item.Name === 'PhoneNumber' && item.Value !== undefined) {
        phoneNumber = String(item.Value);
      }
    }
  }

  return {
    isValidFormat: true,
    merchantRequestId: MerchantRequestID,
    checkoutRequestId: CheckoutRequestID,
    resultCode: Number(ResultCode),
    resultDesc: ResultDesc || '',
    amountKes,
    amountMinor,
    mpesaReceiptNumber,
    transactionDate,
    phoneNumber,
  };
}

/**
 * Daraja API Client
 * - OAuth token (cached)
 * - STK Push initiation
 * - STK Push status query (used to reconcile when the callback never arrives)
 */
interface CachedToken {
  token: string;
  expiresAt: number;
}
let cachedAuthToken: CachedToken | null = null;

const DARAJA_TIMEOUT_MS = 20_000;

/** Error whose `message` is safe to show to a customer. Technical detail stays in `detail`. */
export class DarajaError extends Error {
  detail?: unknown;
  constructor(message: string, detail?: unknown) {
    super(message);
    this.name = 'DarajaError';
    this.detail = detail;
  }
}

export function getDarajaBaseUrl(): string {
  return ENV.MPESA_ENVIRONMENT === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

/**
 * Daraja validates the timestamp against East Africa Time (UTC+3). Using the server's local
 * clock breaks on any host that runs in UTC (most cloud platforms), so always derive EAT.
 */
export function formatDarajaTimestamp(date = new Date()): string {
  const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${eat.getUTCFullYear()}${pad(eat.getUTCMonth() + 1)}${pad(eat.getUTCDate())}` +
    `${pad(eat.getUTCHours())}${pad(eat.getUTCMinutes())}${pad(eat.getUTCSeconds())}`
  );
}

export function generateDarajaPassword(shortcode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

/** Normalise any common Kenyan mobile format to 2547XXXXXXXX / 2541XXXXXXXX, or null if invalid. */
export function normalizeKenyanMsisdn(input: unknown): string | null {
  const digits = String(input ?? '').replace(/[\s()+-]/g, '');
  const m = digits.match(/^(?:254|0)?([71]\d{8})$/);
  return m ? `254${m[1]}` : null;
}

/** Daraja rejects AccountReference > 12 chars (shown on the customer's STK prompt). */
export function sanitizeAccountReference(ref: string): string {
  const clean = String(ref || '').replace(/[^A-Za-z0-9]/g, '');
  // Keep the tail: order numbers end in the unique part (date + random suffix).
  return (clean.length > 12 ? clean.slice(-12) : clean) || 'ORDER';
}

/** Daraja rejects TransactionDesc > 13 chars. */
export function sanitizeTransactionDesc(desc: string): string {
  const clean = String(desc || '').replace(/[^A-Za-z0-9 ]/g, '').trim();
  return (clean.slice(0, 13).trim()) || 'Order payment';
}

export function isDarajaConfigured(): boolean {
  return Boolean(
    ENV.MPESA_CONSUMER_KEY &&
    ENV.MPESA_CONSUMER_SECRET &&
    !ENV.MPESA_CONSUMER_KEY.includes('your_daraja') &&
    ENV.MPESA_SHORTCODE &&
    ENV.MPESA_PASSKEY
  );
}

export async function getDarajaOAuthToken(): Promise<string | null> {
  try {
    return await getDarajaOAuthTokenOrThrow();
  } catch (error: any) {
    console.warn(`[Daraja Service] ${error.message}`);
    return null;
  }
}

export async function getDarajaOAuthTokenOrThrow(): Promise<string> {
  if (cachedAuthToken && cachedAuthToken.expiresAt > Date.now()) {
    return cachedAuthToken.token;
  }

  if (!isDarajaConfigured()) {
    throw new DarajaError(
      'M-Pesa is not configured on the server yet.',
      'MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET / MPESA_SHORTCODE / MPESA_PASSKEY missing'
    );
  }

  let res: Response;
  try {
    const authHeader = Buffer.from(`${ENV.MPESA_CONSUMER_KEY}:${ENV.MPESA_CONSUMER_SECRET}`).toString('base64');
    res = await fetch(`${getDarajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
      method: 'GET',
      headers: { Authorization: `Basic ${authHeader}` },
      signal: AbortSignal.timeout(DARAJA_TIMEOUT_MS),
    });
  } catch (error: any) {
    throw new DarajaError('Could not reach M-Pesa right now. Please try again.', `OAuth network error: ${error.message}`);
  }

  if (!res.ok) {
    // 400/401 here almost always means wrong consumer key/secret, or sandbox keys used against production (or vice versa).
    throw new DarajaError(
      'M-Pesa rejected the server credentials. Please contact support.',
      `OAuth failed (${res.status}) against ${getDarajaBaseUrl()} - check MPESA_CONSUMER_KEY/SECRET and MPESA_ENVIRONMENT`
    );
  }

  const data: any = await res.json().catch(() => ({}));
  if (!data.access_token) {
    throw new DarajaError('M-Pesa did not return an access token. Please try again.', data);
  }
  const expiresInSec = parseInt(data.expires_in || '3599', 10);
  cachedAuthToken = {
    token: data.access_token,
    expiresAt: Date.now() + (expiresInSec - 60) * 1000,
  };
  return cachedAuthToken.token;
}

/** Customer-facing wording for STK ResultCodes (callback or query). */
export function describeDarajaResult(resultCode: number | undefined, fallback?: string): string {
  switch (resultCode) {
    case 1032: return 'You cancelled the M-Pesa prompt.';
    case 1037: return 'The M-Pesa prompt timed out before a PIN was entered.';
    case 1: return 'Insufficient M-Pesa balance.';
    case 2001: return 'Wrong M-Pesa PIN entered.';
    case 1001: return 'Another M-Pesa transaction is already in progress on this number. Wait a moment and retry.';
    case 1019: return 'The M-Pesa transaction expired. Please retry.';
    case 1025:
    case 9999: return 'M-Pesa could not deliver the prompt to your phone. Check the number and try again.';
    default: return fallback || 'M-Pesa payment was not completed.';
  }
}

export interface DarajaStkPushResult {
  checkoutRequestId: string;
  merchantRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage?: string;
}

export async function initiateDarajaStkPush(input: {
  amountKes: number;
  phone: string; // 2547XXXXXXXX
  accountReference: string;
  transactionDesc: string;
  callbackUrl: string;
}): Promise<DarajaStkPushResult> {
  const token = await getDarajaOAuthTokenOrThrow();
  const timestamp = formatDarajaTimestamp();
  const password = generateDarajaPassword(ENV.MPESA_SHORTCODE, ENV.MPESA_PASSKEY, timestamp);

  let res: Response;
  try {
    res = await fetch(`${getDarajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: ENV.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(input.amountKes),
        PartyA: input.phone,
        PartyB: ENV.MPESA_SHORTCODE,
        PhoneNumber: input.phone,
        CallBackURL: input.callbackUrl,
        AccountReference: sanitizeAccountReference(input.accountReference),
        TransactionDesc: sanitizeTransactionDesc(input.transactionDesc),
      }),
      signal: AbortSignal.timeout(DARAJA_TIMEOUT_MS),
    });
  } catch (error: any) {
    throw new DarajaError('Could not reach M-Pesa right now. Please try again.', `STK network error: ${error.message}`);
  }

  const data: any = await res.json().catch(() => ({}));

  // A stale cached token (e.g. rotated keys) comes back as 401 - drop it so the next attempt refetches.
  if (res.status === 401) cachedAuthToken = null;

  if (!res.ok || String(data.ResponseCode) !== '0' || !data.CheckoutRequestID) {
    const detail = data.errorMessage || data.ResponseDescription || `HTTP ${res.status}`;
    console.error('[Daraja STK Push] rejected:', JSON.stringify(data), '| HTTP', res.status);
    throw new DarajaError(
      /callback/i.test(String(detail))
        ? 'M-Pesa rejected the payment callback address. Please contact support.'
        : 'M-Pesa could not start this payment. Please check the number and try again.',
      data
    );
  }

  return {
    checkoutRequestId: String(data.CheckoutRequestID),
    merchantRequestId: String(data.MerchantRequestID || ''),
    responseCode: String(data.ResponseCode),
    responseDescription: String(data.ResponseDescription || ''),
    customerMessage: data.CustomerMessage ? String(data.CustomerMessage) : undefined,
  };
}

export interface DarajaQueryResponse {
  success: boolean;
  isCompleted: boolean;
  resultCode?: number;
  resultDesc?: string;
  responseCode?: string;
  responseDescription?: string;
  raw?: any;
}

/**
 * Ask Daraja what happened to an STK push. While the customer is still deciding, Daraja answers with an
 * error body (e.g. "The transaction is being processed") and no ResultCode: that is "not completed yet".
 * NOTE: this endpoint does NOT return the M-Pesa receipt number or the amount.
 */
export async function queryDarajaStkStatus(checkoutRequestId: string): Promise<DarajaQueryResponse> {
  let token: string;
  try {
    token = await getDarajaOAuthTokenOrThrow();
  } catch (error: any) {
    return { success: false, isCompleted: false, resultDesc: error.message };
  }

  const timestamp = formatDarajaTimestamp();
  const password = generateDarajaPassword(ENV.MPESA_SHORTCODE, ENV.MPESA_PASSKEY, timestamp);

  try {
    const res = await fetch(`${getDarajaBaseUrl()}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: ENV.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
      signal: AbortSignal.timeout(DARAJA_TIMEOUT_MS),
    });

    const data: any = await res.json().catch(() => ({}));
    if (res.status === 401) cachedAuthToken = null;

    const resultCode = data.ResultCode !== undefined && data.ResultCode !== '' ? Number(data.ResultCode) : undefined;
    const isCompleted = resultCode !== undefined && !Number.isNaN(resultCode);

    return {
      success: isCompleted && resultCode === 0,
      isCompleted,
      resultCode: isCompleted ? resultCode : undefined,
      resultDesc: data.ResultDesc || data.errorMessage || data.ResponseDescription,
      responseCode: data.ResponseCode,
      responseDescription: data.ResponseDescription,
      raw: data,
    };
  } catch (error: any) {
    return { success: false, isCompleted: false, resultDesc: error.message };
  }
}
