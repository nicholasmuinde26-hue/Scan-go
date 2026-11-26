import Order from './order.model.js';
import Basket from '../baskets/basket.model.js';
import WeighLabel from '../baskets/weigh-label.model.js';
import SerializedTag from '../baskets/serialized-tag.model.js';
import Product from '../products/product.model.js';
import AuditLog from '../audits/audit.model.js';
import { generateBasketHash } from '../../shared/utils/crypto.js';
import { broadcastEvent } from '../../shared/utils/eventStream.js';
import { mirrorOrder } from '../financial/financial-ledger.service.js';

/** Error carrying the HTTP status/payload the route layer should return. */
export class CheckoutError extends Error {
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

function generateOrderNumber(prefix = 'SG'): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomStr = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${dateStr}-${randomStr}`;
}

export interface CheckoutActor {
  id?: string;
  role?: string;
  name?: string;
}

/**
 * Freeze an OPEN basket into an immutable Order snapshot with server-
 * authoritative prices. Shared by the customer self-checkout route and the
 * cashier POS — the order always belongs to basket.customerId (which may be
 * a guest shadow user), never to whoever is operating the till.
 */
export async function checkoutBasketToOrder(basket: any, actor: CheckoutActor, note = 'Customer initiated checkout for Scan & Go') {
  if (basket.status !== 'OPEN') {
    throw new CheckoutError(400, 'Basket is locked or already converted.', { code: 'BASKET_NOT_OPEN' });
  }
  if (!basket.items?.length) {
    throw new CheckoutError(400, 'Cannot checkout an empty basket.');
  }

  // Recalculate authoritative server prices at time of checkout
  let authoritativeTotalMinor = 0;
  let authoritativeWeightGrams = 0;
  const orderItems = [];

  for (const item of basket.items) {
    const product = await Product.findById(item.productId);
    if (!product || !product.active) {
      throw new CheckoutError(400, `Product ${item.name} is no longer available.`);
    }

    const basketLine = item as any;
    if (basketLine.labelBarcode && (product.soldBy !== 'weight' || product.pricePerKgMinor !== basketLine.unitPriceAtScan || !basketLine.weightGrams)) {
      throw new CheckoutError(409, `Rescan the produce label for ${item.name}; its catalogue price per kg changed.`, { code: 'WEIGHED_PRICE_CHANGED' });
    }
    if (basketLine.labelBarcode) {
      const label = await WeighLabel.findOne({ barcode: basketLine.labelBarcode, storeId: basket.storeId, basketId: basket._id, productId: product._id, weightGrams: basketLine.weightGrams, priceMinor: basketLine.unitPriceMinor });
      if (!label) {
        throw new CheckoutError(409, `The produce label for ${item.name} is no longer valid.`, { code: 'WEIGH_LABEL_INVALID' });
      }
    }
    if (basketLine.tagSerial) {
      const tag = await SerializedTag.findOne({ tagSerial: basketLine.tagSerial, storeId: basket.storeId, productId: product._id, basketId: basket._id, status: 'IN_BASKET' });
      if (!tag) {
        throw new CheckoutError(409, `The serialized tag for ${item.name} is no longer reserved to this basket.`, { code: 'SERIAL_TAG_INVALID' });
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
    customerId: basket.customerId,
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
        changedBy: actor.id as any,
        note,
      },
    ],
    lockedAt: new Date(),
  });

  await SerializedTag.updateMany({ basketId: basket._id, status: 'IN_BASKET' }, { $set: { orderId: order._id } });

  basket.status = 'CONVERTED';
  await basket.save();

  await AuditLog.create({
    actorId: actor.id as any,
    actorRole: actor.role,
    actorName: actor.name,
    action: 'CHECKOUT_ORDER',
    entityType: 'ORDER',
    entityId: order._id.toString(),
    storeId: order.storeId,
    newValue: { orderNumber: order.orderNumber, totalMinor: order.totalMinor, basketId: basket._id },
  }).catch(() => {});

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

  void mirrorOrder(order);

  return order;
}
