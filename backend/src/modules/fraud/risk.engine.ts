import crypto from 'crypto';
import { RiskBand } from '../../shared/types/index.js';

export interface StoreFraudConfig {
  largeBasketMinor?: number; // e.g. 1,000,000 (KES 10,000)
  mediumBasketMinor?: number; // e.g. 500,000 (KES 5,000)
  fullCheckBasketMinor?: number; // e.g. 1,500,000 (KES 15,000)
  maxItemsWithoutFullCheck?: number; // e.g. 25
  manualEntryAmberThreshold?: number; // e.g. 4
  randomAuditPercentage?: number; // e.g. 5%
  amberScoreThreshold?: number; // e.g. 30
  amberFullScoreThreshold?: number; // e.g. 60
  amberTimeoutSeconds?: number; // e.g. 15s staff time limit
}

export interface RiskInput {
  totalMinor: number;
  totalItems: number;
  tripsCompleted: number;
  accountAgeHours: number;
  manualEntries: number;
  removalCount: number;
  scannedCount: number;
  highTheftItems: number;
  unknownBarcodeEvents: number;
  paymentFailures: number;
  cleanTrips: number;
  confirmedDiscrepancies: number;
  receiptValid: boolean;
  receiptUsed: boolean;
  orderPaid: boolean;
  orderHeld: boolean;
  storeMatch: boolean;
  randomAuditPercentage?: number;
  // In-store presence: trust tier of the session the basket was started under (1 = entrance poster, 2 = reduced trust)
  // and the store's random audit rate for that tier.
  trustTier?: number;
  tierAuditPercentage?: number;
  fraudConfig?: StoreFraudConfig;
}

export interface RiskResult {
  score: number;
  band: RiskBand;
  reasons: string[];
  mandatoryTasks: string[];
  isRandomCheck: boolean;
}

