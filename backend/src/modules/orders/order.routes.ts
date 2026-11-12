import { Router } from 'express';
import crypto from 'crypto';
import Order from './order.model.js';
import Basket from '../baskets/basket.model.js';
import WeighLabel from '../baskets/weigh-label.model.js';
import SerializedTag from '../baskets/serialized-tag.model.js';
import Product from '../products/product.model.js';
import Store from '../stores/store.model.js';
import PickingTask from '../picking/picking.model.js';
import { authenticate, AuthRequest, requirePermission, canAccessStore } from '../../middleware/auth.js';
import Payment from '../payments/payment.model.js';
import User from '../users/user.model.js';
import { ENV } from '../../config/environment.js';
import { sendSms } from '../../shared/utils/sms.js';
import { balanceMinorOf, checkPickupOtp, computeDepositMinor, createPickupOtp, generateCollectOrderNumber, maskPhone } from '../../shared/utils/clickCollect.js';
import { generateBasketHash, generateRotatingQrPayload } from '../../shared/utils/crypto.js';
import AuditLog from '../audits/audit.model.js';
import Approval, { ApprovalType, ApprovalStatus } from '../approvals/approval.model.js';
import { broadcastEvent } from '../../shared/utils/eventStream.js';
import { rejectIfSubscriptionBlocked, requireSubscriptionGate } from '../../middleware/subscriptionGate.js';

const router = Router();

