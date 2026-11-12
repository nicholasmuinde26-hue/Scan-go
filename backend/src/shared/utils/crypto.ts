import crypto from 'crypto';
import { ENV } from '../../config/environment.js';

export function generateBasketHash(items: { productId: string; quantity: number; unitPriceMinor: number; weightGrams?: number; labelBarcode?: string; scaleId?: string; tagSerial?: string }[]): string {
  const sorted = [...items].sort((a, b) => `${a.productId}:${a.labelBarcode || ''}:${a.tagSerial || ''}`.localeCompare(`${b.productId}:${b.labelBarcode || ''}:${b.tagSerial || ''}`));
  const payload = JSON.stringify(sorted.map(i => `${i.productId}:${i.quantity}:${i.unitPriceMinor}:${i.weightGrams || ''}:${i.labelBarcode || ''}:${i.scaleId || ''}:${i.tagSerial || ''}`));
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function signReceiptToken(payload: {
  orderId: string;
  storeId: string;
  totalMinor: number;
  nonce: string;
  expiresAt: string;
}): string {
  const data = `${payload.orderId}|${payload.storeId}|${payload.totalMinor}|${payload.nonce}|${payload.expiresAt}`;
  const signature = crypto.createHmac('sha256', ENV.HMAC_RECEIPT_SECRET).update(data).digest('hex');
  const token = Buffer.from(JSON.stringify({ ...payload, signature })).toString('base64');
  return token;
}

export interface VerifiedReceiptToken {
  valid: boolean;
  data?: {
    orderId: string;
    storeId: string;
    totalMinor: number;
    nonce: string;
    expiresAt: string;
    signature: string;
  };
  reason?: string;
  isRotating?: boolean;
  isScreenshot?: boolean;
}

/**
 * Generates dynamic rotating QR token payload.
 * Rotates every 30 seconds to prevent screenshot sharing between users.
 */
export function generateRotatingQrPayload(baseToken: string, windowIntervalSeconds = 30): {
  dynamicPayload: string;
  window: number;
  secondsRemaining: number;
} {
  const nowMs = Date.now();
  const window = Math.floor(nowMs / (windowIntervalSeconds * 1000));
  const secondsRemaining = windowIntervalSeconds - (Math.floor(nowMs / 1000) % windowIntervalSeconds);

  const rollingData = `${baseToken}:${window}`;
  const rollingSignature = crypto
    .createHmac('sha256', ENV.HMAC_RECEIPT_SECRET)
    .update(rollingData)
    .digest('hex')
    .slice(0, 10);

  const dynamicPayload = `${baseToken}.rot.${window}.${rollingSignature}`;
  return { dynamicPayload, window, secondsRemaining };
}

export function verifyReceiptToken(token: string): VerifiedReceiptToken {
  try {
    let actualToken = token;
    let isRotating = false;

    // Check if token uses dynamic rotating QR format
    if (token.includes('.rot.')) {
      const parts = token.split('.rot.');
      if (parts.length === 2) {
        const basePart = parts[0];
        const [windowStr, signaturePart] = parts[1].split('.');

        if (windowStr && signaturePart) {
          isRotating = true;
          actualToken = basePart;
          const tokenWindow = parseInt(windowStr, 10);
          const currentWindow = Math.floor(Date.now() / 30000);

          // Allow slight clock drift (up to ±2 windows = ~60-90s max tolerance)
          if (Math.abs(currentWindow - tokenWindow) > 2) {
            return {
              valid: false,
              reason: 'ROTATING_QR_EXPIRED_SCREENSHOT',
              isRotating: true,
              isScreenshot: true,
            };
          }

          const expectedRollingSig = crypto
            .createHmac('sha256', ENV.HMAC_RECEIPT_SECRET)
            .update(`${basePart}:${tokenWindow}`)
            .digest('hex')
            .slice(0, 10);

          if (signaturePart !== expectedRollingSig) {
            return {
              valid: false,
              reason: 'INVALID_ROTATING_QR_SIGNATURE',
              isRotating: true,
              isScreenshot: true,
            };
          }
        }
      }
    }

    const raw = Buffer.from(actualToken, 'base64').toString('utf8');
    const parsed = JSON.parse(raw);
    const { orderId, storeId, totalMinor, nonce, expiresAt, signature } = parsed;

    if (!orderId || !storeId || !signature || !expiresAt) {
      return { valid: false, reason: 'MALFORMED_TOKEN' };
    }

    if (new Date(expiresAt).getTime() < Date.now()) {
      return { valid: false, reason: 'TOKEN_EXPIRED' };
    }

    const data = `${orderId}|${storeId}|${totalMinor}|${nonce}|${expiresAt}`;
    const expectedSig = crypto.createHmac('sha256', ENV.HMAC_RECEIPT_SECRET).update(data).digest('hex');

    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return { valid: true, data: parsed, isRotating };
    }
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  } catch (err: any) {
    return { valid: false, reason: 'TOKEN_PARSE_ERROR' };
  }
}

export function formatKes(cents: number): string {
  return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