export function evaluateOrderRisk(input: RiskInput, customConfig?: StoreFraudConfig): RiskResult {
  const config = customConfig || input.fraudConfig || {};
  const largeBasketMinor = config.largeBasketMinor ?? 1000000;
  const mediumBasketMinor = config.mediumBasketMinor ?? 500000;
  const fullCheckBasketMinor = config.fullCheckBasketMinor ?? 1500000;
  const maxItemsWithoutFullCheck = config.maxItemsWithoutFullCheck ?? 25;
  const manualEntryAmberThreshold = config.manualEntryAmberThreshold ?? 4;
  const baseRandomPercent = config.randomAuditPercentage ?? input.randomAuditPercentage ?? 5;
  // A reduced-trust entry can only raise the audit rate, never lower the store's own setting.
  const randomPercent = Math.max(baseRandomPercent, input.tierAuditPercentage ?? 0);
  const amberScoreThreshold = config.amberScoreThreshold ?? 30;
  const amberFullScoreThreshold = config.amberFullScoreThreshold ?? 60;

  const reasons: string[] = [];
  const mandatoryTasks: string[] = [];

  // --- HARD RULES (Instant RED / BLOCKED) ---
  if (!input.orderPaid) {
    return {
      score: 100,
      band: 'RED',
      reasons: ['UNPAID: Order has not been paid or payment is pending.'],
      mandatoryTasks: ['HOLD: Payment must be completed and verified before exit.'],
      isRandomCheck: false,
    };
  }

  if (input.receiptUsed) {
    return {
      score: 100,
      band: 'RED',
      reasons: ['ALREADY_USED: Receipt has already been scanned and cleared for exit.'],
      mandatoryTasks: ['INVESTIGATE: Potential receipt duplicate/screenshot reuse.'],
      isRandomCheck: false,
    };
  }

  if (!input.receiptValid) {
    return {
      score: 100,
      band: 'RED',
      reasons: ['INVALID_RECEIPT: Cryptographic signature mismatch or token expired.'],
      mandatoryTasks: ['INVESTIGATE: Tampered or counterfeit receipt token.'],
      isRandomCheck: false,
    };
  }

  if (!input.storeMatch) {
    return {
      score: 100,
      band: 'RED',
      reasons: ['WRONG_STORE: Receipt issued for a different supermarket branch.'],
      mandatoryTasks: ['HOLD: Customer must verify correct branch.'],
      isRandomCheck: false,
    };
  }

  if (input.orderHeld) {
    return {
      score: 100,
      band: 'RED',
      reasons: ['ORDER_HELD: Order is held by store security or payment discrepancy.'],
      mandatoryTasks: ['ESCALATE: Supervisor clearance required.'],
      isRandomCheck: false,
    };
  }

  // --- BEHAVIORAL & BASKET RISK SCORING ---
  let score = 0;

  // Account History
  if (input.tripsCompleted === 0) {
    score += 20;
    reasons.push('FIRST_TRIP: First time using Scan & Go (+20 pts)');
  } else if (input.tripsCompleted <= 2) {
    score += 12;
    reasons.push('NEW_USER: 1-2 previous trips (+12 pts)');
  } else if (input.tripsCompleted <= 9) {
    score += 5;
  }

  // Presence trust: a session started from a tier 2 (reduced-trust) entry point carries a little extra risk.
  if (input.trustTier === 2) {
    score += 10;
    reasons.push('REDUCED_TRUST_ENTRY: Basket started from a tier 2 entry point (+10 pts)');
  }

  if (input.accountAgeHours < 24) {
    score += 10;
    reasons.push('NEW_ACCOUNT: Account created less than 24 hours ago (+10 pts)');
  }

  // Discrepancy History
  if (input.confirmedDiscrepancies > 0) {
    score += Math.min(input.confirmedDiscrepancies * 25, 50);
    reasons.push(`PAST_DISCREPANCIES: User has ${input.confirmedDiscrepancies} previous discrepancy records`);
    mandatoryTasks.push('VERIFY_PREVIOUS_OFFENDER: Rigorous physical item check required');
  }

  // Basket Value (in cents)
  if (input.totalMinor > largeBasketMinor) {
    score += 20;
    reasons.push(`HIGH_BASKET_VALUE: Cart exceeds KES ${largeBasketMinor / 100} (+20 pts)`);
    mandatoryTasks.push('HIGH_VALUE_AUDIT: Verify high-value items against receipt');
  } else if (input.totalMinor > mediumBasketMinor) {
    score += 10;
    reasons.push(`MEDIUM_BASKET_VALUE: Cart exceeds KES ${mediumBasketMinor / 100} (+10 pts)`);
  }

  // Basket Volume
  if (input.totalItems > maxItemsWithoutFullCheck) {
    score += 10;
    reasons.push(`LARGE_BASKET: More than ${maxItemsWithoutFullCheck} items (+10 pts)`);
    mandatoryTasks.push('COUNT_ITEMS: Verify total physical item count matches');
  }

  // Manual Barcode Entries
  if (input.manualEntries >= manualEntryAmberThreshold) {
    score += 30;
    reasons.push(`MANY_MANUAL_ENTRIES: ${input.manualEntries} barcodes entered manually (+30 pts)`);
    mandatoryTasks.push('CHECK_MANUAL_ITEMS: Physically scan manually entered items');
  } else if (input.manualEntries >= 2) {
    score += 15;
    reasons.push(`MODERATE_MANUAL_ENTRIES: ${input.manualEntries} manual entries (+15 pts)`);
  } else if (input.manualEntries === 1) {
    score += 5;
  }

  // Frequent Item Removals
  if (input.removalCount >= 3) {
    score += 15;
    reasons.push(`FREQUENT_REMOVALS: ${input.removalCount} items removed from digital basket (+15 pts)`);
    mandatoryTasks.push('SHELF_RETURN_CHECK: Confirm removed products are not present in cart');
  }

  // Unknown Barcode Scans
  if (input.unknownBarcodeEvents > 0) {
    score += 15;
    reasons.push(`UNKNOWN_BARCODES: ${input.unknownBarcodeEvents} unregistered barcode scans attempted (+15 pts)`);
    mandatoryTasks.push('SCAN_UNLISTED: Check for non-supermarket or substituted barcodes');
  }

  // High Theft Items
  if (input.highTheftItems > 0) {
    const pts = Math.min(input.highTheftItems * 10, 20);
    score += pts;
    reasons.push(`HIGH_THEFT_ITEMS: Contains ${input.highTheftItems} high-theft category items (+${pts} pts)`);
    mandatoryTasks.push('INSPECT_HIGH_THEFT: Verify tags, seals, and barcodes of premium products');
  }

  // Payment Failures
  if (input.paymentFailures > 1) {
    score += 10;
    reasons.push(`MULTIPLE_PAYMENT_FAILURES: ${input.paymentFailures} failed attempts (+10 pts)`);
  }

  // Clean Trips Loyalty Discount
  if (input.cleanTrips >= 20 && input.confirmedDiscrepancies === 0) {
    score = Math.max(0, score - 10);
    reasons.push('LOYAL_USER_DISCOUNT: 20+ verified clean trips (-10 pts)');
  }

  // Clamp Score
  score = Math.max(0, Math.min(100, score));

  // Cryptographically secure random audit
  const randomBytes = crypto.randomBytes(2);
  const randomVal = (randomBytes.readUInt16BE(0) / 65535) * 100;
  const isRandomCheck = randomVal < randomPercent;

  if (isRandomCheck) {
    reasons.push(`RANDOM_AUDIT: System selected for quality assurance check (${randomPercent}% rate)`);
    mandatoryTasks.push('RANDOM_SAMPLE: Spot-check 3 random items in the basket');
  }

  // Hard elevation rules to AMBER
  const forcedAmber =
    input.manualEntries >= manualEntryAmberThreshold ||
    input.unknownBarcodeEvents > 0 ||
    input.highTheftItems > 0 ||
    input.totalMinor >= largeBasketMinor ||
    isRandomCheck;

  let band: RiskBand = 'GREEN';
  if (score >= amberFullScoreThreshold || input.totalMinor > fullCheckBasketMinor) {
    band = 'AMBER_FULL';
    mandatoryTasks.push('FULL_PHYSICAL_SCAN: Scan every physical item in cart using exit scanner');
  } else if (score >= amberScoreThreshold || forcedAmber) {
    band = 'AMBER';
    if (mandatoryTasks.length === 0) {
      mandatoryTasks.push('SPOT_CHECK: Verify item count and spot check 3 physical items');
    }
  }

  return {
    score,
    band,
    reasons,
    mandatoryTasks,
    isRandomCheck,
  };
}

