import { Router } from 'express';
import { ExitEvent, Discrepancy } from './exit.model.js';
import Order from '../orders/order.model.js';
import User from '../users/user.model.js';
import Basket from '../baskets/basket.model.js';
import Store from '../stores/store.model.js';
import Product from '../products/product.model.js';
import { authenticate, authorize, requirePermission, scopeToStore, AuthRequest } from '../../middleware/auth.js';
import { verifyReceiptToken } from '../../shared/utils/crypto.js';
import { evaluateOrderRisk, compareDigitalVsPhysical } from '../fraud/risk.engine.js';
import AuditLog from '../audits/audit.model.js';
import { broadcastEvent } from '../../shared/utils/eventStream.js';
import SerializedTag from '../baskets/serialized-tag.model.js';
import { resolvePolicy, tierPolicy, endSessionForOrder } from '../presence/presence.service.js';
import { consultAiExitVerification, AiObservedEvidence } from '../../services/aiVision.client.js';

const router = Router();

// 1. Exit Staff scans Customer QR Receipt (Instant GREEN < 5s path with Auto-Clear)
router.post('/verify-receipt', authenticate, requirePermission('exit:scan'), async (req: AuthRequest, res) => {
  const startTime = Date.now();
  try {
    const { receiptToken, exitLaneId } = req.body;
    if (!receiptToken || !exitLaneId) {
      res.status(400).json({ success: false, error: 'receiptToken and exitLaneId are required.' });
      return;
    }

    // Verify cryptographic token (handles rotating dynamic tokens & screenshot detection)
    const tokenResult = verifyReceiptToken(receiptToken);
    let order: any = null;

    if (tokenResult.valid && tokenResult.data) {
      order = await Order.findById(tokenResult.data.orderId).populate('customerId').populate('storeId');
    } else {
      // Look up by direct stored token or ID if passed in raw
      order = await Order.findOne({ collectionQrToken: receiptToken }).populate('customerId').populate('storeId');
    }

    if (!order) {
      res.status(404).json({
        success: false,
        decision: 'RED',
        decisionDisplay: 'STOP — GATE LOCKED',
        error: 'Invalid receipt: Order not found in database.',
        reason: 'COUNTERFEIT_OR_UNRECOGNIZED_RECEIPT',
      });
      return;
    }

    const customer = (order.customerId as any) || {};
    const store = (order.storeId as any) || {};
    const currentStaffStoreId = req.user?.storeId;

    // Security Gate: Ensure officer can only verify receipts issued by their own store branch
    { // strict branch lock: no role is exempt
      if (!currentStaffStoreId || currentStaffStoreId !== store._id.toString()) {
        res.status(403).json({
          success: false,
          decision: 'RED',
          decisionDisplay: 'STOP — GATE LOCKED',
          error: `Cross-branch clearance rejected: You are assigned to store ${currentStaffStoreId}, but this receipt was issued by store ${store.name || store._id}`,
          reason: 'CROSS_BRANCH_UNAUTHORIZED',
        });
        return;
      }
    }

    // Check previous exits with this receipt
    const existingExit = await ExitEvent.findOne({ orderId: order._id, clearanceDecision: 'CLEARED' });
    const receiptAlreadyUsed = !!existingExit || order.status === 'EXITED';

    // Store match confirmation
    const storeMatch = currentStaffStoreId ? store._id.toString() === currentStaffStoreId : true;

    // Gather basket history if available
    let manualEntries = 0;
    let removalCount = 0;
    let unknownBarcodeEvents = 0;
    let scannedCount = order.totalItems;
    let basketForExit: any = null;

    if (order.basketId) {
      basketForExit = await Basket.findById(order.basketId);
      if (basketForExit) {
        manualEntries = basketForExit.manualEntryCount;
        removalCount = basketForExit.removalCount;
        unknownBarcodeEvents = basketForExit.unknownBarcodeCount;
      }
    }

    // Count high theft products in order
    const highTheftItems = order.items.filter((i: any) => i.highTheft).length;

    // Account age in hours
    const accountAgeHours = customer.createdAt
      ? (Date.now() - new Date(customer.createdAt).getTime()) / (1000 * 60 * 60)
      : 0;

    // Evaluate Risk Engine using dynamic per-store settings from database
    // In-store presence: the order carries the trust tier of the session it was shopped under.
    const presenceRules = order.trustTier ? tierPolicy(resolvePolicy(store), order.trustTier) : undefined;

    const risk = evaluateOrderRisk(
      {
        totalMinor: order.totalMinor,
        totalItems: order.totalItems,
        tripsCompleted: customer.tripsCompleted || 0,
        accountAgeHours,
        manualEntries,
        removalCount,
        scannedCount,
        highTheftItems,
        unknownBarcodeEvents,
        paymentFailures: 0,
        cleanTrips: customer.cleanTrips || 0,
        confirmedDiscrepancies: customer.confirmedDiscrepancies || 0,
        receiptValid: tokenResult.valid,
        receiptUsed: receiptAlreadyUsed,
        orderPaid: order.status === 'PAID' || order.status === 'READY_FOR_PICKUP' || order.status === 'VERIFIED_AND_PACKED',
        orderHeld: order.status === 'HELD',
        storeMatch,
        trustTier: order.trustTier,
        tierAuditPercentage: presenceRules?.auditPercentage,
      },
      store.fraudConfig
    );

    // If dynamic rotating token expired (screenshot shared), elevate risk to RED
    if (tokenResult.isScreenshot) {
      risk.band = 'RED';
      risk.score = 100;
      risk.reasons.push('SCREENSHOT_DETECTED: Rotating dynamic QR code expired. Stale image presented instead of active app.');
      risk.mandatoryTasks.push('INVESTIGATE_SCREENSHOT: Request customer to open live Scan & Go app.');
    }

    const weighedItems = order.items.filter((item: any) => item.labelBarcode).map((item: any) => ({
      productName: item.productName,
      weightGrams: item.weightGrams,
      labelBarcode: item.labelBarcode,
      scaleId: item.scaleId,
    }));
    const expectedWeighedWeightGrams = weighedItems.reduce((total: number, item: any) => total + (item.weightGrams || 0), 0);
    const taggedItems = order.items.filter((item: any) => item.tagSerial).map((item: any) => ({
      productName: item.productName,
      tagSerial: item.tagSerial,
    }));
    // Labels provide exact weights, so every produce basket gets a human check before exit.
    if ((weighedItems.length || taggedItems.length) && risk.band === 'GREEN') {
      risk.band = 'AMBER';
      risk.score = Math.max(risk.score, 25);
      if (weighedItems.length) {
        risk.reasons.push('WEIGHED_PRODUCE: Spot-check the produce labels or verify combined bag weight at exit.');
        risk.mandatoryTasks.push('VERIFY_WEIGHED_ITEMS: Compare the displayed weights with produce bags.');
      }
      if (taggedItems.length) {
        risk.reasons.push('SERIALIZED_ITEMS: Read and verify every tagged item at exit.');
        risk.mandatoryTasks.push('VERIFY_SERIALIZED_TAGS: Scan all serialized tags at the exit lane.');
      }
    }

    // AI exit-verification sidecar (optional): reconciles the server-verified
    // basket + payment state against camera/scanner/sensor evidence supplied by
    // the exit lane. Advisory only — it can escalate the band, never downgrade
    // it, and the whole call is skipped when AI_SERVICE_URL is unset or the
    // service is unreachable.
    const orderPaidForAi = order.status === 'PAID' || order.status === 'READY_FOR_PICKUP' || order.status === 'VERIFIED_AND_PACKED';
    const aiAssessment = await consultAiExitVerification({
      orderId: order._id.toString(),
      storeId: order.storeId.toString(),
      exitEventId: undefined,
      expected: {
        items: order.items.map((i: any) => ({
          barcode: i.barcode,
          name: i.productName,
          quantity: i.quantity,
          unitPriceMinor: i.unitPriceMinor,
        })),
        totalMinor: order.totalMinor,
        totalItems: order.totalItems,
        paid: orderPaidForAi,
        paymentStatus: order.status,
      },
      observed: (req.body?.observed as AiObservedEvidence) || undefined,
      context: {
        exitLaneId,
        trustTier: order.trustTier ?? null,
        // Aggregated behavioural features for the AI fraud scorer — counters
        // only, no PII. The Python service turns these into explainable signals.
        fraudFeatures: {
          removalCount: basketForExit?.removalCount ?? removalCount,
          manualEntryCount: basketForExit?.manualEntryCount ?? manualEntries,
          unknownBarcodeCount: basketForExit?.unknownBarcodeCount ?? unknownBarcodeEvents,
          totalItems: order.totalItems,
          expectedWeightGrams: basketForExit?.expectedWeightGrams ?? undefined,
          priorConfirmedDiscrepancies: customer?.confirmedDiscrepancies ?? 0,
          priorCleanTrips: customer?.cleanTrips ?? 0,
          isGuest: Boolean((customer as any)?.isGuest),
        },
      },
    });

    if (aiAssessment) {
      const bandRank: Record<string, number> = { GREEN: 0, AMBER: 1, AMBER_FULL: 2, RED: 3 };
      const aiRank = aiAssessment.decision === 'RED' ? 3 : aiAssessment.decision === 'AMBER' ? 1 : 0;
      if (aiRank > (bandRank[risk.band] ?? 0)) {
        risk.band = aiAssessment.decision === 'RED' ? 'RED' : 'AMBER';
        risk.score = Math.max(risk.score, aiAssessment.decision === 'RED' ? 100 : aiAssessment.score);
        for (const reason of aiAssessment.reasons.filter((r) => !r.startsWith('AI_EXIT:'))) {
          risk.reasons.push(`AI_VISION: ${reason}`);
        }
        for (const task of aiAssessment.tasks) {
          if (!risk.mandatoryTasks.includes(task)) risk.mandatoryTasks.push(task);
        }
      }
    }

    const isGreen = risk.band === 'GREEN' && !receiptAlreadyUsed && tokenResult.valid;
    const physicalCheckRequired = !isGreen;

    // Select 3 sample items to check for AMBER (prioritize high-theft items if any)
    const sampleItemsToCheck = order.items
      .slice()
      .sort((a: any, b: any) => (b.highTheft ? 1 : 0) - (a.highTheft ? 1 : 0))
      .slice(0, 3)
      .map((item: any) => ({
        productId: item.productId,
        barcode: item.barcode,
        name: item.productName,
        quantity: item.quantity,
        highTheft: item.highTheft,
      }));

    // Auto-Clear GREEN immediately with no second tap required!
    let clearanceDecision: 'CLEARED' | 'PENDING' = isGreen ? 'CLEARED' : 'PENDING';
    let clearedAt: Date | undefined = isGreen ? new Date() : undefined;

    if (isGreen) {
      order.status = 'EXITED';
      order.exitedAt = clearedAt;
      order.statusHistory.push({
        status: 'EXITED',
        changedAt: clearedAt!,
        changedBy: req.user?.id as any,
        note: `Auto-cleared instantly (GREEN pass, zero anomalies). Exit Lane ${exitLaneId}.`,
      });
      await order.save();
      await endSessionForOrder(order);

      // Increment customer clean trips
      await User.findByIdAndUpdate(order.customerId, {
        $inc: { tripsCompleted: 1, cleanTrips: 1, totalSpentMinor: order.totalMinor },
      });
    }

    // Create ExitEvent
    const exitEvent = await ExitEvent.create({
      orderId: order._id,
      storeId: order.storeId,
      exitLaneId,
      staffId: req.user?.id,
      receiptToken,
      riskScore: risk.score,
      riskBand: risk.band,
      riskReasons: risk.reasons,
      aiAssessment: aiAssessment || undefined,
      physicalCheckRequired,
      physicalCheckSubmitted: false,
      clearanceDecision,
      clearedAt,
    });

    // Determine concise display decision for staff
    let decisionDisplay = 'STOP — GATE LOCKED';
    if (risk.band === 'GREEN') {
      decisionDisplay = 'GREEN — PASS (GATE OPEN)';
    } else if (risk.band === 'AMBER') {
      decisionDisplay = `CHECK ${sampleItemsToCheck.length} ITEMS`;
    } else if (risk.band === 'AMBER_FULL') {
      decisionDisplay = 'FULL TROLLEY SCAN REQUIRED';
    }

    const latencyMs = Date.now() - startTime;

    // Broadcast live event stream updates
    if (isGreen) {
      broadcastEvent({
        type: 'exit.cleared',
        payload: {
          exitEventId: exitEvent._id,
          orderId: order._id,
          orderNumber: order.orderNumber,
          laneId: exitLaneId,
          clearedAt,
          instantGreen: true,
          latencyMs,
        },
        storeId: order.storeId.toString(),
      });
    } else {
      broadcastEvent({
        type: 'exit.scanned',
        payload: {
          exitEventId: exitEvent._id,
          orderId: order._id,
          orderNumber: order.orderNumber,
          laneId: exitLaneId,
          riskBand: risk.band,
          decisionDisplay,
        },
        storeId: order.storeId.toString(),
        targetRoles: ['SUPERVISOR', 'STORE_MANAGER', 'EXIT_STAFF'],
      });
    }

    res.json({
      success: true,
      exitEventId: exitEvent._id,
      decision: risk.band,
      decisionDisplay,
      riskScore: risk.score,
      reasons: risk.reasons,
      mandatoryTasks: risk.mandatoryTasks,
      physicalCheckRequired,
      isRandomCheck: risk.isRandomCheck,
      autoCleared: isGreen,
      gateOpened: isGreen,
      amberTimeoutSeconds: store.fraudConfig?.amberTimeoutSeconds || 15,
      sampleItemsToCheck,
      latencyMs,
      presence: { trustTier: order.trustTier ?? null, presenceMethod: order.presenceMethod ?? null },
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        orderType: order.orderType,
        customerName: customer.name,
        customerPhone: customer.phone,
        totalMinor: order.totalMinor,
        totalItems: order.totalItems,
        paidAt: order.paidAt,
        items: order.items,
      },
      weighedItems,
      taggedItems,
      expectedWeighedWeightGrams,
      aiAssessment: aiAssessment || null,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Hardware-neutral RFID check: the current UI submits a simulated handheld reader scan.
router.post('/:exitEventId/verify-tags', authenticate, requirePermission('exit:verify'), async (req: AuthRequest, res) => {
  try {
    const serials: string[] | null = Array.isArray(req.body?.tagSerials) ? [...new Set<string>(req.body.tagSerials.map((value: unknown) => String(value).trim()).filter((value: string) => Boolean(value)))] : null;
    if (!serials) return res.status(400).json({ success: false, error: 'tagSerials must be an array of serial strings.' });
    const exitEvent = await ExitEvent.findById(req.params.exitEventId);
    if (!exitEvent) return res.status(404).json({ success: false, error: 'Exit event not found.' });
    if (!req.user?.storeId || exitEvent.storeId.toString() !== req.user.storeId) return res.status(403).json({ success: false, error: 'Cannot check RFID tags for another branch.' });
    const order = await Order.findById(exitEvent.orderId);
    if (!order) return res.status(404).json({ success: false, error: 'Associated order not found.' });

    const expectedSerials: string[] = order.items.map((item: any) => item.tagSerial).filter(Boolean).map(String);
    const records = serials.length ? await SerializedTag.find({ tagSerial: { $in: serials }, storeId: exitEvent.storeId }) : [];
    const paid = new Set(records.filter((tag) => tag.status === 'PAID' && String(tag.orderId) === order._id.toString()).map((tag) => tag.tagSerial));
    const unpaidOrUnknown = serials.filter((serial: string) => !paid.has(serial)).map((tagSerial: string) => ({ tagSerial, reason: records.some((tag) => tag.tagSerial === tagSerial) ? 'TAG_NOT_PAID_FOR_THIS_ORDER' : 'UNKNOWN_TAG' }));
    const missingExpected = expectedSerials.filter((serial: string) => !serials.includes(serial)).map((tagSerial: string) => ({ tagSerial, reason: 'EXPECTED_TAG_NOT_READ' }));
    const discrepancies = [...unpaidOrUnknown, ...missingExpected];
    exitEvent.serializedTagsVerified = true;
    exitEvent.serializedTagsPassed = discrepancies.length === 0;

    if (discrepancies.length) {
      exitEvent.riskBand = 'RED';
      exitEvent.riskScore = Math.max(exitEvent.riskScore, 100);
      exitEvent.riskReasons = [...new Set([...exitEvent.riskReasons, `RFID_MISMATCH: ${discrepancies.length} tagged item(s) are unpaid, unknown, or missing.`])];
      exitEvent.physicalCheckRequired = true;
      exitEvent.hasDiscrepancies = true;
      exitEvent.clearanceDecision = 'BLOCKED';
      if (!exitEvent.discrepancyId) {
        const discrepancy = await Discrepancy.create({
          exitEventId: exitEvent._id,
          orderId: order._id,
          storeId: order.storeId,
          customerId: order.customerId,
          itemsDiscrepant: discrepancies.map((item) => ({ productId: item.tagSerial, barcode: item.tagSerial, name: `Serialized tag ${item.tagSerial}`, paidQuantity: 0, physicalQuantity: item.reason === 'EXPECTED_TAG_NOT_READ' ? 0 : 1, difference: item.reason === 'EXPECTED_TAG_NOT_READ' ? -1 : 1, unitPriceMinor: 0 })),
          totalExcessItems: discrepancies.length,
          totalExcessValueMinor: 0,
          notes: 'RFID exit scan found unpaid, unknown, or missing serial tags.',
        });
        exitEvent.discrepancyId = discrepancy._id as any;
      }
    }
    exitEvent.notes = [exitEvent.notes, `RFID check scanned ${serials.length} serial(s); ${discrepancies.length} mismatch(es).`].filter(Boolean).join('\n');
    await exitEvent.save();
    await AuditLog.create({
      actorId: req.user.id,
      actorRole: req.user.role,
      actorName: req.user.name,
      action: discrepancies.length ? 'RFID_EXIT_MISMATCH' : 'RFID_EXIT_VERIFIED',
      entityType: 'EXIT',
      entityId: exitEvent._id.toString(),
      storeId: exitEvent.storeId,
      newValue: { scannedCount: serials.length, paidCount: paid.size, discrepancies },
      reason: 'Serialized tag exit verification',
    });
    if (discrepancies.length) {
      broadcastEvent({
        type: 'discrepancy.escalated',
        payload: { exitEventId: exitEvent._id, orderNumber: order.orderNumber, riskBand: 'RED', tagDiscrepancies: discrepancies },
        storeId: exitEvent.storeId.toString(),
        targetRoles: ['SUPERVISOR', 'STORE_MANAGER'],
      });
    }
    return res.json({ success: true, decision: discrepancies.length ? 'RED' : exitEvent.riskBand, scannedCount: serials.length, paidSerials: [...paid], unpaidOrUnknown, missingExpected, discrepancies });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Submit Physical Cart Barcode Scans / Counts
router.post('/:exitEventId/physical-check', authenticate, requirePermission('exit:verify'), async (req: AuthRequest, res) => {
  try {
    const { physicalItems, observedWeightGrams } = req.body;
    // physicalItems: Array of { barcode, quantity } or { productId, barcode, name, quantity, unitPriceMinor }

    const exitEvent = await ExitEvent.findById(req.params.exitEventId);
    if (!exitEvent) {
      res.status(404).json({ success: false, error: 'Exit event not found.' });
      return;
    }

    // Security Gate: Ensure officer can only check exit events for their assigned branch
    { // strict branch lock: no role is exempt
      if (!req.user?.storeId || exitEvent.storeId.toString() !== req.user.storeId) {
        res.status(403).json({ success: false, error: 'Forbidden: Cannot perform physical check on another store branch.' });
        return;
      }
    }

    const order = await Order.findById(exitEvent.orderId);
    if (!order) {
      res.status(404).json({ success: false, error: 'Associated order not found.' });
      return;
    }

    // Resolve physical products
    const resolvedPhysicalItems: any[] = [];
    for (const item of physicalItems) {
      let product = await Product.findOne({ barcode: item.barcode, storeId: order.storeId });
      if (!product) {
        // Fallback search across store
        product = await Product.findOne({ barcode: item.barcode });
      }

      resolvedPhysicalItems.push({
        productId: product ? product._id.toString() : item.productId || item.barcode,
        barcode: item.barcode,
        name: product ? product.name : item.name || 'Unknown Item',
        quantity: item.quantity,
        unitPriceMinor: product ? product.priceMinor : item.unitPriceMinor || 0,
      });
    }

    // Compare Digital Paid Items vs Physical Observed Items
    const comparison = compareDigitalVsPhysical(
      order.items.map(i => ({
        productId: i.productId.toString(),
        barcode: i.barcode,
        name: i.productName,
        quantity: i.quantity,
        unitPriceMinor: i.unitPriceMinor,
      })),
      resolvedPhysicalItems
    );

    const expectedWeighedWeightGrams = order.items.reduce((total: number, item: any) => total + (item.labelBarcode ? Number(item.weightGrams || 0) : 0), 0);
    const checkedWeight = observedWeightGrams === undefined || observedWeightGrams === null || observedWeightGrams === '' ? undefined : Number(observedWeightGrams);
    if (checkedWeight !== undefined && (!Number.isFinite(checkedWeight) || checkedWeight < 0)) {
      res.status(400).json({ success: false, error: 'observedWeightGrams must be a non-negative number.' });
      return;
    }
    let weightMismatch = false;
    if (checkedWeight !== undefined && expectedWeighedWeightGrams > 0) {
      const store = await Store.findById(order.storeId).select('variableMeasureBarcode');
      const tolerance = store?.variableMeasureBarcode?.exitWeightToleranceGrams ?? 20;
      weightMismatch = Math.abs(checkedWeight - expectedWeighedWeightGrams) > tolerance;
      if (weightMismatch) {
        comparison.hasDiscrepancy = true;
        comparison.totalExcessItems += 1;
        comparison.differences.push({
          productId: 'weighed-produce-weight',
          barcode: 'WEIGHT-CHECK',
          name: 'Combined weighed produce',
          paidQuantity: expectedWeighedWeightGrams,
          physicalQuantity: checkedWeight,
          difference: checkedWeight - expectedWeighedWeightGrams,
          unitPriceMinor: 0,
        });
      }
    }
    const expectedTagSerials = order.items.map((item: any) => item.tagSerial).filter(Boolean);
    if (expectedTagSerials.length && (!exitEvent.serializedTagsVerified || !exitEvent.serializedTagsPassed)) {
      comparison.hasDiscrepancy = true;
      comparison.totalExcessItems += 1;
      comparison.differences.push({ productId: 'serialized-tag-check', barcode: 'RFID-CHECK', name: 'Serialized tag verification incomplete or failed', paidQuantity: expectedTagSerials.length, physicalQuantity: 0, difference: -expectedTagSerials.length, unitPriceMinor: 0 });
    }

    exitEvent.physicalCheckSubmitted = true;
    exitEvent.physicalItems = resolvedPhysicalItems.map(p => ({
      productId: p.productId as any,
      barcode: p.barcode,
      name: p.name,
      scannedQuantity: p.quantity,
    }));
    exitEvent.differences = comparison.differences;
    exitEvent.hasDiscrepancies = comparison.hasDiscrepancy;

    if (comparison.hasDiscrepancy) {
      exitEvent.clearanceDecision = 'BLOCKED';
      exitEvent.riskBand = 'RED';

      // Create discrepancy record
      let discrepancy: any;
      if (exitEvent.discrepancyId) {
        discrepancy = await Discrepancy.findByIdAndUpdate(exitEvent.discrepancyId, {
          $set: {
            itemsDiscrepant: comparison.differences.filter(d => d.difference !== 0),
            totalExcessItems: comparison.totalExcessItems,
            totalExcessValueMinor: comparison.totalExcessValueMinor,
            notes: 'Updated from physical item, produce weight, and serialized tag verification.',
          },
        }, { new: true });
      } else {
        discrepancy = await Discrepancy.create({
          exitEventId: exitEvent._id,
          orderId: order._id,
          storeId: order.storeId,
          customerId: order.customerId,
          itemsDiscrepant: comparison.differences.filter(d => d.difference !== 0),
          totalExcessItems: comparison.totalExcessItems,
          totalExcessValueMinor: comparison.totalExcessValueMinor,
        });
        exitEvent.discrepancyId = discrepancy._id as any;
        await User.findByIdAndUpdate(order.customerId, { $inc: { confirmedDiscrepancies: 1 } });
      }

      await AuditLog.create({
        actorId: req.user?.id,
        actorRole: req.user?.role,
        actorName: req.user?.name,
        action: 'DISCREPANCY_DETECTED',
        entityType: 'DISCREPANCY',
        entityId: discrepancy._id.toString(),
        storeId: order.storeId,
        newValue: {
          excessItems: comparison.totalExcessItems,
          excessValueMinor: comparison.totalExcessValueMinor,
          differences: comparison.differences,
        },
      });

      // Broadcast real-time escalation to supervisors
      broadcastEvent({
        type: 'exit.flagged',
        payload: {
          exitEventId: exitEvent._id,
          orderId: order._id,
          orderNumber: order.orderNumber,
          laneId: exitEvent.exitLaneId,
          totalExcessItems: comparison.totalExcessItems,
          totalExcessValueMinor: comparison.totalExcessValueMinor,
        },
        storeId: order.storeId.toString(),
        targetRoles: ['SUPERVISOR', 'STORE_MANAGER'],
      });

      broadcastEvent({
        type: 'discrepancy.escalated',
        payload: {
          discrepancyId: discrepancy._id,
          exitEventId: exitEvent._id,
          orderNumber: order.orderNumber,
          customerName: (order.customerId as any)?.name || 'Customer',
          totalExcessValueMinor: comparison.totalExcessValueMinor,
        },
        storeId: order.storeId.toString(),
        targetRoles: ['SUPERVISOR', 'STORE_MANAGER'],
      });
    } else {
      // Full match!
      exitEvent.clearanceDecision = 'CLEARED';
      exitEvent.clearedAt = new Date();

      order.status = 'EXITED';
      order.exitedAt = new Date();
      order.statusHistory.push({
        status: 'EXITED',
        changedAt: new Date(),
        changedBy: req.user?.id as any,
        note: `Physical check passed. Cleared exit at lane ${exitEvent.exitLaneId}`,
      });
      await order.save();
      await endSessionForOrder(order);

      // Increment clean trip for customer loyalty
      await User.findByIdAndUpdate(order.customerId, {
        $inc: { tripsCompleted: 1, cleanTrips: 1, totalSpentMinor: order.totalMinor },
      });

      broadcastEvent({
        type: 'exit.cleared',
        payload: {
          exitEventId: exitEvent._id,
          orderId: order._id,
          orderNumber: order.orderNumber,
          laneId: exitEvent.exitLaneId,
          clearedAt: exitEvent.clearedAt,
        },
        storeId: order.storeId.toString(),
      });
    }

    await exitEvent.save();

    res.json({
      success: true,
      hasDiscrepancy: comparison.hasDiscrepancy,
      expectedWeighedWeightGrams,
      observedWeightGrams: checkedWeight,
      weightMismatch,
      clearanceDecision: exitEvent.clearanceDecision,
      totalExcessItems: comparison.totalExcessItems,
      totalExcessValueMinor: comparison.totalExcessValueMinor,
      differences: comparison.differences,
      exitEvent,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Resolve Discrepancy (Pay Difference, Item Returned, or Supervisor Override)
router.post('/:exitEventId/resolve-discrepancy', authenticate, requirePermission('discrepancy:resolve'), async (req: AuthRequest, res) => {
  try {
    const { resolution, supervisorPin, notes } = req.body;
    // resolution: 'PAID_DIFFERENCE' | 'ITEM_RETURNED' | 'OVERRIDDEN_BY_SUPERVISOR'

    const exitEvent = await ExitEvent.findById(req.params.exitEventId);
    if (!exitEvent || !exitEvent.discrepancyId) {
      res.status(404).json({ success: false, error: 'Discrepancy record not found for this exit event.' });
      return;
    }

    // Security Gate: Staff can only resolve discrepancies for their store
    { // strict branch lock: no role is exempt
      if (!req.user?.storeId || exitEvent.storeId.toString() !== req.user.storeId) {
        res.status(403).json({ success: false, error: 'Forbidden: Cannot resolve discrepancy for another store branch.' });
        return;
      }
    }

    const orderForResolution = await Order.findById(exitEvent.orderId);
    if (orderForResolution?.items.some((item: any) => item.tagSerial) && (!exitEvent.serializedTagsVerified || !exitEvent.serializedTagsPassed)) {
      res.status(409).json({ success: false, error: 'Serialized tags must be verified as paid before resolving or overriding this exit.' });
      return;
    }

    const discrepancy = await Discrepancy.findById(exitEvent.discrepancyId);
    if (!discrepancy) {
      res.status(404).json({ success: false, error: 'Discrepancy not found' });
      return;
    }

    discrepancy.resolution = resolution;
    discrepancy.resolvedAt = new Date();
    discrepancy.resolvedBy = req.user?.id as any;
    discrepancy.supervisorPinVerified = true;
    discrepancy.notes = notes || `Resolved via ${resolution} by ${req.user?.name}`;
    await discrepancy.save();

    exitEvent.clearanceDecision = 'CLEARED';
    exitEvent.clearedAt = new Date();
    exitEvent.notes = `Discrepancy resolved: ${resolution}`;
    await exitEvent.save();

    const order = await Order.findById(exitEvent.orderId);
    if (order) {
      order.status = 'EXITED';
      order.exitedAt = new Date();
      order.statusHistory.push({
        status: 'EXITED',
        changedAt: new Date(),
        changedBy: req.user?.id as any,
        note: `Discrepancy resolved (${resolution}). Order cleared for exit.`,
      });
      await order.save();
      await endSessionForOrder(order);
    }

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'RESOLVE_DISCREPANCY',
      entityType: 'DISCREPANCY',
      entityId: discrepancy._id.toString(),
      storeId: exitEvent.storeId,
      newValue: { resolution, notes, supervisor: req.user?.name },
    });

    broadcastEvent({
      type: 'exit.cleared',
      payload: {
        exitEventId: exitEvent._id,
        orderId: exitEvent.orderId,
        orderNumber: order?.orderNumber,
        laneId: exitEvent.exitLaneId,
        resolution,
      },
      storeId: exitEvent.storeId.toString(),
    });

    res.json({
      success: true,
      message: `Discrepancy successfully resolved via ${resolution}. Customer cleared for exit.`,
      discrepancy,
      exitEvent,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Instant Clear (for manual clearance fallback)
router.post('/:exitEventId/clear', authenticate, requirePermission('exit:verify'), async (req: AuthRequest, res) => {
  try {
    const exitEvent = await ExitEvent.findById(req.params.exitEventId);
    if (!exitEvent) {
      res.status(404).json({ success: false, error: 'Exit event not found.' });
      return;
    }

    { // strict branch lock: no role is exempt
      if (!req.user?.storeId || exitEvent.storeId.toString() !== req.user.storeId) {
        res.status(403).json({ success: false, error: 'Forbidden: Cannot clear exit for another store branch.' });
        return;
      }
    }

    if (exitEvent.riskBand === 'RED') {
      res.status(400).json({ success: false, error: 'Cannot clear an order flagged RED without resolving discrepancy.' });
      return;
    }

    const orderForClear = await Order.findById(exitEvent.orderId);
    if (orderForClear?.items.some((item: any) => item.tagSerial) && (!exitEvent.serializedTagsVerified || !exitEvent.serializedTagsPassed)) {
      res.status(409).json({ success: false, error: 'Serialized tags must be verified before clearing this order.' });
      return;
    }

    exitEvent.clearanceDecision = 'CLEARED';
    exitEvent.clearedAt = new Date();
    await exitEvent.save();

    const order = await Order.findById(exitEvent.orderId);
    if (order) {
      order.status = 'EXITED';
      order.exitedAt = new Date();
      order.statusHistory.push({
        status: 'EXITED',
        changedAt: new Date(),
        changedBy: req.user?.id as any,
        note: `Cleared for exit by staff ${req.user?.name}`,
      });
      await order.save();
      await endSessionForOrder(order);

      await User.findByIdAndUpdate(order.customerId, {
        $inc: { tripsCompleted: 1, cleanTrips: 1, totalSpentMinor: order.totalMinor },
      });
    }

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'EXIT_CLEARED',
      entityType: 'EXIT',
      entityId: exitEvent._id.toString(),
      storeId: exitEvent.storeId,
    });

    broadcastEvent({
      type: 'exit.cleared',
      payload: {
        exitEventId: exitEvent._id,
        orderId: exitEvent.orderId,
        orderNumber: order?.orderNumber,
        laneId: exitEvent.exitLaneId,
      },
      storeId: exitEvent.storeId.toString(),
    });

    res.json({ success: true, message: 'Exit cleared! Customer authorized to depart.', exitEvent });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. AMBER Inspection Time Limit Exceeded Alert (Over 15s triggers supervisor escalation)
router.post('/:exitEventId/amber-timeout', authenticate, requirePermission('exit:verify'), async (req: AuthRequest, res) => {
  try {
    const { elapsedSeconds } = req.body;
    const exitEvent = await ExitEvent.findById(req.params.exitEventId);
    if (!exitEvent) {
      res.status(404).json({ success: false, error: 'Exit event not found.' });
      return;
    }

    { // strict branch lock: no role is exempt
      if (!req.user?.storeId || exitEvent.storeId.toString() !== req.user.storeId) {
        res.status(403).json({ success: false, error: 'Cross-branch access forbidden.' });
        return;
      }
    }

    exitEvent.amberOvertimeAlert = true;
    exitEvent.amberDurationSeconds = elapsedSeconds || 15;
    await exitEvent.save();

    const order = await Order.findById(exitEvent.orderId);

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'EXIT_AMBER_OVERTIME',
      entityType: 'EXIT',
      entityId: exitEvent._id.toString(),
      storeId: exitEvent.storeId,
      newValue: { elapsedSeconds: exitEvent.amberDurationSeconds, exitLaneId: exitEvent.exitLaneId },
    });

    broadcastEvent({
      type: 'amber.overtime',
      payload: {
        exitEventId: exitEvent._id,
        orderId: exitEvent.orderId,
        orderNumber: order?.orderNumber,
        laneId: exitEvent.exitLaneId,
        staffName: req.user?.name,
        durationSeconds: exitEvent.amberDurationSeconds,
        alertMessage: `Exit Lane ${exitEvent.exitLaneId} AMBER check exceeded ${exitEvent.amberDurationSeconds}s time limit! Supervisor assistance required.`,
      },
      storeId: exitEvent.storeId.toString(),
      targetRoles: ['SUPERVISOR', 'STORE_MANAGER'],
    });

    res.json({
      success: true,
      message: 'Supervisor alerted to exit inspection overtime.',
      exitEvent,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Supervisor Escalations Queue (List AMBER_FULL and RED exit events, or unresolved discrepancies scoped to store)
router.get('/escalations', authenticate, requirePermission('discrepancy:resolve'), scopeToStore, async (req: AuthRequest, res) => {
  try {
    const storeFilter: any = {};
    if (req.user?.role !== 'SYSTEM_ADMIN') {
      if (req.user?.storeId) {
        storeFilter.storeId = req.user.storeId;
      }
    } else if (req.query.storeId) {
      storeFilter.storeId = req.query.storeId;
    }

    const escalations = await ExitEvent.find({
      ...storeFilter,
      riskBand: { $in: ['AMBER', 'AMBER_FULL', 'RED'] },
      clearanceDecision: { $ne: 'CLEARED' },
    })
      .populate('orderId')
      .populate('customerId', 'name phone cleanTrips confirmedDiscrepancies')
      .populate('discrepancyId')
      .sort({ createdAt: -1 });

    const unresolvedDiscrepancies = await Discrepancy.find({
      ...storeFilter,
      resolution: { $exists: false },
    })
      .populate('orderId')
      .populate('customerId', 'name phone')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: escalations.length,
      escalations,
      unresolvedDiscrepancies,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
