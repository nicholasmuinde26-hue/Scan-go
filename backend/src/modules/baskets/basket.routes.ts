import { Router } from 'express';
import Basket from './basket.model.js';
import Product from '../products/product.model.js';
import Store from '../stores/store.model.js';
import SerializedTag from './serialized-tag.model.js';
import { authenticate, AuthRequest, canAccessStore, requirePermission } from '../../middleware/auth.js';
import { applyProductScan, recalculateBasket, BasketOpError } from './basket.service.js';
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

// Scan product or enter manual barcode.
// The heavy lifting lives in basket.service.applyProductScan so the customer
// app and registered devices (smart baskets, lane scanners) share one path.
router.post('/:id/scan', authenticate, async (req: AuthRequest, res) => {
  try {
    const { barcode, isManualEntry, quantity = 1, tagSerial } = req.body;
    const basket = await Basket.findById(req.params.id);

    if (!basket || basket.customerId.toString() !== req.user?.id) {
      res.status(404).json({ success: false, error: 'Basket not found or unauthorized.' });
      return;
    }

    if (await isBasketWriteBlocked(basket, res)) return;
    const presencePolicy = await requireLiveSession(basket, res);
    if (!presencePolicy) return;

    const result = await applyProductScan(
      basket,
      { barcode, quantity, isManualEntry: !!isManualEntry, tagSerial },
      presencePolicy,
      { reportedBy: req.user?.id, reportedByName: req.user?.name, source: 'APP' },
    );

    if (result.kind === 'WEIGHED') {
      res.json({ success: true, scannedProduct: result.product, verification: result.verification, basket: result.basket });
      return;
    }
    res.json({ success: true, scannedProduct: result.product, basket: result.basket });
  } catch (error: any) {
    if (error instanceof BasketOpError) {
      res.status(error.status).json({ success: false, code: error.code, error: error.message, ...(error.data || {}) });
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

// Fetch a single basket (owner only) — used by the app to reload basket state
// on checkout/review screens.
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const basket = await Basket.findById(req.params.id);
    if (!basket || basket.customerId.toString() !== req.user?.id) {
      res.status(404).json({ success: false, error: 'Basket not found.' });
      return;
    }
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