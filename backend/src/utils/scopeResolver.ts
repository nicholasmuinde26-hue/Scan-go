import { Types } from 'mongoose';
import { AuthRequest } from '../middleware/auth.js';
import Store from '../modules/stores/store.model.js';
import { canAccessStore } from '../middleware/auth.js';

/**
 * Resolve the target organization and store based on the inviter's role and request payload.
 * Returns an object { organizationId: string, storeId?: string } or throws an error response.
 */
export async function resolveTargetScope(req: AuthRequest, role: string, payload: {
  organizationId?: string;
  storeId?: string;
  managedStoreIds?: string[];
}) {
  const inviter = req.user!;
  const inviterRole = inviter.role;
  const isPlatform = ['PLATFORM_OWNER', 'PLATFORM_ADMIN'].includes(inviterRole);
  const isOrg = ['ORG_OWNER', 'ORG_ADMIN'].includes(inviterRole);
  const isRegion = inviterRole === 'REGION_MANAGER';

  let targetOrgId: string | undefined = undefined;
  let targetStoreId: string | undefined = undefined;

  if (isPlatform) {
    targetOrgId = payload.organizationId;
    targetStoreId = payload.storeId;
    if (targetStoreId) {
      const store = await Store.findById(targetStoreId).select('organizationId');
      if (!store) throw { status: 404, message: 'Store not found.' };
      if (targetOrgId && store.organizationId?.toString() !== targetOrgId) {
        throw { status: 400, message: 'Store does not belong to the chosen organization.' };
      }
      targetOrgId = store.organizationId?.toString();
    }
  } else if (isOrg) {
    targetOrgId = inviter.organizationId;
    targetStoreId = payload.storeId;
    if (targetStoreId && !(await canAccessStore(inviter, targetStoreId))) {
      throw { status: 403, message: 'That branch does not belong to your organization.' };
    }
  } else if (isRegion) {
    targetOrgId = inviter.organizationId;
    const allowed = (inviter.managedStoreIds || []).map(String);
    targetStoreId = payload.storeId;
    if (targetStoreId && !allowed.includes(targetStoreId)) {
      throw { status: 403, message: 'That branch is outside your region.' };
    }
    // additionally check managedStoreIds if supplied
    if (payload.managedStoreIds) {
      const bad = payload.managedStoreIds.some(id => !allowed.includes(id));
      if (bad) throw { status: 403, message: 'You can only assign branches inside your region.' };
    }
  } else {
    // Branch manager (or others with managedStoreIds)
    targetOrgId = inviter.organizationId;
    const allowed = (inviter.managedStoreIds && inviter.managedStoreIds.length > 0)
      ? inviter.managedStoreIds.map(String)
      : [String(inviter.storeId)];
    targetStoreId = payload.storeId ?? (inviter.storeId ? String(inviter.storeId) : undefined);
    if (targetStoreId && !allowed.includes(targetStoreId)) {
      throw { status: 403, message: 'Cross‑branch access forbidden.' };
    }
    if (payload.managedStoreIds) {
      const bad = payload.managedStoreIds.some(id => !allowed.includes(id));
      if (bad) throw { status: 403, message: 'You can only assign branches you manage.' };
    }
  }

  return { organizationId: targetOrgId!, storeId: targetStoreId };
}
