import Basket from './basket.model.js';
import Product from '../products/product.model.js';
import { UnknownBarcode } from '../products/inventory-record.model.js';
import Store from '../stores/store.model.js';
import WeighLabel from './weigh-label.model.js';
import SerializedTag from './serialized-tag.model.js';
import { verifyVariableMeasureLabel } from './variableMeasureBarcode.js';
import { generateBasketHash } from '../../shared/utils/crypto.js';
import { checkTierLimits, ResolvedPresencePolicy, touchSession } from '../presence/presence.service.js';

/** Error carrying the HTTP status/payload the route layer should return. */
export class BasketOpError extends Error {
  status: number;
  code?: string;
  data?: Record<string, any>;
  constructor(status: number, message: string, opts: { code?: string; data?: Record<string, any> } = {}) {
    super(message);
    this.status = status;
    this.code = opts.code;
    this.data = opts.data;
  }
}

// Recalculate server-authoritative basket totals and basket hash.
export function recalculateBasket(basket: any) {
  let totalMinor = 0;
  let totalItems = 0;
  let expectedWeightGrams = 0;

  for (const item of basket.items) {
    totalMinor += item.unitPriceMinor * item.quantity;
    totalItems += item.quantity;
    if (item.weightGrams) {
      expectedWeightGrams += item.weightGrams * item.quantity;
    }
  }

  basket.totalMinor = totalMinor;
  basket.totalItems = totalItems;
  basket.expectedWeightGrams = expectedWeightGrams;
  basket.basketHash = generateBasketHash(
    basket.items.map((i: any) => ({
      productId: i.productId.toString(),
      quantity: i.quantity,
      unitPriceMinor: i.unitPriceMinor,
      weightGrams: i.weightGrams,
      labelBarcode: (i as any).labelBarcode,
      scaleId: (i as any).scaleId,
      tagSerial: (i as any).tagSerial,
    }))
  );
  basket.lastActivityAt = new Date();
}

function assertWithinTierLimits(basket: any, policy: ResolvedPresencePolicy) {
  const message = checkTierLimits(policy, basket.trustTier, { totalMinor: basket.totalMinor, totalItems: basket.totalItems });
  if (message) {
    throw new BasketOpError(409, message, { code: 'TIER_LIMIT_REACHED' });
  }
}

export interface ScanInput {
  barcode: string;
  quantity?: number;
  isManualEntry?: boolean;
  tagSerial?: string;
}

export interface ScanContext {
  // Who to attribute unknown-barcode reports to (staff user, or undefined for devices).
  reportedBy?: any;
  reportedByName?: string;
  reportedByRole?: string;
  // Where the scan came from, for the basket event log.
  source?: string; // 'APP' | 'SMART_BASKET' | device kind
  deviceId?: string;
}

export interface ScanResult {
  kind: 'WEIGHED' | 'PRODUCT';
  product: any;
  verification?: any;
  basket: any;
}

/**
 * Apply one product scan to an OPEN basket. This is the single code path used
 * by the customer app AND by registered devices (smart baskets, lane scanners)
 * — prices, weigh-label verification, serialized tags, tier limits and the
 * server-side basket ledger behave identically regardless of the scanner.
 *
 * Throws BasketOpError for every expected failure; side effects (weigh labels,
 * tag claims, unknown-barcode tracking) are rolled back or committed exactly
 * as the original route handler did.
 */