export function compareDigitalVsPhysical(
  paidItems: { productId: string; barcode: string; name: string; quantity: number; unitPriceMinor: number }[],
  physicalItems: { productId: string; barcode: string; name: string; quantity: number; unitPriceMinor: number }[]
) {
  const paidMap = new Map<string, { barcode: string; name: string; quantity: number; unitPriceMinor: number }>();
  const physicalMap = new Map<string, { barcode: string; name: string; quantity: number; unitPriceMinor: number }>();

  for (const item of paidItems) {
    const existing = paidMap.get(item.productId);
    paidMap.set(item.productId, {
      barcode: item.barcode,
      name: item.name,
      quantity: (existing?.quantity ?? 0) + item.quantity,
      unitPriceMinor: item.unitPriceMinor,
    });
  }

  for (const item of physicalItems) {
    const existing = physicalMap.get(item.productId);
    physicalMap.set(item.productId, {
      barcode: item.barcode,
      name: item.name,
      quantity: (existing?.quantity ?? 0) + item.quantity,
      unitPriceMinor: item.unitPriceMinor,
    });
  }

  const allProductIds = new Set([...paidMap.keys(), ...physicalMap.keys()]);
  const differences = [];
  let totalExcessItems = 0;
  let totalExcessValueMinor = 0;
  let hasDiscrepancy = false;

  for (const id of allProductIds) {
    const paid = paidMap.get(id);
    const phys = physicalMap.get(id);

    const paidQty = paid?.quantity ?? 0;
    const physQty = phys?.quantity ?? 0;
    const diff = physQty - paidQty;

    const barcode = phys?.barcode || paid?.barcode || '';
    const name = phys?.name || paid?.name || 'Unknown Product';
    const unitPriceMinor = phys?.unitPriceMinor || paid?.unitPriceMinor || 0;

    if (diff !== 0) {
      hasDiscrepancy = true;
      if (diff > 0) {
        totalExcessItems += diff;
        totalExcessValueMinor += diff * unitPriceMinor;
      }
    }

    differences.push({
      productId: id,
      barcode,
      name,
      paidQuantity: paidQty,
      physicalQuantity: physQty,
      difference: diff,
      unitPriceMinor,
    });
  }

  return {
    differences,
    hasDiscrepancy,
    totalExcessItems,
    totalExcessValueMinor,
  };
}
