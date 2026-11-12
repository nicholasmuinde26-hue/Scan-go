import { Router } from 'express';
import Basket from './basket.model.js';
import Product from '../products/product.model.js';
import { UnknownBarcode } from '../products/inventory-record.model.js';
import Store from '../stores/store.model.js';
import WeighLabel from './weigh-label.model.js';
import SerializedTag from './serialized-tag.model.js';
import { verifyVariableMeasureLabel } from './variableMeasureBarcode.js';
import { authenticate, AuthRequest, canAccessStore, requirePermission } from '../../middleware/auth.js';
import { generateBasketHash } from '../../shared/utils/crypto.js';
import { rejectIfSubscriptionBlocked, requireSubscriptionGate } from '../../middleware/subscriptionGate.js';
import StoreSession from '../presence/store-session.model.js';
import { resolvePolicy, getActiveSession, checkTierLimits, ResolvedPresencePolicy } from '../presence/presence.service.js';

const router = Router();

// Enroll a serialized retail tag before attaching it to a customer basket.
router.post('/tags/register', authenticate, requirePermission('inventory:write'), async (req: AuthRequest, res) => {
  try {
    const { storeId, productId } = req.body;
    const tagSerial = String(req.body.tagSerial || '').trim();
    if (!storeId || !productId || !tagSerial) return res.status(400).json({ success: false, error: 'storeId, productId, and tagSerial are required.' });
    if (!(await canAccessStore(req.user!, String(storeId)))) return res.status(403).json({ success: false, error: 'Cannot register tags for another store.' });
    const product = await Product.findOne({ _id: productId, storeId, active: true, requiresSerializedTag: true });
    if (!product) return res.status(404).json({ success: false, error: 'A tagged active product was not found in this store.' });
    const tag = await SerializedTag.create({ tagSerial, productId, storeId, status: 'IN_STORE' });
    return res.status(201).json({ success: true, tag });
  } catch (error: any) {
    return res.status(error.code === 11000 ? 409 : 400).json({ success: false, error: error.code === 11000 ? 'This tag serial is already registered.' : error.message });
  }
});