export async function applyProductScan(
  basket: any,
  input: ScanInput,
  presencePolicy: ResolvedPresencePolicy,
  ctx: ScanContext = {},
): Promise<ScanResult> {
  const { barcode, isManualEntry = false, tagSerial: rawTagSerial } = input;
  const quantity = Number(input.quantity ?? 1);
  if (!barcode || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new BasketOpError(400, 'A barcode and integer quantity from 1 to 100 are required.');
  }
  if (basket.status !== 'OPEN') {
    throw new BasketOpError(400, 'Basket is locked or converted.');
  }
  // A successful scan is proof of activity: keep the backing session alive.
  if (basket.storeSessionId) void touchSession(basket.storeSessionId);

  const scannedBarcode = String(barcode || '').trim();
  const store = await Store.findById(basket.storeId).select('code variableMeasureBarcode');
  const measureLayout = store?.variableMeasureBarcode;
  const sourceNote = ctx.source ? ` via ${ctx.source}` : '';
  const actorName = ctx.reportedByName || ctx.deviceId || 'device';

  // --- Variable-measure (weighed produce) labels -------------------------
  if (store && measureLayout?.enabled && measureLayout.prefix && scannedBarcode.startsWith(measureLayout.prefix)) {
    const product = await Product.findOne({ storeId: basket.storeId, active: true, soldBy: 'weight', pluCode: scannedBarcode.slice(measureLayout.pluStart, measureLayout.pluStart + measureLayout.pluLength) });
    let verified;
    try {
      verified = verifyVariableMeasureLabel(scannedBarcode, measureLayout as any, store.code, product);
    } catch (error: any) {
      throw new BasketOpError(400, error.message, { code: 'INVALID_WEIGH_LABEL' });
    }
    if (quantity !== 1) {
      throw new BasketOpError(400, 'Each produce label represents one weighed bag; quantity must be one.');
    }
    if (basket.items.some((item: any) => item.labelBarcode === scannedBarcode) || await WeighLabel.exists({ barcode: scannedBarcode })) {
      throw new BasketOpError(409, 'This produce label has already been used.', { code: 'WEIGH_LABEL_ALREADY_USED' });
    }
    try {
      await WeighLabel.create({
        barcode: scannedBarcode,
        storeId: basket.storeId,
        scaleId: verified.scaleId,
        productId: product!._id,
        basketId: basket._id,
        firstSeenAt: new Date(),
        weightGrams: verified.weightGrams,
        priceMinor: verified.priceMinor,
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new BasketOpError(409, 'This produce label has already been used.', { code: 'WEIGH_LABEL_ALREADY_USED' });
      }
      throw error;
    }
    try {
      basket.events.push({ eventType: isManualEntry ? 'MANUAL_ENTRY' : 'SCAN', barcode: scannedBarcode, productId: product!._id, quantity: 1, timestamp: new Date(), details: `Weighed produce label scanned from ${verified.scaleId}${sourceNote}.` });
      basket.items.push({
        productId: product!._id,
        barcode: product!.barcode,
        name: product!.name,
        quantity: 1,
        unitPriceMinor: verified.priceMinor,
        priceVersion: product!.priceVersion,
        weightGrams: verified.weightGrams,
        isWeighted: true,
        highTheft: product!.highTheft,
        labelBarcode: scannedBarcode,
        unitPriceAtScan: verified.unitPriceAtScan,
        scaleId: verified.scaleId,
        addedAt: new Date(),
      });
      recalculateBasket(basket);
      assertWithinTierLimits(basket, presencePolicy);
      await basket.save();
    } catch (error) {
      await WeighLabel.deleteOne({ barcode: scannedBarcode, basketId: basket._id }).catch(() => {});
      throw error;
    }
    return {
      kind: 'WEIGHED',
      product,
      verification: { kind: 'WEIGHED', labelBarcode: scannedBarcode, weightGrams: verified.weightGrams, priceMinor: verified.priceMinor, scaleId: verified.scaleId },
      basket,
    };
  }

  // --- Regular product lookup (server-authoritative price) ---------------
  const product = await Product.findOne({ storeId: basket.storeId, active: true, $or: [{ barcode: scannedBarcode }, { barcodeAliases: scannedBarcode }, { pluCode: scannedBarcode }] });

  if (!product) {
    basket.unknownBarcodeCount += 1;
    basket.events.push({
      eventType: 'UNKNOWN_BARCODE',
      barcode: scannedBarcode,
      timestamp: new Date(),
      details: `Scanned unregistered barcode ${scannedBarcode}${sourceNote} (${actorName})`,
    });
    await basket.save();

    const now = new Date();
    await UnknownBarcode.findOneAndUpdate(
      { storeId: basket.storeId, barcode: scannedBarcode, status: 'OPEN' },
      { $set: { lastSeenAt: now, source: ctx.reportedBy ? 'CUSTOMER_SCAN' : 'DEVICE_SCAN', reportedBy: ctx.reportedBy, reportedByName: ctx.reportedByName }, $setOnInsert: { storeId: basket.storeId, barcode: scannedBarcode, status: 'OPEN', firstSeenAt: now }, $inc: { seenCount: 1 } },
      { upsert: true }
    );

    throw new BasketOpError(404, `Unrecognized barcode [${scannedBarcode}]. Staff assistance required.`, {
      data: { unknownBarcode: true, barcode: scannedBarcode, unknownBarcodeCount: basket.unknownBarcodeCount, flaggedForInventoryReview: true },
    });
  }

  if (product.soldBy === 'weight') {
    throw new BasketOpError(409, 'Scan the variable-measure label printed by the store scale for this produce.', { code: 'WEIGH_LABEL_REQUIRED' });
  }

  const tagSerial = rawTagSerial ? String(rawTagSerial).trim() : '';
  if (product.requiresSerializedTag && !tagSerial) {
    throw new BasketOpError(409, 'Scan or enter this item’s serialized tag before adding it.', {
      code: 'TAG_REQUIRED',
      data: { productId: product._id, productName: product.name },
    });
  }
  if (!product.requiresSerializedTag && tagSerial) {
    throw new BasketOpError(400, 'This product does not require a serialized tag.');
  }
  if (product.requiresSerializedTag && quantity !== 1) {
    throw new BasketOpError(400, 'Tagged items and weighed produce labels must be added one at a time.');
  }

  let claimedTagSerial: string | undefined;
  if (tagSerial) {
    const claimed = await SerializedTag.findOneAndUpdate(
      { tagSerial, storeId: basket.storeId, productId: product._id, status: 'IN_STORE' },
      { $set: { status: 'IN_BASKET', basketId: basket._id } },
      { new: true }
    );
    if (!claimed) {
      throw new BasketOpError(409, 'Tag is unknown, belongs to another product/store, or is already in use.', { code: 'TAG_UNAVAILABLE' });
    }
    claimedTagSerial = tagSerial;
  }

  try {
    if (isManualEntry) {
      basket.manualEntryCount += 1;
      basket.events.push({ eventType: 'MANUAL_ENTRY', barcode: scannedBarcode, productId: product._id, quantity, timestamp: new Date(), details: `Manual barcode entered: ${scannedBarcode}${sourceNote}` });
    } else {
      basket.events.push({ eventType: 'SCAN', barcode: scannedBarcode, productId: product._id, quantity, timestamp: new Date(), details: `Barcode scanned: ${scannedBarcode}${sourceNote}` });
    }

    const existingIndex = product.soldBy === 'unit' && !product.requiresSerializedTag
      ? basket.items.findIndex((i: any) => i.productId.toString() === product._id.toString() && !(i as any).labelBarcode && !(i as any).tagSerial)
      : -1;
    if (existingIndex > -1) {
      basket.items[existingIndex].quantity += quantity;
    } else {
      basket.items.push({
        productId: product._id,
        barcode: product.barcode,
        name: product.name,
        quantity,
        unitPriceMinor: product.priceMinor,
        priceVersion: product.priceVersion,
        weightGrams: product.weightGrams,
        isWeighted: product.isWeighted,
        highTheft: product.highTheft,
        tagSerial: tagSerial || undefined,
        addedAt: new Date(),
      });
    }

    recalculateBasket(basket);
    assertWithinTierLimits(basket, presencePolicy);
    await basket.save();
  } catch (error) {
    if (claimedTagSerial) {
      await SerializedTag.updateOne({ tagSerial: claimedTagSerial, basketId: basket._id, status: 'IN_BASKET' }, { $set: { status: 'IN_STORE' }, $unset: { basketId: 1 } }).catch(() => {});
    }
    if ((error as any)?.code === 11000) {
      throw new BasketOpError(409, 'This produce label has already been used.', { code: 'WEIGH_LABEL_ALREADY_USED' });
    }
    throw error;
  }

  return { kind: 'PRODUCT', product, basket };
}
