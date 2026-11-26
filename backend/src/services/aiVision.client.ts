import { ENV } from '../config/environment.js';

/**
 * Client for the Python AI exit-verification sidecar (ai-service/).
 *
 * The service is advisory: it can only ever ADD scrutiny to an exit decision.
 * Every failure mode (down, slow, malformed) resolves to `null` so the caller
 * falls back to the in-process risk engine — exits must never depend on it.
 */

export interface AiVisionDetection {
  label: string;
  confidence: number;
  bbox?: number[];
  source?: string;
}

export interface AiObservedEvidence {
  vision?: AiVisionDetection[];
  barcodeScans?: { barcode: string; quantity?: number; source?: string }[];
  sensors?: {
    weightDeltaGrams?: number;
    weightToleranceGrams?: number;
    rfidSerials?: string[];
    rfidExpectedPaid?: string[];
    basketId?: string;
    basketBoundToSession?: boolean;
  };
}

export interface AiExitAssessment {
  decision: 'GREEN' | 'AMBER' | 'RED';
  confidence: number;
  score: number;
  reasons: string[];
  tasks: string[];
  evidence: Record<string, any>;
}

const BAND_ORDER = { GREEN: 0, AMBER: 1, AMBER_FULL: 2, RED: 3 } as const;

export function aiBandAtLeast(current: keyof typeof BAND_ORDER, required: 'GREEN' | 'AMBER' | 'RED'): boolean {
  const mapped = required === 'AMBER' ? 'AMBER' : required;
  return BAND_ORDER[current] >= BAND_ORDER[mapped];
}

export async function consultAiExitVerification(input: {
  orderId?: string;
  storeId?: string;
  sessionId?: string;
  exitEventId?: string;
  expected: {
    items: { barcode: string; name: string; quantity: number; unitPriceMinor?: number }[];
    totalMinor: number;
    totalItems: number;
    paid: boolean;
    paymentStatus: string;
  };
  observed?: AiObservedEvidence;
  context?: Record<string, any>;
}): Promise<AiExitAssessment | null> {
  if (!ENV.AI_SERVICE_URL) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENV.AI_SERVICE_TIMEOUT_MS);
  try {
    const res = await fetch(`${ENV.AI_SERVICE_URL.replace(/\/$/, '')}/v1/verify-exit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ENV.AI_SERVICE_API_KEY ? { 'X-API-Key': ENV.AI_SERVICE_API_KEY } : {}),
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AiExitAssessment;
    if (!data || !['GREEN', 'AMBER', 'RED'].includes(data.decision)) return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface AiForecastResponse {
  productId: string;
  method: string;
  dailyForecast: { dateOffset: number; predictedQty: number; lowerBound: number; upperBound: number }[];
  recommendedOrderQty: number;
  stockoutRiskDays: number | null;
  notes: string[];
}

export async function consultAiForecast(input: {
  productId: string;
  storeId?: string;
  daily: { date: string; quantity: number }[];
  horizonDays?: number;
  leadTimeDays?: number;
  currentStock?: number;
}): Promise<AiForecastResponse | null> {
  if (!ENV.AI_SERVICE_URL) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENV.AI_SERVICE_TIMEOUT_MS);
  try {
    const res = await fetch(`${ENV.AI_SERVICE_URL.replace(/\/$/, '')}/v1/forecast/demand`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ENV.AI_SERVICE_API_KEY ? { 'X-API-Key': ENV.AI_SERVICE_API_KEY } : {}),
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AiForecastResponse;
    return data && Array.isArray(data.dailyForecast) ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