function generateOrderNumber(prefix = 'SG'): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomStr = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${dateStr}-${randomStr}`;
}

async function isStoreOperationBlocked(storeId: any, res: any, operation: 'scan_and_go' | 'click_and_collect'): Promise<boolean> {
  const store = await Store.findById(storeId).select('organizationId');
  if (!store?.organizationId) {
    res.status(409).json({ success: false, error: 'This store has not been assigned to an organization yet.' });
    return true;
  }
  return rejectIfSubscriptionBlocked(res, store.organizationId.toString(), operation);
}

// 1. Checkout Scan & Go basket -> Freeze into immutable Order snapshot
router.post('/checkout-basket', authenticate, async (req: AuthRequest, res) => {
  try {
    const { basketId } = req.body;
    const basket = await Basket.findById(basketId);

    if (!basket || basket.customerId.toString() !== req.user?.id) {
      res.status(404).json({ success: false, error: 'Basket not found or unauthorized.' });
      return;
    }
    if (await isStoreOperationBlocked(basket.storeId, res, 'scan_and_go')) return;

    if (basket.items.length === 0) {
      res.status(400).json({ success: false, error: 'Cannot checkout an empty basket.' });
      return;
    }

    // Recalculate authoritative server prices at time of checkout
    let authoritativeTotalMinor = 0;
    let authoritativeWeightGrams = 0;
    const orderItems = [];

    for (const item of basket.items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.active) {
        res.status(400).json({ success: false, error: `Product ${item.name} is no longer available.` });
        return;
      }

      const basketLine = item as any;
      if (basketLine.labelBarcode && (product.soldBy !== 'weight' || product.pricePerKgMinor !== basketLine.unitPriceAtScan || !basketLine.weightGrams)) {
        res.status(409).json({ success: false, code: 'WEIGHED_PRICE_CHANGED', error: `Rescan the produce label for ${item.name}; its catalogue price per kg changed.` });
        return;
      }
      if (basketLine.labelBarcode) {
        const label = await WeighLabel.findOne({ barcode: basketLine.labelBarcode, storeId: basket.storeId, basketId: basket._id, productId: product._id, weightGrams: basketLine.weightGrams, priceMinor: basketLine.unitPriceMinor });
        if (!label) {
          res.status(409).json({ success: false, code: 'WEIGH_LABEL_INVALID', error: `The produce label for ${item.name} is no longer valid.` });
          return;
        }
      }
      if (basketLine.tagSerial) {
        const tag = await SerializedTag.findOne({ tagSerial: basketLine.tagSerial, storeId: basket.storeId, productId: product._id, basketId: basket._id, status: 'IN_BASKET' });
        if (!tag) {
          res.status(409).json({ success: false, code: 'SERIAL_TAG_INVALID', error: `The serialized tag for ${item.name} is no longer reserved to this basket.` });
          return;
        }
      }
      const lineTotalMinor = basketLine.labelBarcode ? basketLine.unitPriceMinor : product.priceMinor * item.quantity;
      authoritativeTotalMinor += lineTotalMinor;
      if (basketLine.labelBarcode) {
        authoritativeWeightGrams += basketLine.weightGrams;
      } else if (product.weightGrams) {
        authoritativeWeightGrams += product.weightGrams * item.quantity;
      }

      orderItems.push({
        productId: product._id,
        productName: product.name,
        barcode: product.barcode,
        quantity: item.quantity,
        unitPriceMinor: basketLine.labelBarcode ? basketLine.unitPriceMinor : product.priceMinor,
        lineTotalMinor,
        priceVersion: product.priceVersion,
        weightGrams: basketLine.labelBarcode ? basketLine.weightGrams : product.weightGrams,
        isWeighted: product.isWeighted,
        highTheft: product.highTheft,
        labelBarcode: basketLine.labelBarcode,
        unitPriceAtScan: basketLine.unitPriceAtScan,
        scaleId: basketLine.scaleId,
        tagSerial: basketLine.tagSerial,
      });
    }

    const orderNumber = generateOrderNumber('SG');
    const basketHash = generateBasketHash(
      orderItems.map(i => ({
        productId: i.productId.toString(),
        quantity: i.quantity,
        unitPriceMinor: i.unitPriceMinor,
        weightGrams: i.weightGrams,
        labelBarcode: i.labelBarcode,
        scaleId: i.scaleId,
        tagSerial: i.tagSerial,
      }))
    );

    const order = await Order.create({
      orderNumber,
      orderType: 'SCAN_AND_GO',
      storeId: basket.storeId,
      customerId: req.user?.id,
      basketId: basket._id,
      // Carry the in-store presence tier to the exit check.
      storeSessionId: basket.storeSessionId,
      trustTier: basket.trustTier,
      presenceMethod: basket.presenceMethod,
      items: orderItems,
      totalMinor: authoritativeTotalMinor,
      totalItems: basket.totalItems,
      expectedWeightGrams: authoritativeWeightGrams,
      basketHash,
      status: 'PAYMENT_PENDING',
      statusHistory: [
        {
          status: 'PAYMENT_PENDING',
          changedAt: new Date(),
          changedBy: req.user?.id as any,
          note: 'Customer initiated checkout for Scan & Go',
        },
      ],
      lockedAt: new Date(),
    });

    await SerializedTag.updateMany({ basketId: basket._id, status: 'IN_BASKET' }, { $set: { orderId: order._id } });

    basket.status = 'CONVERTED';
    await basket.save();

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'CHECKOUT_ORDER',
      entityType: 'ORDER',
      entityId: order._id.toString(),
      storeId: order.storeId,
      newValue: { orderNumber: order.orderNumber, totalMinor: order.totalMinor },
    });

    broadcastEvent({
      type: 'order.created',
      payload: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        totalMinor: order.totalMinor,
      },
      storeId: order.storeId.toString(),
    });

    broadcastEvent({
      type: 'order.created',
      payload: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        pickupSlot: order.pickupSlot,
        totalMinor: order.totalMinor,
      },
      storeId: order.storeId.toString(),
      targetRoles: ['PICKER', 'SUPERVISOR', 'STORE_MANAGER'],
    });

    res.status(201).json({ success: true, order });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Submit Click & Collect Pre-Order (Shop First, Collect Later)
router.post('/click-and-collect', authenticate, requireSubscriptionGate('click_and_collect'), async (req: AuthRequest, res) => {
  try {
    const { storeId, items, pickupSlot, substitutionsAllowed = true } = req.body;
    let paymentPlan: 'FULL' | 'DEPOSIT' = req.body.paymentPlan === 'DEPOSIT' ? 'DEPOSIT' : 'FULL';

    if (!storeId || !items || !items.length || !pickupSlot) {
      res.status(400).json({ success: false, error: 'storeId, items, and pickupSlot are required.' });
      return;
    }

    let authoritativeTotalMinor = 0;
    let authoritativeWeightGrams = 0;
    let totalItems = 0;
    const orderItems = [];

    for (const reqItem of items) {
      const product = await Product.findById(reqItem.productId);
      if (!product || !product.active) {
        res.status(400).json({ success: false, error: `Product not found or inactive: ${reqItem.productId}` });
        return;
      }

      const qty = reqItem.quantity || 1;
      totalItems += qty;
      const lineTotalMinor = product.priceMinor * qty;
      authoritativeTotalMinor += lineTotalMinor;
      if (product.weightGrams) {
        authoritativeWeightGrams += product.weightGrams * qty;
      }

      orderItems.push({
        productId: product._id,
        productName: product.name,
        barcode: product.barcode,
        quantity: qty,
        unitPriceMinor: product.priceMinor,
        lineTotalMinor,
        priceVersion: product.priceVersion,
        weightGrams: product.weightGrams,
        isWeighted: product.isWeighted,
        highTheft: product.highTheft,
      });
    }

    // Pay-later guard: customers who repeatedly left packed orders uncollected must pay in full.
    let depositMinor = 0;
    if (paymentPlan === 'DEPOSIT') {
      const strikes = await Order.countDocuments({ customerId: req.user?.id, orderType: 'CLICK_AND_COLLECT', depositForfeitedAt: { $exists: true } });
      if (strikes >= ENV.CC_NOSHOW_STRIKE_LIMIT) {
        res.status(403).json({
          success: false,
          code: 'DEPOSIT_NOT_AVAILABLE',
          error: 'Because earlier orders were not collected, this account needs to pay in full for Shop & Collect.',
        });
        return;
      }
      depositMinor = computeDepositMinor(authoritativeTotalMinor);
      if (depositMinor >= authoritativeTotalMinor) paymentPlan = 'FULL'; // too small to split
      if (paymentPlan === 'FULL') depositMinor = 0;
    }

    const orderNumber = generateCollectOrderNumber();
    const basketHash = generateBasketHash(
      orderItems.map(i => ({
        productId: i.productId.toString(),
        quantity: i.quantity,
        unitPriceMinor: i.unitPriceMinor,
      }))
    );

    const order = await Order.create({
      orderNumber,
      orderType: 'CLICK_AND_COLLECT',
      storeId,
      customerId: req.user?.id,
      items: orderItems,
      totalMinor: authoritativeTotalMinor,
      totalItems,
      expectedWeightGrams: authoritativeWeightGrams,
      basketHash,
      status: 'PAYMENT_PENDING',
      pickupSlot,
      substitutionsAllowed,
      paymentPlan,
      depositMinor,
      paidMinor: 0,
      statusHistory: [
        {
          status: 'PAYMENT_PENDING',
          changedAt: new Date(),
          changedBy: req.user?.id as any,
          note: paymentPlan === 'DEPOSIT'
            ? `Shop & Collect order submitted. Deposit KES ${depositMinor / 100} now, balance KES ${(authoritativeTotalMinor - depositMinor) / 100} at pickup.`
            : 'Shop & Collect order submitted. Paying in full.',
        },
      ],
      lockedAt: new Date(),
    });

    broadcastEvent({
      type: 'order.created',
      payload: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        pickupSlot: order.pickupSlot,
        totalMinor: order.totalMinor,
      },
      storeId: order.storeId.toString(),
      targetRoles: ['PICKER', 'SUPERVISOR', 'STORE_MANAGER'],
    });

    res.status(201).json({
      success: true,
      order,
      dueNowMinor: paymentPlan === 'DEPOSIT' ? depositMinor : order.totalMinor,
      balanceAtPickupMinor: paymentPlan === 'DEPOSIT' ? order.totalMinor - depositMinor : 0,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Controlled Add-on Shopping (Customer adds extra items after placing an order)
router.post('/:id/create-addon', authenticate, async (req: AuthRequest, res) => {
  try {
    const parentOrder = await Order.findById(req.params.id);
    if (!parentOrder) {
      res.status(404).json({ success: false, error: 'Parent order not found.' });
      return;
    }
    if (req.user?.role !== 'CUSTOMER' || parentOrder.customerId.toString() !== req.user.id) {
      res.status(404).json({ success: false, error: 'Parent order not found.' });
      return;
    }
    if (await isStoreOperationBlocked(parentOrder.storeId, res, parentOrder.orderType === 'CLICK_AND_COLLECT' ? 'click_and_collect' : 'scan_and_go')) return;

    const { items } = req.body;
    if (!items || !items.length) {
      res.status(400).json({ success: false, error: 'Add-on items required.' });
      return;
    }

    let addonTotalMinor = 0;
    let addonItemsCount = 0;
    const orderItems = [];

    for (const reqItem of items) {
      const product = await Product.findById(reqItem.productId);
      if (!product) continue;

      const qty = reqItem.quantity || 1;
      addonItemsCount += qty;
      const lineTotalMinor = product.priceMinor * qty;
      addonTotalMinor += lineTotalMinor;

      orderItems.push({
        productId: product._id,
        productName: product.name,
        barcode: product.barcode,
        quantity: qty,
        unitPriceMinor: product.priceMinor,
        lineTotalMinor,
        priceVersion: product.priceVersion,
        weightGrams: product.weightGrams,
        isWeighted: product.isWeighted,
        highTheft: product.highTheft,
      });
    }

    const addonOrderNumber = `${parentOrder.orderNumber}-ADD1`;
    const basketHash = generateBasketHash(
      orderItems.map(i => ({
        productId: i.productId.toString(),
        quantity: i.quantity,
        unitPriceMinor: i.unitPriceMinor,
      }))
    );

    const addonOrder = await Order.create({
      orderNumber: addonOrderNumber,
      orderType: parentOrder.orderType,
      storeId: parentOrder.storeId,
      customerId: parentOrder.customerId,
      items: orderItems,
      totalMinor: addonTotalMinor,
      totalItems: addonItemsCount,
      basketHash,
      status: 'PAYMENT_PENDING',
      parentOrderId: parentOrder._id,
      isAddon: true,
      pickupSlot: parentOrder.pickupSlot,
      statusHistory: [
        {
          status: 'PAYMENT_PENDING',
          changedAt: new Date(),
          changedBy: req.user?.id as any,
          note: `Add-on shopping order attached to ${parentOrder.orderNumber}`,
        },
      ],
      lockedAt: new Date(),
    });

    res.status(201).json({ success: true, addonOrder });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Customer: list substitutions the picker is still waiting on for one of my orders
router.get('/:id/substitutions/pending', authenticate, async (req: AuthRequest, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }
    if (req.user?.role !== 'CUSTOMER' || order.customerId.toString() !== req.user.id) {
      res.status(403).json({ success: false, error: 'Unauthorized.' });
      return;
    }

    const pickingTask = await PickingTask.findOne({ orderId: order._id });
    const substitutions = (pickingTask?.items || [])
      .filter((i: any) => i.substitution && i.substitution.customerApproval === 'PENDING')
      .map((i: any) => ({
        orderId: order._id,
        orderNumber: order.orderNumber,
        productId: i.productId,
        originalName: i.name,
        replacementName: i.substitution.replacementName,
        replacementPriceMinor: i.substitution.replacementPriceMinor,
        priceDifferenceMinor: i.substitution.priceDifferenceMinor,
      }));

    res.json({ success: true, substitutions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Customer responds to substitution request (APPROVE or REJECT)
router.post('/:id/substitutions/:productId/respond', authenticate, async (req: AuthRequest, res) => {
  try {
    const { decision } = req.body; // 'APPROVED' or 'REJECTED'
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      res.status(400).json({ success: false, error: "decision must be 'APPROVED' or 'REJECTED'." });
      return;
    }
    const order = await Order.findById(req.params.id);
    if (!order) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }

    // SECURITY: only the customer who owns the order can approve or reject a substitution.
    if (req.user?.role !== 'CUSTOMER' || order.customerId.toString() !== req.user.id) {
      res.status(403).json({ success: false, error: 'Only the customer who placed this order can respond to a substitution.' });
      return;
    }

    const pickingTask = await PickingTask.findOne({ orderId: order._id });
    if (!pickingTask) {
      res.status(404).json({ success: false, error: 'Picking task not found' });
      return;
    }

    const item = pickingTask.items.find(
      i => i.productId.toString() === req.params.productId && i.substitution
    );

    if (!item || !item.substitution) {
      res.status(404).json({ success: false, error: 'Substitution request not found for this item' });
      return;
    }

    item.substitution.customerApproval = decision;
    item.substitution.respondedAt = new Date();

    if (decision === 'APPROVED') {
      item.status = 'SUBSTITUTED';
      item.isVerified = true;
      item.scannedQuantity = item.requiredQuantity;
      // Adjust order total if replacement price differs
      order.totalMinor += item.substitution.priceDifferenceMinor * item.requiredQuantity;
    } else {
      item.status = 'OUT_OF_STOCK';
      // Deduct unavailable item amount for refund
      const itemRecord = order.items.find(i => i.productId.toString() === req.params.productId);
      if (itemRecord) {
        order.totalMinor -= itemRecord.lineTotalMinor;
      }
    }

    await pickingTask.save();
    order.status = 'PICKING';
    order.statusHistory.push({
      status: 'PICKING',
      changedAt: new Date(),
      changedBy: req.user?.id as any,
      note: `Customer ${decision} substitution for ${item.name}`,
    });
    await order.save();

    broadcastEvent({
      type: 'substitution.responded',
      payload: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        productId: req.params.productId,
        decision,
        itemName: item.name,
      },
      storeId: order.storeId.toString(),
      targetRoles: ['PICKER', 'SUPERVISOR', 'STORE_MANAGER'],
    });

    res.json({ success: true, message: `Substitution ${decision}`, order, pickingTask });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Dynamic Rotating QR Token (rotates every 30s to prevent screenshot sharing)
router.get('/:id/rotating-qr', authenticate, async (req: AuthRequest, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      res.status(404).json({ success: false, error: 'Order not found.' });
      return;
    }

    // The exit pass belongs to the shopper alone. Staff scan it; they never need to fetch it, and a
    // staff account that could would be able to mint passes for baskets they did not pay for.
    if (req.user?.role !== 'CUSTOMER' || order.customerId.toString() !== req.user.id) {
      res.status(403).json({ success: false, error: 'Unauthorized.' });
      return;
    }

    if (!order.collectionQrToken) {
      res.status(400).json({ success: false, error: 'Order does not have an active QR receipt token.' });
      return;
    }

    const { dynamicPayload, window, secondsRemaining } = generateRotatingQrPayload(order.collectionQrToken);

    res.json({
      success: true,
      dynamicQrToken: dynamicPayload,
      window,
      secondsRemaining,
      orderNumber: order.orderNumber,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List orders (Customer sees own orders; staff strictly scoped to assigned branch; admin can query any branch)
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const perms = user.permissions || [];
    const query: any = {};

    if (user.role === 'CUSTOMER') {
      // Shoppers only ever see their own orders.
      query.customerId = user.id;
    } else if (perms.includes('orders:read:any')) {
      // Platform support/risk roles: any store, optionally filtered.
      if (req.query.storeId) query.storeId = req.query.storeId;
    } else if (perms.includes('orders:read:org') && user.organizationId) {
      // Org roles: only branches of their own organization.
      const orgStoreIds = await Store.find({ organizationId: user.organizationId }).distinct('_id');
      if (req.query.storeId) {
        if (!orgStoreIds.some((id: any) => String(id) === String(req.query.storeId))) {
          res.status(403).json({ success: false, error: 'That branch does not belong to your organization.' });
          return;
        }
        query.storeId = req.query.storeId;
      } else {
        query.storeId = { $in: orgStoreIds };
      }
    } else if (perms.includes('orders:read:store')) {
      // Branch staff: locked to their assigned branch, whatever the query says.
      if (!user.storeId) {
        res.status(403).json({ success: false, error: 'Staff member is not assigned to any retail store branch.' });
        return;
      }
      query.storeId = user.storeId;
    } else {
      res.status(403).json({ success: false, error: 'You do not have permission to view orders.' });
      return;
    }

    if (req.query.status) {
      query.status = req.query.status;
    }
    if (req.query.orderType) {
      query.orderType = req.query.orderType;
    }

    const orders = await Order.find(query).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, count: orders.length, orders });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get order details with security & scope checks
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('storeId', 'name code location exitLanes pickupSlots')
      .populate('customerId', 'name phone cleanTrips confirmedDiscrepancies');

    if (!order) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }

    // Role-based visibility check (same rules as the list endpoint)
    const viewer = req.user!;
    const viewerPerms = viewer.permissions || [];
    const orderStoreId = (order.storeId as any)?._id?.toString() || order.storeId?.toString();
    if (viewer.role === 'CUSTOMER') {
      const orderCustomerId = (order.customerId as any)?._id?.toString() || order.customerId?.toString();
      if (orderCustomerId !== viewer.id) {
        res.status(403).json({ success: false, error: 'Access denied: You cannot view orders placed by other customers.' });
        return;
      }
    } else if (viewerPerms.includes('orders:read:any')) {
      // platform support / risk: allowed
    } else if (viewerPerms.includes('orders:read:org') || viewerPerms.includes('orders:read:store')) {
      if (!(await canAccessStore(viewer, orderStoreId))) {
        res.status(403).json({ success: false, error: 'Access denied: Order belongs to a different store branch.' });
        return;
      }
    } else {
      res.status(403).json({ success: false, error: 'You do not have permission to view orders.' });
      return;
    }

    // Check picking task if Click & Collect
    const pickingTask = await PickingTask.findOne({ orderId: order._id })
      .populate('pickerId', 'name phone')
      .populate('verifierId', 'name phone');

    res.json({ success: true, order, pickingTask });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cashier / Customer Service Safe Refund Endpoint
router.post('/cashier/refund', authenticate, requirePermission('orders:refund'), async (req: AuthRequest, res) => {
  try {
    const { orderId, refundAmountMinor, reason, itemBarcodes } = req.body;
    if (!orderId || !refundAmountMinor || !reason) {
      res.status(400).json({ success: false, error: 'orderId, refundAmountMinor, and reason are required.' });
      return;
    }

    const order = await Order.findById(orderId);
    if (!order || !(await canAccessStore(req.user!, String(order.storeId)))) {
      res.status(404).json({ success: false, error: 'Order not found.' });
      return;
    }

    const CASHIER_LIMIT_MINOR = 200000; // KES 2,000 threshold
    const isOverLimit = Number(refundAmountMinor) > CASHIER_LIMIT_MINOR;
    const isCashierRole = req.user?.role === 'CASHIER_CUSTOMER_SERVICE';

    // If over limit or initiated by cashier exceeding threshold, route to Branch Manager maker-checker
    if (isOverLimit && isCashierRole) {
      const approval = await Approval.create({
        type: ApprovalType.REFUND_REQUEST,
        status: ApprovalStatus.PENDING,
        requestedBy: req.user?.id as any,
        requestedByRole: req.user?.role || 'CASHIER_CUSTOMER_SERVICE',
        requestedByName: req.user?.name || 'Cashier',
        targetType: 'STORE',
        targetId: order.storeId as any,
        requestData: {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          refundAmountMinor: Number(refundAmountMinor),
          reason,
          itemBarcodes,
          limitExceeded: true,
        },
        requiresSecondFactor: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        notes: `Cashier refund request of KES ${Number(refundAmountMinor) / 100} exceeds staff limit of KES 2,000. Requires Manager approval.`,
        creatorCanApprove: false,
      });

      broadcastEvent({
        type: 'approval.created',
        payload: {
          approvalId: approval._id,
          type: 'REFUND_REQUEST',
          orderNumber: order.orderNumber,
          amountMinor: refundAmountMinor,
        },
        storeId: order.storeId.toString(),
        targetRoles: ['BRANCH_MANAGER', 'STORE_MANAGER', 'SUPERVISOR'],
      });

      res.json({
        success: true,
        escalated: true,
        message: `Refund amount KES ${Number(refundAmountMinor) / 100} exceeds cashier threshold (KES 2,000). Escalated to Branch Manager for dual sign-off.`,
        approvalId: approval._id,
      });
      return;
    }

    // Direct refund processing within cashier limit or authorized supervisor
    order.statusHistory.push({
      status: order.status,
      changedAt: new Date(),
      changedBy: req.user?.id as any,
      note: `Refund processed: KES ${Number(refundAmountMinor) / 100}. Reason: ${reason} (Staff: ${req.user?.name})`,
    });
    await order.save();

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'CASHIER_REFUND',
      entityType: 'ORDER',
      entityId: order._id.toString(),
      storeId: order.storeId,
      newValue: { refundAmountMinor, reason, processedInstantly: true },
    });

    res.json({
      success: true,
      escalated: false,
      message: `Refund of KES ${Number(refundAmountMinor) / 100} processed immediately.`,
      order,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Shop & Collect counter: order number -> SMS OTP to the registered phone -> (balance prompt) -> release
// ─────────────────────────────────────────────────────────────────────────────
const handoverGuard = [authenticate, requirePermission('orders:handover')];

function canActOnStore(req: AuthRequest, order: any): boolean {
  const userStore = (req.user as any)?.storeId;
  return !!userStore && String(userStore) === String(order.storeId);
}

function handoverSummary(order: any, customer?: any) {
  return {
    _id: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    totalMinor: order.totalMinor,
    paidMinor: order.paidMinor || 0,
    balanceMinor: balanceMinorOf(order),
    paymentPlan: order.paymentPlan,
    totalItems: order.totalItems,
    pickupSlot: order.pickupSlot,
    customerName: customer?.name,
    customerPhoneMasked: maskPhone(customer?.phone),
    verified: Boolean(order.handoverVerifiedAt),
  };
}

async function findCollectOrder(req: AuthRequest, res: any, id: string, withOtp = false) {
  const query = Order.findOne({ _id: id, orderType: 'CLICK_AND_COLLECT' });
  const order = await (withOtp ? query.select('+handoverOtpHash') : query);
  if (!order) {
    res.status(404).json({ success: false, error: 'Shop & Collect order not found.' });
    return null;
  }
  if (!canActOnStore(req, order)) {
    res.status(403).json({ success: false, error: 'This order belongs to a different store.' });
    return null;
  }
  return order;
}

async function completeHandover(order: any, req: AuthRequest, note: string) {
  order.status = 'COLLECTED';
  order.collectedAt = new Date();
  order.statusHistory.push({ status: 'COLLECTED', changedAt: new Date(), changedBy: req.user?.id as any, note });
  await order.save();
  await AuditLog.create({
    actorId: req.user?.id,
    actorRole: req.user?.role,
    actorName: req.user?.name,
    action: 'COLLECTION_HANDOVER_COMPLETED',
    entityType: 'ORDER',
    entityId: order._id.toString(),
    storeId: order.storeId,
    newValue: { collectedAt: order.collectedAt, paidMinor: order.paidMinor, handedOverBy: req.user?.name },
  });
}

// 1. Staff types the order number the customer quotes.
router.post('/handover/lookup', ...handoverGuard, async (req: AuthRequest, res) => {
  try {
    const orderNumber = String(req.body.orderNumber || '').trim().toUpperCase();
    if (!orderNumber) {
      res.status(400).json({ success: false, error: 'Enter the order number the customer was given.' });
      return;
    }
    const order = await Order.findOne({ orderNumber, orderType: 'CLICK_AND_COLLECT' });
    if (!order || !canActOnStore(req, order)) {
      res.status(404).json({ success: false, error: 'No Shop & Collect order with that number at this store.' });
      return;
    }
    const customer = await User.findById(order.customerId).select('name phone');

    const blocked: Record<string, string> = {
      COLLECTED: 'ALREADY COLLECTED: this order was already handed over.',
      PAYMENT_PENDING: 'Not paid yet: the customer has not paid the deposit or full amount.',
      PICKING: 'Still being picked. Ask the customer to wait for the ready notification.',
      AWAITING_CUSTOMER_APPROVAL: 'Waiting for the customer to approve a substitution.',
      READY_FOR_VERIFICATION: 'Still being checked and packed.',
      HELD: 'On hold: refer to a supervisor.',
      CANCELLED: 'This order was cancelled.',
      EXPIRED: 'This order expired as a no-show.',
      REFUNDED: 'This order was refunded.',
    };
    if (blocked[order.status]) {
      res.status(409).json({ success: false, error: blocked[order.status], order: handoverSummary(order, customer) });
      return;
    }
    res.json({ success: true, order: handoverSummary(order, customer) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Send a one-time code to the phone registered on the order (not a number staff can type in).
router.post('/handover/:id/send-otp', ...handoverGuard, async (req: AuthRequest, res) => {
  try {
    const order = await findCollectOrder(req, res, String(req.params.id), true);
    if (!order) return;
    if (order.status !== 'READY_FOR_PICKUP') {
      res.status(409).json({ success: false, error: `Order is not ready for handover (status: ${order.status}).` });
      return;
    }
    const lastSent = order.handoverOtpExpiresAt ? order.handoverOtpExpiresAt.getTime() - ENV.CC_PICKUP_OTP_TTL_MS : 0;
    if (Date.now() - lastSent < 30_000) {
      res.status(429).json({ success: false, error: 'A code was just sent. Wait 30 seconds before sending another.' });
      return;
    }
    const customer = await User.findById(order.customerId).select('name phone');
    if (!customer?.phone) {
      res.status(409).json({ success: false, error: 'No phone number is registered for this customer. Refer to a supervisor.' });
      return;
    }
    const otp = await createPickupOtp();
    order.handoverOtpHash = otp.hash;
    order.handoverOtpExpiresAt = otp.expiresAt;
    order.handoverOtpAttempts = 0;
    await order.save();

    const delivered = await sendSms(
      customer.phone,
      `Your pickup code for order ${order.orderNumber} is ${otp.code}. Give it to the collection staff only when you are at the counter. Valid ${Math.round(ENV.CC_PICKUP_OTP_TTL_MS / 60000)} min.`
    );
    await AuditLog.create({
      actorId: req.user?.id, actorRole: req.user?.role, actorName: req.user?.name,
      action: 'PICKUP_OTP_SENT', entityType: 'ORDER', entityId: order._id.toString(), storeId: order.storeId,
      newValue: { delivered },
    });
    res.json({
      success: true,
      delivered,
      sentTo: maskPhone(customer.phone),
      expiresInSeconds: Math.round(ENV.CC_PICKUP_OTP_TTL_MS / 1000),
      // Outside production only, and only when no SMS provider is configured, so the flow can be tested without an SMS bill.
      ...(!delivered && ENV.NODE_ENV !== 'production' ? { devOtpCode: otp.code } : {}),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Customer reads the code to staff; staff confirms they looked at the customer's ID.
router.post('/handover/:id/verify-otp', ...handoverGuard, async (req: AuthRequest, res) => {
  try {
    const { otp, idChecked } = req.body;
    if (idChecked !== true) {
      res.status(400).json({ success: false, error: 'Confirm that you checked the customer’s ID before verifying.' });
      return;
    }
    const order = await findCollectOrder(req, res, String(req.params.id), true);
    if (!order) return;
    if (order.status !== 'READY_FOR_PICKUP') {
      res.status(409).json({ success: false, error: `Order is not ready for handover (status: ${order.status}).` });
      return;
    }
    if (!order.handoverOtpHash || !order.handoverOtpExpiresAt || order.handoverOtpExpiresAt.getTime() < Date.now()) {
      res.status(409).json({ success: false, code: 'OTP_EXPIRED', error: 'The code has expired or was never sent. Send a new code.' });
      return;
    }
    if ((order.handoverOtpAttempts || 0) >= ENV.CC_PICKUP_OTP_MAX_ATTEMPTS) {
      order.handoverOtpHash = undefined;
      await order.save();
      res.status(429).json({ success: false, code: 'OTP_LOCKED', error: 'Too many wrong codes. Send a new code, and take care that the person is the account holder.' });
      return;
    }
    const ok = await checkPickupOtp(String(otp || '').trim(), order.handoverOtpHash);
    if (!ok) {
      order.handoverOtpAttempts = (order.handoverOtpAttempts || 0) + 1;
      await order.save();
      await AuditLog.create({
        actorId: req.user?.id, actorRole: req.user?.role, actorName: req.user?.name,
        action: 'PICKUP_OTP_FAILED', entityType: 'ORDER', entityId: order._id.toString(), storeId: order.storeId,
        newValue: { attempts: order.handoverOtpAttempts },
      });
      res.status(400).json({ success: false, error: 'That code is not correct.', attemptsLeft: Math.max(0, ENV.CC_PICKUP_OTP_MAX_ATTEMPTS - order.handoverOtpAttempts) });
      return;
    }

    order.handoverOtpHash = undefined; // single use
    order.handoverOtpExpiresAt = undefined;
    order.handoverVerifiedAt = new Date();
    order.handoverVerifiedBy = req.user?.id as any;
    const balance = balanceMinorOf(order);

    if (balance > 0) {
      order.status = 'AWAITING_FINAL_PAYMENT';
      order.statusHistory.push({
        status: 'AWAITING_FINAL_PAYMENT',
        changedAt: new Date(),
        changedBy: req.user?.id as any,
        note: `Customer verified by OTP and ID at the counter. Balance KES ${balance / 100} to be paid before release.`,
      });
      await order.save();
      const customer = await User.findById(order.customerId).select('name phone');
      res.json({ success: true, requiresPayment: true, order: handoverSummary(order, customer) });
      return;
    }

    await completeHandover(order, req, `Verified by OTP and ID check. Fully paid. Handed over by ${req.user?.name}.`);
    const customer = await User.findById(order.customerId).select('name phone');
    res.json({ success: true, requiresPayment: false, completed: true, message: `Order ${order.orderNumber} handed over.`, order: handoverSummary(order, customer) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. After the balance is paid (the order returns to READY_FOR_PICKUP), staff releases the goods.
router.post('/handover/:id/complete', ...handoverGuard, async (req: AuthRequest, res) => {
  try {
    const order = await findCollectOrder(req, res, String(req.params.id));
    if (!order) return;
    const freshEnough = order.handoverVerifiedAt && Date.now() - order.handoverVerifiedAt.getTime() < 30 * 60 * 1000;
    if (order.status !== 'READY_FOR_PICKUP' || !freshEnough) {
      res.status(409).json({ success: false, error: 'Verify the customer at the counter first.' });
      return;
    }
    if (balanceMinorOf(order) > 0) {
      res.status(409).json({ success: false, error: 'The balance has not been paid yet.' });
      return;
    }
    await completeHandover(order, req, `Balance settled and handed over by ${req.user?.name}.`);
    const customer = await User.findById(order.customerId).select('name phone');
    res.json({ success: true, message: `Order ${order.orderNumber} handed over.`, order: handoverSummary(order, customer) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Customer will not pay the balance now: put the order back so it is not stuck.
router.post('/handover/:id/abort', ...handoverGuard, async (req: AuthRequest, res) => {
  try {
    const order = await findCollectOrder(req, res, String(req.params.id));
    if (!order) return;
    if (order.status !== 'AWAITING_FINAL_PAYMENT' || !order.handoverVerifiedAt) {
      res.status(409).json({ success: false, error: 'Nothing to cancel for this order.' });
      return;
    }
    if (await Payment.exists({ orderId: order._id, status: 'PENDING' })) {
      res.status(409).json({ success: false, error: 'A payment prompt is still active. Wait for it to finish or expire first.' });
      return;
    }
    order.status = 'READY_FOR_PICKUP';
    order.handoverVerifiedAt = undefined;
    order.statusHistory.push({ status: 'READY_FOR_PICKUP', changedAt: new Date(), changedBy: req.user?.id as any, note: `Balance not paid at counter; order kept for later. Reset by ${req.user?.name}.` });
    await order.save();
    res.json({ success: true, message: 'Order kept aside. The customer can come back and pay the balance.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
