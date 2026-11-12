import { Router } from 'express';
import Payout, { PayoutStatus } from './payout.model.js';
import { getStoreBalance, recordRefund, AccountCodes } from './ledger.service.js';
import Store from '../stores/store.model.js';
import { authenticate, authorize, requirePermission, canAccessStore, roleScope, AuthRequest } from '../../middleware/auth.js';
import AuditLog from '../audits/audit.model.js';
import LedgerEntry, { LedgerEntryType } from './ledger.model.js';

const router = Router();

/**
 * Request a payout for a store (ORG_ADMIN or STORE_MANAGER)
 * POST /api/v1/ledger/payouts
 */
router.post('/payouts', authenticate, requirePermission('payouts:request'), async (req: AuthRequest, res) => {
  try {
    const { storeId, amountMinor, bankDetails, mpesaPhoneNumber, notes } = req.body;

    // Validation
    if (!storeId || !amountMinor) {
      res.status(400).json({ success: false, error: 'Store ID and amount are required.' });
      return;
    }

    // The store must belong to the caller's own organization (or be the caller's own branch).
    if (!(await canAccessStore(req.user!, String(storeId)))) {
      res.status(403).json({ success: false, error: 'You can only request payouts for your own stores.' });
      return;
    }

    // Check store has sufficient balance
    const currentBalance = await getStoreBalance(storeId);
    if (currentBalance < amountMinor) {
      res.status(400).json({ 
        success: false, 
        error: `Insufficient balance. Current balance: KES ${currentBalance / 100}, requested: KES ${amountMinor / 100}` 
      });
      return;
    }

    const store = await Store.findById(storeId);
    if (!store) {
      res.status(404).json({ success: false, error: 'Store not found.' });
      return;
    }

    // Create payout request
    const payout = await Payout.create({
      storeId,
      organizationId: store.organizationId,
      amountMinor,
      status: PayoutStatus.PENDING,
      requestedBy: req.user?.id,
      bankDetails,
      mpesaPhoneNumber,
      notes,
    });

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'REQUEST_PAYOUT',
      entityType: 'PAYOUT',
      entityId: payout._id.toString(),
      storeId,
      newValue: { amountMinor, status: PayoutStatus.PENDING },
      reason: notes || 'Payout request',
    });

    res.status(201).json({
      success: true,
      message: 'Payout request submitted',
      payout,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get payouts for an organization or store
 * GET /api/v1/ledger/payouts
 */
router.get('/payouts', authenticate, requirePermission('payouts:view'), async (req: AuthRequest, res) => {
  try {
    const { storeId, status } = req.query;
    const query: any = {};

    // Scope by what the caller is: platform sees all, org sees its own org, a branch sees its own branch.
    const scope = roleScope(req.user!.role);
    if (scope === 'PLATFORM') {
      // all payouts
    } else if (scope === 'ORG') {
      if (!req.user!.organizationId) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }
      query.organizationId = req.user!.organizationId;
    } else if (scope === 'BRANCH') {
      if (!req.user!.storeId) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }
      query.storeId = req.user!.storeId;
    } else {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    if (storeId && scope !== 'BRANCH') {
      if (scope === 'ORG' && !(await canAccessStore(req.user!, String(storeId)))) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }
      query.storeId = storeId;
    }
    if (status) query.status = status;

    const payouts = await Payout.find(query)
      .populate('storeId', 'name code')
      .populate('requestedBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });

    res.json({ success: true, payouts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Approve a payout (SYSTEM_ADMIN or with payouts:approve permission)
 * POST /api/v1/ledger/payouts/:payoutId/approve
 */
router.post('/payouts/:payoutId/approve', authenticate, requirePermission('payouts:approve'), async (req: AuthRequest, res) => {
  try {
    const payout = await Payout.findById(req.params.payoutId);
    if (!payout) {
      res.status(404).json({ success: false, error: 'Payout not found.' });
      return;
    }

    if (payout.status !== PayoutStatus.PENDING) {
      res.status(400).json({ 
        success: false, 
        error: `Payout is not pending. Current status: ${payout.status}` 
      });
      return;
    }

    // Separation of duties: whoever requested a payout can never approve it.
    if (String(payout.requestedBy) === String(req.user?.id)) {
      res.status(403).json({ success: false, error: 'You cannot approve a payout you requested.' });
      return;
    }

    // Update payout status
    payout.status = PayoutStatus.APPROVED;
    payout.approvedBy = req.user?.id as any;
    payout.approvedAt = new Date();
    payout.referenceNumber = `PAY-${Date.now()}-${payout._id.toString().slice(-6)}`;
    await payout.save();

    // Create ledger entry for the payout (debit store payable, credit cash)
    const uniqueKey = `payout-${payout._id}-${payout.referenceNumber}`;
    await LedgerEntry.create([
      {
        uniqueKey,
        entryType: LedgerEntryType.STORE_PAYOUT,
        amountMinor: payout.amountMinor,
        isDebit: true,
        accountCode: AccountCodes.STORES_PAYABLE,
        description: `Payout to store ${payout.storeId}`,
        paymentId: undefined,
        orderId: undefined,
        storeId: payout.storeId,
        organizationId: payout.organizationId,
        metadata: { referenceNumber: payout.referenceNumber },
      },
      {
        uniqueKey,
        entryType: LedgerEntryType.PLATFORM_CREDIT,
        amountMinor: payout.amountMinor,
        isDebit: false,
        accountCode: AccountCodes.CASH,
        description: `Payout disbursement for ${payout.referenceNumber}`,
        paymentId: undefined,
        orderId: undefined,
        storeId: payout.storeId,
        organizationId: payout.organizationId,
        metadata: { referenceNumber: payout.referenceNumber },
      },
    ]);

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'APPROVE_PAYOUT',
      entityType: 'PAYOUT',
      entityId: payout._id.toString(),
      storeId: payout.storeId,
      previousValue: { status: PayoutStatus.PENDING },
      newValue: { status: PayoutStatus.APPROVED, referenceNumber: payout.referenceNumber },
      reason: 'Payout approved',
    });

    res.json({
      success: true,
      message: 'Payout approved',
      payout,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/** Reject a pending payout request. */
router.post('/payouts/:payoutId/reject', authenticate, requirePermission('payouts:reject'), async (req: AuthRequest, res) => {
  try {
    const payout = await Payout.findById(req.params.payoutId);
    if (!payout) {
      res.status(404).json({ success: false, error: 'Payout not found.' });
      return;
    }
    if (!(await canAccessStore(req.user!, String(payout.storeId)))) {
      res.status(403).json({ success: false, error: 'You cannot access this store payout.' });
      return;
    }
    if (payout.status !== PayoutStatus.PENDING) {
      res.status(400).json({ success: false, error: `Payout is not pending. Current status: ${payout.status}` });
      return;
    }
    if (String(payout.requestedBy) === String(req.user?.id)) {
      res.status(403).json({ success: false, error: 'You cannot reject a payout you requested.' });
      return;
    }
    payout.status = PayoutStatus.REJECTED;
    payout.failureReason = String(req.body?.reason || 'Rejected by an authorized approver').slice(0, 500);
    await payout.save();
    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'REJECT_PAYOUT',
      entityType: 'PAYOUT',
      entityId: payout._id.toString(),
      storeId: payout.storeId,
      organizationId: payout.organizationId,
      newValue: { status: payout.status, reason: payout.failureReason },
      reason: payout.failureReason,
    });
    res.json({ success: true, message: 'Payout rejected', payout });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get store balance
 * GET /api/v1/ledger/balance/:storeId
 */
router.get('/balance/:storeId', authenticate, requirePermission('wallet:read'), async (req: AuthRequest, res) => {
  try {
    const storeId = req.params.storeId as string;

    // A wallet balance is visible only to roles with wallet access AND only for stores inside their tenant.
    if (!(await canAccessStore(req.user!, storeId))) {
      res.status(403).json({ success: false, error: 'You can only view balances for your own stores.' });
      return;
    }

    const balance = await getStoreBalance(storeId);

    res.json({
      success: true,
      storeId,
      balanceMinor: balance,
      balanceKes: balance / 100,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get platform revenue (SYSTEM_ADMIN only)
 * GET /api/v1/ledger/revenue
 */
router.get('/revenue', authenticate, authorize('SYSTEM_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { organizationId } = req.query;
    const { getPlatformRevenue } = await import('./ledger.service.js');
    
    const revenue = await getPlatformRevenue(organizationId as string);

    res.json({
      success: true,
      revenueMinor: revenue,
      revenueKes: revenue / 100,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Verify ledger integrity (SYSTEM_ADMIN only, for nightly reconciliation)
 * GET /api/v1/ledger/verify
 */
router.get('/verify', authenticate, authorize('SYSTEM_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { verifyLedgerIntegrity } = await import('./ledger.service.js');
    const result = await verifyLedgerIntegrity();

    res.json({
      success: true,
      balanced: result.balanced,
      difference: result.difference,
      differenceKes: result.difference / 100,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