// Helper to recalculate server-authoritative basket totals and basket hash
function recalculateBasket(basket: any) {
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

async function isBasketWriteBlocked(basket: any, res: any): Promise<boolean> {
  const store = await Store.findById(basket.storeId).select('organizationId');
  if (!store?.organizationId) {
    res.status(409).json({ success: false, error: 'This store has not been assigned to an organization yet.' });
    return true;
  }
  return rejectIfSubscriptionBlocked(res, store.organizationId.toString(), 'scan_and_go');
}


// ---------------------------------------------------------------------------
// In-store presence guards
// ---------------------------------------------------------------------------

async function loadStorePolicy(storeId: any): Promise<ResolvedPresencePolicy> {
  const store = await Store.findById(storeId).select('presencePolicy');
  return resolvePolicy(store);
}

/**
 * Before items are added, the basket must belong to a store session that is still active.
 * Returns the store's presence policy, or null after sending the error response.
 */
async function requireLiveSession(basket: any, res: any): Promise<ResolvedPresencePolicy | null> {
  const policy = await loadStorePolicy(basket.storeId);
  if (!policy.enforced) return policy;
  if (!basket.storeSessionId) {
    res.status(403).json({ success: false, code: 'PRESENCE_REQUIRED', error: 'Scan the QR poster at the store entrance to start Scan & Go.' });
    return null;
  }
  const live = await StoreSession.exists({ _id: basket.storeSessionId, status: 'ACTIVE', expiresAt: { $gt: new Date() } });
  if (!live) {
    res.status(403).json({ success: false, code: 'PRESENCE_EXPIRED', error: 'Your in-store check-in has expired. Scan the QR poster at the store entrance again.' });
    return null;
  }
  return policy;
}

/** Throws an error the route's catch block turns into a 409 (so earlier side effects are cleaned up). */
function assertWithinTierLimits(basket: any, policy: ResolvedPresencePolicy) {
  const message = checkTierLimits(policy, basket.trustTier, { totalMinor: basket.totalMinor, totalItems: basket.totalItems });
  if (message) {
    const err: any = new Error(message);
    err.tierLimit = true;
    throw err;
  }
}

// Get or create active shopping basket for customer
router.post('/', authenticate, requireSubscriptionGate('scan_and_go'), async (req: AuthRequest, res) => {
  try {
    const { storeId, deviceId } = req.body;
    if (!storeId) {
      res.status(400).json({ success: false, error: 'storeId is required.' });
      return;
    }

    // Scan & Go needs proof the shopper is inside this store: an active store session for the same store.
    const policy = await loadStorePolicy(storeId);
    const session = policy.enforced ? await getActiveSession(String(req.user?.id), String(storeId)) : null;
    if (policy.enforced && !session) {
      res.status(403).json({
        success: false,
        code: 'PRESENCE_REQUIRED',
        error: 'Scan the QR poster at the store entrance to start Scan & Go.',
      });
      return;
    }
    const presenceFields = session
      ? { storeSessionId: session._id, trustTier: session.trustTier, presenceMethod: session.presenceMethod }
      : {};

    let basket = await Basket.findOne({
      customerId: req.user?.id,
      storeId,
      status: 'OPEN',
    });

    if (!basket) {
      basket = await Basket.create({
        customerId: req.user?.id,
        storeId,
        deviceId: deviceId || 'WEB_CLIENT',
        status: 'OPEN',
        items: [],
        ...presenceFields,
      });
    } else if (session) {
      // Resuming a basket: attach it to the current session (the shopper may have checked in again).
      basket.storeSessionId = session._id;
      basket.trustTier = session.trustTier;
      basket.presenceMethod = session.presenceMethod;
      await basket.save();
    }

    res.json({ success: true, basket });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Scan product or enter manual barcode
router.post('/:id/scan', authenticate, async (req: AuthRequest, res) => {
  let consumedWeighLabel: string | undefined;
  let claimedTagSerial: string | undefined;
  try {
    const { barcode, isManualEntry, quantity = 1, tagSerial: rawTagSerial } = req.body;
    const normalizedQuantity = Number(quantity);
    if (!barcode || !Number.isInteger(normalizedQuantity) || normalizedQuantity < 1 || normalizedQuantity > 100) {
      res.status(400).json({ success: false, error: 'A barcode and integer quantity from 1 to 100 are required.' });
      return;
    }
    const basket = await Basket.findById(req.params.id);

    if (!basket || basket.customerId.toString() !== req.user?.id) {
      res.status(404).json({ success: false, error: 'Basket not found or unauthorized.' });
      return;
    }

    if (basket.status !== 'OPEN') {
      res.status(400).json({ success: false, error: 'Basket is locked or converted.' });
      return;
    }
    if (await isBasketWriteBlocked(basket, res)) return;
    const presencePolicy = await requireLiveSession(basket, res);
    if (!presencePolicy) return;

    const scannedBarcode = String(barcode || '').trim();
    const store = await Store.findById(basket.storeId).select('code variableMeasureBarcode');
    const measureLayout = store?.variableMeasureBarcode;
    if (store && measureLayout?.enabled && measureLayout.prefix && scannedBarcode.startsWith(measureLayout.prefix)) {
      const product = await Product.findOne({ storeId: basket.storeId, active: true, soldBy: 'weight', pluCode: scannedBarcode.slice(measureLayout.pluStart, measureLayout.pluStart + measureLayout.pluLength) });
      let verified;
      try {
        verified = verifyVariableMeasureLabel(scannedBarcode, measureLayout as any, store.code, product);
      } catch (error: any) {
        res.status(400).json({ success: false, code: 'INVALID_WEIGH_LABEL', error: error.message });
        return;
      }
      if (Number(quantity) !== 1) {
        res.status(400).json({ success: false, error: 'Each produce label represents one weighed bag; quantity must be one.' });
        return;
      }
      if (basket.items.some((item: any) => item.labelBarcode === scannedBarcode) || await WeighLabel.exists({ barcode: scannedBarcode })) {
        res.status(409).json({ success: false, code: 'WEIGH_LABEL_ALREADY_USED', error: 'This produce label has already been used.' });
        return;
      }
      const label = await WeighLabel.create({
        barcode: scannedBarcode,
        storeId: basket.storeId,
        scaleId: verified.scaleId,
        productId: product!._id,
        basketId: basket._id,
        firstSeenAt: new Date(),
        weightGrams: verified.weightGrams,
        priceMinor: verified.priceMinor,
      });
      consumedWeighLabel = scannedBarcode;
      basket.events.push({ eventType: isManualEntry ? 'MANUAL_ENTRY' : 'SCAN', barcode: scannedBarcode, productId: product!._id, quantity: 1, timestamp: new Date(), details: `Weighed produce label scanned from ${verified.scaleId}.` });
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
      consumedWeighLabel = undefined;
      res.json({ success: true, scannedProduct: product, verification: { kind: 'WEIGHED', labelBarcode: label.barcode, weightGrams: verified.weightGrams, priceMinor: verified.priceMinor, scaleId: verified.scaleId }, basket });
      return;
    }

    // Lookup product using server-side authoritative price
    const product = await Product.findOne({ storeId: basket.storeId, active: true, $or: [{ barcode: scannedBarcode }, { barcodeAliases: scannedBarcode }, { pluCode: scannedBarcode }] });

    if (!product) {
      // Track unknown barcode scan for risk scoring!
      basket.unknownBarcodeCount += 1;
      basket.events.push({
        eventType: 'UNKNOWN_BARCODE',
        barcode,
        timestamp: new Date(),
        details: `Customer scanned unregistered barcode ${barcode}`,
      });
      await basket.save();

      const now = new Date();
      await UnknownBarcode.findOneAndUpdate(
        { storeId: basket.storeId, barcode: String(barcode), status: 'OPEN' },
        { $set: { lastSeenAt: now, source: 'CUSTOMER_SCAN', reportedBy: req.user?.id, reportedByName: req.user?.name }, $setOnInsert: { storeId: basket.storeId, barcode: String(barcode), status: 'OPEN', firstSeenAt: now }, $inc: { seenCount: 1 } },
        { upsert: true }
      );

      res.status(404).json({
        success: false,
        error: `Unrecognized barcode [${barcode}]. Staff assistance required.`,
        unknownBarcodeCount: basket.unknownBarcodeCount,
        flaggedForInventoryReview: true,
      });
      return;
    }

    if (product.soldBy === 'weight') {
      res.status(409).json({ success: false, code: 'WEIGH_LABEL_REQUIRED', error: 'Scan the variable-measure label printed by the store scale for this produce.' });
      return;
    }

    const tagSerial = rawTagSerial ? String(rawTagSerial).trim() : '';
    if (product.requiresSerializedTag && !tagSerial) {
      res.status(409).json({ success: false, code: 'TAG_REQUIRED', productId: product._id, productName: product.name, error: 'Scan or enter this item’s serialized tag before adding it.' });
      return;
    }
    if (!product.requiresSerializedTag && tagSerial) {
      res.status(400).json({ success: false, error: 'This product does not require a serialized tag.' });
      return;
    }
    if (product.requiresSerializedTag && Number(quantity) !== 1) {
      res.status(400).json({ success: false, error: 'Tagged items and weighed produce labels must be added one at a time.' });
      return;
    }
    if (tagSerial) {
      const claimed = await SerializedTag.findOneAndUpdate(
        { tagSerial, storeId: basket.storeId, productId: product._id, status: 'IN_STORE' },
        { $set: { status: 'IN_BASKET', basketId: basket._id } },
        { new: true }
      );
      if (!claimed) {
        res.status(409).json({ success: false, code: 'TAG_UNAVAILABLE', error: 'Tag is unknown, belongs to another product/store, or is already in use.' });
        return;
      }
      claimedTagSerial = tagSerial;
    }

    // Log event
    if (isManualEntry) {
      basket.manualEntryCount += 1;
      basket.events.push({
        eventType: 'MANUAL_ENTRY',
        barcode,
        productId: product._id,
        quantity: normalizedQuantity,
        timestamp: new Date(),
        details: `Manual barcode entered: ${barcode}`,
      });
    } else {
      basket.events.push({
        eventType: 'SCAN',
        barcode,
        productId: product._id,
        quantity: normalizedQuantity,
        timestamp: new Date(),
        details: `Barcode scanned: ${barcode}`,
      });
    }

    // Check if item is already in basket
    const existingIndex = product.soldBy === 'unit' && !product.requiresSerializedTag
      ? basket.items.findIndex(i => i.productId.toString() === product._id.toString() && !(i as any).labelBarcode && !(i as any).tagSerial)
      : -1;
    if (existingIndex > -1) {
      basket.items[existingIndex].quantity += normalizedQuantity;
    } else {
      basket.items.push({
        productId: product._id,
        barcode: product.barcode,
        name: product.name,
        quantity: normalizedQuantity,
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
    claimedTagSerial = undefined;

    res.json({
      success: true,
      scannedProduct: product,
      basket,
    });
  } catch (error: any) {
    if (consumedWeighLabel) await WeighLabel.deleteOne({ barcode: consumedWeighLabel, basketId: req.params.id }).catch(() => {});
    if (claimedTagSerial) await SerializedTag.updateOne({ tagSerial: claimedTagSerial, basketId: req.params.id, status: 'IN_BASKET' }, { $set: { status: 'IN_STORE' }, $unset: { basketId: 1 } }).catch(() => {});
    if (error.tierLimit) {
      res.status(409).json({ success: false, code: 'TIER_LIMIT_REACHED', error: error.message });
      return;
    }
    if (error.code === 11000) {
      res.status(409).json({ success: false, code: 'WEIGH_LABEL_ALREADY_USED', error: 'This produce label has already been used.' });
      return;
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update quantity or remove item from basket
router.patch('/:id/items/:productId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { quantity } = req.body;
    const basket = await Basket.findById(req.params.id);

    if (!basket || basket.customerId.toString() !== req.user?.id) {
      res.status(404).json({ success: false, error: 'Basket not found or unauthorized.' });
      return;
    }
    if (await isBasketWriteBlocked(basket, res)) return;

    const itemIndex = basket.items.findIndex((i: any) => i.productId.toString() === req.params.productId &&
      (req.body.labelBarcode ? i.labelBarcode === req.body.labelBarcode : true) &&
      (req.body.tagSerial ? i.tagSerial === req.body.tagSerial : true));
    if (itemIndex === -1) {
      res.status(404).json({ success: false, error: 'Product not found in basket.' });
      return;
    }

    const currentQty = basket.items[itemIndex].quantity;
    if (((basket.items[itemIndex] as any).labelBarcode || (basket.items[itemIndex] as any).tagSerial) && quantity !== 0 && quantity !== 1) {
      res.status(400).json({ success: false, error: 'Weighed and serialized items can only be removed or kept as one line.' });
      return;
    }

    if (quantity <= 0) {
      // Complete removal
      basket.removalCount += 1;
      basket.events.push({
        eventType: 'REMOVAL',
        productId: basket.items[itemIndex].productId,
        barcode: basket.items[itemIndex].barcode,
        timestamp: new Date(),
        details: `Item removed from basket: ${basket.items[itemIndex].name}`,
      });
      const removed = basket.items[itemIndex] as any;
      if (removed.tagSerial) {
        await SerializedTag.updateOne({ tagSerial: removed.tagSerial, basketId: basket._id, status: 'IN_BASKET' }, { $set: { status: 'IN_STORE' }, $unset: { basketId: 1 } });
      }
      basket.items.splice(itemIndex, 1);
    } else {
      if (quantity < currentQty) {
        basket.removalCount += currentQty - quantity;
      }
      basket.items[itemIndex].quantity = quantity;
      basket.events.push({
        eventType: 'QUANTITY_CHANGE',
        productId: basket.items[itemIndex].productId,
        barcode: basket.items[itemIndex].barcode,
        quantity,
        timestamp: new Date(),
        details: `Quantity changed from ${currentQty} to ${quantity}`,
      });
    }

    recalculateBasket(basket);
    if (quantity > currentQty) {
      // Raising a quantity is the same as scanning more items, so the tier limits apply.
      const limitMessage = checkTierLimits(await loadStorePolicy(basket.storeId), basket.trustTier, { totalMinor: basket.totalMinor, totalItems: basket.totalItems });
      if (limitMessage) {
        res.status(409).json({ success: false, code: 'TIER_LIMIT_REACHED', error: limitMessage });
        return;
      }
    }
    await basket.save();

    res.json({ success: true, basket });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear active basket
router.delete('/:id/clear', authenticate, async (req: AuthRequest, res) => {
  try {
    const basket = await Basket.findById(req.params.id);
    if (!basket || basket.customerId.toString() !== req.user?.id) {
      res.status(404).json({ success: false, error: 'Basket not found.' });
      return;
    }
    if (await isBasketWriteBlocked(basket, res)) return;

    basket.items = [];
    await SerializedTag.updateMany({ basketId: basket._id, status: 'IN_BASKET' }, { $set: { status: 'IN_STORE' }, $unset: { basketId: 1 } });
    basket.removalCount += 1;
    recalculateBasket(basket);
    await basket.save();

    res.json({ success: true, basket });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;