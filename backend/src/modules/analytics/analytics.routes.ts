import { Router } from 'express';
import { Types } from 'mongoose';
import Order from '../orders/order.model.js';
import Product from '../products/product.model.js';
import { authenticate, requireAnyPermission, AuthRequest, canAccessStore } from '../../middleware/auth.js';
import { consultAiForecast } from '../../services/aiVision.client.js';

const router = Router();

/**
 * Predictive analytics: demand forecasting powered by the Python AI service.
 *
 * Sales history comes from real orders (Mongo stays authoritative). The Python
 * service only sees daily quantity aggregates — never customer data. If the AI
 * service is down, forecasts degrade to a local moving average so dashboards
 * keep working.
 */

// Order statuses that represent a completed/committed sale.
const SALES_STATUSES = [
  'PAID', 'PICKING', 'AWAITING_CUSTOMER_APPROVAL', 'AWAITING_FINAL_PAYMENT',
  'READY_FOR_VERIFICATION', 'VERIFIED_AND_PACKED', 'READY_FOR_PICKUP',
  'COLLECTED', 'EXITED',
];

function resolveStoreId(req: AuthRequest, res: any): Types.ObjectId | null {
  const raw = (req.query.storeId as string) || req.user?.storeId;
  if (!raw || !Types.ObjectId.isValid(raw)) return null;
  return new Types.ObjectId(raw);
}

/** Daily unit sales per product for a store over the trailing window. */
async function dailySalesByProduct(storeId: Types.ObjectId, days: number, productId?: Types.ObjectId) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const pipeline: any[] = [
    { $match: { storeId, status: { $in: SALES_STATUSES }, createdAt: { $gte: since } } },
    { $unwind: '$items' },
  ];
  if (productId) pipeline.push({ $match: { 'items.productId': productId } });
  pipeline.push(
    {
      $group: {
        _id: {
          productId: '$items.productId',
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        },
        qty: { $sum: '$items.quantity' },
      },
    },
    { $sort: { '_id.date': 1 } },
  );
  return Order.aggregate(pipeline);
}

/** Local fallback forecast — same shape as the AI service, no external call. */
function localForecast(daily: { date: string; quantity: number }[], horizonDays: number, currentStock: number) {
  const qtys = daily.map((d) => d.quantity);
  const avg = qtys.length ? qtys.reduce((a, b) => a + b, 0) / qtys.length : 0;
  const dailyForecast = Array.from({ length: horizonDays }, (_, i) => ({
    dateOffset: i + 1,
    predictedQty: Math.round(avg * 100) / 100,
    lowerBound: 0,
    upperBound: Math.round(avg * 2 * 100) / 100,
  }));
  const burn = avg || 0.01;
  return {
    method: 'local_moving_average',
    dailyForecast,
    recommendedOrderQty: Math.max(0, Math.round((avg * horizonDays - currentStock) * 100) / 100),
    stockoutRiskDays: currentStock > 0 ? Math.round((currentStock / burn) * 10) / 10 : null,
    notes: ['AI_SERVICE_UNAVAILABLE: local moving-average fallback used.'],
  };
}

/** GET /analytics/demand/forecast?storeId=&productId=&days=90&horizon=7&leadTime=1 */
router.get('/demand/forecast', authenticate, requireAnyPermission('reports:read', 'inventory:read'), async (req: AuthRequest, res) => {
  try {
    const storeId = resolveStoreId(req, res);
    if (!storeId) {
      res.status(400).json({ success: false, error: 'storeId query param or user store required.' });
      return;
    }
    if (!(await canAccessStore(req.user!, storeId.toString()))) {
      res.status(403).json({ success: false, error: 'No access to this store.' });
      return;
    }
    const productIdRaw = req.query.productId as string;
    if (!productIdRaw || !Types.ObjectId.isValid(productIdRaw)) {
      res.status(400).json({ success: false, error: 'productId query param is required.' });
      return;
    }
    const productId = new Types.ObjectId(productIdRaw);
    const days = Math.min(Math.max(parseInt(String(req.query.days || '90'), 10) || 90, 7), 365);
    const horizonDays = Math.min(Math.max(parseInt(String(req.query.horizon || '7'), 10) || 7, 1), 90);
    const leadTimeDays = Math.max(parseInt(String(req.query.leadTime || '1'), 10) || 1, 0);

    const product = await Product.findOne({ _id: productId, storeId }).select('name barcode priceMinor stock active');
    if (!product) {
      res.status(404).json({ success: false, error: 'Product not found in this store.' });
      return;
    }

    const rows = await dailySalesByProduct(storeId, days, productId);
    const daily = rows.map((r: any) => ({ date: r._id.date, quantity: r.qty }));

    const ai = await consultAiForecast({
      productId: productId.toString(),
      storeId: storeId.toString(),
      daily,
      horizonDays,
      leadTimeDays,
      currentStock: product.stock ?? 0,
    });

    res.json({
      success: true,
      product: { id: product._id, name: product.name, barcode: product.barcode, stock: product.stock, active: product.active },
      historyDays: daily.length,
      totalUnitsSold: daily.reduce((s, d) => s + d.quantity, 0),
      forecast: ai
        ? { ...ai, method: `ai:${ai.method}` }
        : { productId: productId.toString(), ...localForecast(daily, horizonDays, product.stock ?? 0) },
      forecastSource: ai ? 'ai-service' : 'local-fallback',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /analytics/demand/top?storeId=&days=30&limit=20
 * Top-selling products with stock cover — cheap local stats, no AI calls,
 * so a dashboard can render instantly.
 */
router.get('/demand/top', authenticate, requireAnyPermission('reports:read', 'inventory:read'), async (req: AuthRequest, res) => {
  try {
    const storeId = resolveStoreId(req, res);
    if (!storeId) {
      res.status(400).json({ success: false, error: 'storeId query param or user store required.' });
      return;
    }
    if (!(await canAccessStore(req.user!, storeId.toString()))) {
      res.status(403).json({ success: false, error: 'No access to this store.' });
      return;
    }
    const days = Math.min(Math.max(parseInt(String(req.query.days || '30'), 10) || 30, 1), 365);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '20'), 10) || 20, 1), 100);

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await Order.aggregate([
      { $match: { storeId, status: { $in: SALES_STATUSES }, createdAt: { $gte: since } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          units: { $sum: '$items.quantity' },
          revenueMinor: { $sum: { $multiply: ['$items.quantity', '$items.unitPriceMinor'] } },
        },
      },
      { $sort: { units: -1 } },
      { $limit: limit },
    ]);

    const ids = rows.map((r: any) => r._id).filter(Boolean);
    const products = await Product.find({ _id: { $in: ids } }).select('name barcode stock priceMinor active');
    const byId = new Map(products.map((p: any) => [p._id.toString(), p]));

    const items = rows.map((r: any) => {
      const p: any = byId.get(String(r._id));
      const avgDaily = r.units / days;
      const stock = p?.stock ?? 0;
      return {
        productId: r._id,
        name: p?.name ?? 'Unknown product',
        barcode: p?.barcode,
        unitsSold: r.units,
        revenueMinor: r.revenueMinor,
        avgDailyUnits: Math.round(avgDaily * 100) / 100,
        currentStock: stock,
        daysOfStock: avgDaily > 0 ? Math.round((stock / avgDaily) * 10) / 10 : null,
        stockoutRisk: avgDaily > 0 && stock / avgDaily <= 7,
      };
    });

    res.json({ success: true, storeId, windowDays: days, items });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
