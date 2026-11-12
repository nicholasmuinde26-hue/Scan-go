import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { AuthRequest, canAccessStore } from './auth.js';

/**
 * Route guards for tenant scoping. These answer "is this record in MY tenant?",
 * while requirePermission() answers "may my role do this action at all?".
 * Use both: permission first, then scope.
 */

type Source = 'params' | 'query' | 'body';

/** Require that the storeId found in params/query/body is a branch the caller may access. */
export function requireStoreAccess(source: Source = 'params', key = 'id') {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Not authenticated.' });
        return;
      }
      const storeId = String((req as any)[source]?.[key] || '');
      if (!storeId || !Types.ObjectId.isValid(storeId)) {
        res.status(400).json({ success: false, error: 'A valid store is required.' });
        return;
      }
      if (!(await canAccessStore(req.user, storeId))) {
        // 404 rather than 403 so callers cannot probe which branches exist.
        res.status(404).json({ success: false, error: 'Store not found.' });
        return;
      }
      next();
    } catch {
      res.status(500).json({ success: false, error: 'Could not verify branch access.' });
    }
  };
}

/** Require that the order in :orderId (or the given param) belongs to a branch the caller may access. */
export function requireOrderStoreAccess(param = 'orderId') {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Not authenticated.' });
        return;
      }
      const orderId = String(req.params[param] || '');
      if (!Types.ObjectId.isValid(orderId)) {
        res.status(404).json({ success: false, error: 'Order not found.' });
        return;
      }
      const orderModule = await import('../modules/orders/order.model.js');
      const order = await (orderModule.default as any).findById(orderId).select('storeId');
      if (!order || !(await canAccessStore(req.user, String(order.storeId)))) {
        res.status(404).json({ success: false, error: 'Order not found.' });
        return;
      }
      next();
    } catch {
      res.status(500).json({ success: false, error: 'Could not verify order access.' });
    }
  };
}
