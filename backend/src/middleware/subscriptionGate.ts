import { NextFunction, Response } from 'express';
import Store from '../modules/stores/store.model.js';
import { checkSubscriptionGate, SubscriptionOperation } from '../modules/subscriptions/subscription.service.js';
import { AuthRequest } from './auth.js';

type GateOptions = {
  organizationParam?: string;
};

async function resolveOrganizationId(req: AuthRequest, options: GateOptions): Promise<string | undefined> {
  const paramName = options.organizationParam;
  const paramOrganizationId = paramName ? req.params[paramName] : undefined;
  const bodyOrganizationId = req.body?.organizationId;
  if (paramOrganizationId || bodyOrganizationId) {
    return String(paramOrganizationId || bodyOrganizationId);
  }

  const storeId = req.body?.storeId || req.query.storeId || req.params.storeId || req.user?.storeId;
  if (storeId) {
    const store = await Store.findById(storeId).select('organizationId');
    if (!store?.organizationId) return undefined;
    return store.organizationId.toString();
  }

  return req.user?.organizationId;
}

/**
 * Blocks a feature before a route creates new commercial activity. It intentionally does not
 * guard reads, callbacks or completion of an already-created payment.
 */
export function requireSubscriptionGate(operation: SubscriptionOperation, options: GateOptions = {}) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = await resolveOrganizationId(req, options);
      if (!organizationId) {
        res.status(400).json({ success: false, error: 'A store or organization is required to check subscription access.' });
        return;
      }

      const result = await checkSubscriptionGate(organizationId, operation);
      if (!result.allowed) {
        res.status(result.status).json({
          success: false,
          error: result.reason,
          code: result.code,
          subscriptionStatus: result.subscription?.status,
          planCode: result.subscription?.planCode,
        });
        return;
      }

      (req as any).subscriptionContext = {
        organizationId,
        subscription: result.subscription,
        plan: result.plan,
      };
      next();
    } catch (error: any) {
      res.status(error.status || 500).json({ success: false, error: error.message || 'Unable to validate subscription access.' });
    }
  };
}

export async function rejectIfSubscriptionBlocked(
  res: Response,
  organizationId: string,
  operation: SubscriptionOperation
): Promise<boolean> {
  const result = await checkSubscriptionGate(organizationId, operation);
  if (result.allowed) return false;
  res.status(result.status).json({
    success: false,
    error: result.reason,
    code: result.code,
    subscriptionStatus: result.subscription?.status,
    planCode: result.subscription?.planCode,
  });
  return true;
}
