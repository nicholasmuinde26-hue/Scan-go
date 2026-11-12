import { Router } from 'express';
import PickingTask from './picking.model.js';
import Order from '../orders/order.model.js';
import Product from '../products/product.model.js';
import { authenticate, requirePermission, scopeToStore, roleScope, AuthRequest } from '../../middleware/auth.js';
import { requireOrderStoreAccess } from '../../middleware/access.js';
import Store from '../stores/store.model.js';
import { enforceSeparationOfDuties } from '../../middleware/makerChecker.js';
import AuditLog from '../audits/audit.model.js';
import { broadcastEvent } from '../../shared/utils/eventStream.js';

const router = Router();

// List picking tasks (Staff / Picker / Supervisor - scoped to store)
router.get('/tasks', authenticate, requirePermission('picking:read'), scopeToStore, async (req: AuthRequest, res) => {
  try {
    const { storeId, status } = req.query;
    const query: any = {};
    if (storeId) query.storeId = storeId;
    else if (roleScope(req.user!.role) === 'ORG') {
      // Org roles without a chosen branch: all branches of their own organization, never everyone's.
      query.storeId = { $in: await Store.find({ organizationId: req.user!.organizationId }).distinct('_id') };
    }
    if (status) query.status = status;

    const tasks = await PickingTask.find(query)
      .populate('orderId')
      .populate('pickerId', 'name phone')
      .populate('verifierId', 'name phone')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: tasks.length, tasks });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Assign task to current picker
router.post('/tasks/:orderId/assign', authenticate, requirePermission('picking:execute'), scopeToStore, requireOrderStoreAccess('orderId'), async (req: AuthRequest, res) => {
  try {
    const task = await PickingTask.findOne({ orderId: req.params.orderId });
    if (!task) {
      res.status(404).json({ success: false, error: 'Picking task not found' });
      return;
    }

    const canReassign = (req.user?.permissions || []).includes('picking:assign');
    if (task.pickerId && task.pickerId.toString() !== req.user!.id && task.status === 'IN_PROGRESS' && !canReassign) {
      res.status(409).json({ success: false, error: 'This task is already being picked by someone else.' });
      return;
    }

    task.pickerId = req.user?.id as any;
    task.status = 'IN_PROGRESS';
    task.startedAt = task.startedAt || new Date();
    await task.save();

    await Order.findByIdAndUpdate(req.params.orderId, {
      assignedPickerId: req.user?.id,
      status: 'PICKING',
    });

    broadcastEvent({
      type: 'picking.started',
      payload: {
        orderId: task.orderId,
        pickerId: req.user?.id,
        pickerName: req.user?.name,
      },
      storeId: task.storeId.toString(),
    });

    res.json({ success: true, message: 'Task assigned and started', task });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Scan item barcode during shelf picking
router.post('/tasks/:orderId/scan-item', authenticate, requirePermission('picking:execute'), requireOrderStoreAccess('orderId'), async (req: AuthRequest, res) => {
  try {
    const { barcode } = req.body;
    const task = await PickingTask.findOne({ orderId: req.params.orderId });
    if (!task) {
      res.status(404).json({ success: false, error: 'Picking task not found.' });
      return;
    }

    // A task is claimed by the first picker of this branch who starts it; after that only that picker
    // (or a manager with picking:assign) may work it.
    if (!task.pickerId || task.pickerId.toString() !== req.user!.id) {
      if (task.status === 'ASSIGNED') {
        task.pickerId = req.user!.id as any;
        task.status = 'IN_PROGRESS';
        task.startedAt = task.startedAt || new Date();
      } else if (!(req.user?.permissions || []).includes('picking:assign')) {
        res.status(403).json({ success: false, error: 'This picking task is assigned to another picker.' });
        return;
      }
    }

    // Look for matching item in order picking list
    const item = task.items.find(i => i.barcode === barcode);
    if (!item) {
      res.status(400).json({
        success: false,
        error: `MISMATCH WARNING: Scanned barcode [${barcode}] does not belong to this order!`,
      });
      return;
    }

    if (item.scannedQuantity >= item.requiredQuantity) {
      res.status(400).json({
        success: false,
        error: `ITEM COMPLETE: Already picked ${item.scannedQuantity} of ${item.requiredQuantity} units of ${item.name}`,
      });
      return;
    }

    item.scannedQuantity += 1;
    item.scannedAt = new Date();
    if (item.scannedQuantity >= item.requiredQuantity) {
      item.isVerified = true;
      item.status = 'VERIFIED';
    }

    // Check if all items are picked
    const allDone = task.items.every(i => i.isVerified || i.status === 'SUBSTITUTED' || i.status === 'OUT_OF_STOCK');
    if (allDone) {
      task.status = 'COMPLETED';
      task.completedAt = new Date();
      await Order.findByIdAndUpdate(task.orderId, { status: 'READY_FOR_VERIFICATION' });
    }

    await task.save();

    res.json({
      success: true,
      scannedItem: item,
      taskProgress: {
        totalItems: task.items.length,
        verifiedItems: task.items.filter(i => i.isVerified).length,
        allCompleted: allDone,
      },
      task,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Record scale weight for produce (tomatoes, onions, meat)
router.post('/tasks/:orderId/weigh-item', authenticate, requirePermission('picking:execute'), requireOrderStoreAccess('orderId'), async (req: AuthRequest, res) => {
  try {
    const { productId, actualWeightGrams } = req.body;
    const task = await PickingTask.findOne({ orderId: req.params.orderId });
    if (!task) {
      res.status(404).json({ success: false, error: 'Picking task not found.' });
      return;
    }

    // A task is claimed by the first picker of this branch who starts it; after that only that picker
    // (or a manager with picking:assign) may work it.
    if (!task.pickerId || task.pickerId.toString() !== req.user!.id) {
      if (task.status === 'ASSIGNED') {
        task.pickerId = req.user!.id as any;
        task.status = 'IN_PROGRESS';
        task.startedAt = task.startedAt || new Date();
      } else if (!(req.user?.permissions || []).includes('picking:assign')) {
        res.status(403).json({ success: false, error: 'This picking task is assigned to another picker.' });
        return;
      }
    }

    const item = task.items.find(i => i.productId.toString() === productId);
    if (!item) {
      res.status(404).json({ success: false, error: 'Item not found in picking task.' });
      return;
    }

    item.actualWeightGrams = actualWeightGrams;
    item.scannedQuantity = item.requiredQuantity;
    item.isVerified = true;
    item.status = 'VERIFIED';
    item.scannedAt = new Date();

    const allDone = task.items.every(i => i.isVerified || i.status === 'SUBSTITUTED' || i.status === 'OUT_OF_STOCK');
    if (allDone) {
      task.status = 'COMPLETED';
      task.completedAt = new Date();
      await Order.findByIdAndUpdate(task.orderId, { status: 'READY_FOR_VERIFICATION' });
    }

    await task.save();

    res.json({ success: true, message: `Recorded weight: ${actualWeightGrams}g`, item, task });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Propose substitution for an out-of-stock item
router.post('/tasks/:orderId/substitute', authenticate, requirePermission('picking:execute'), requireOrderStoreAccess('orderId'), async (req: AuthRequest, res) => {
  try {
    const { originalProductId, replacementBarcode } = req.body;
    const task = await PickingTask.findOne({ orderId: req.params.orderId });
    if (!task) {
      res.status(404).json({ success: false, error: 'Picking task not found.' });
      return;
    }

    // A task is claimed by the first picker of this branch who starts it; after that only that picker
    // (or a manager with picking:assign) may work it.
    if (!task.pickerId || task.pickerId.toString() !== req.user!.id) {
      if (task.status === 'ASSIGNED') {
        task.pickerId = req.user!.id as any;
        task.status = 'IN_PROGRESS';
        task.startedAt = task.startedAt || new Date();
      } else if (!(req.user?.permissions || []).includes('picking:assign')) {
        res.status(403).json({ success: false, error: 'This picking task is assigned to another picker.' });
        return;
      }
    }

    const originalItem = task.items.find(i => i.productId.toString() === originalProductId);
    if (!originalItem) {
      res.status(404).json({ success: false, error: 'Original item not found in task.' });
      return;
    }

    const replacement = await Product.findOne({ barcode: replacementBarcode, storeId: task.storeId });
    if (!replacement) {
      res.status(404).json({ success: false, error: `Replacement product with barcode ${replacementBarcode} not found.` });
      return;
    }

    const originalProduct = await Product.findById(originalProductId);
    const priceDiff = replacement.priceMinor - (originalProduct?.priceMinor || 0);

    const order = await Order.findById(task.orderId);

    // If customer allows auto substitutions and price difference is reasonable
    if (order?.substitutionsAllowed && priceDiff <= 5000) {
      originalItem.substitution = {
        originalProductId: originalItem.productId,
        replacementProductId: replacement._id as any,
        replacementName: replacement.name,
        replacementBarcode: replacement.barcode,
        replacementPriceMinor: replacement.priceMinor,
        priceDifferenceMinor: priceDiff,
        customerApproval: 'APPROVED',
        requestedAt: new Date(),
        respondedAt: new Date(),
      };
      originalItem.status = 'SUBSTITUTED';
      originalItem.isVerified = true;
      originalItem.scannedQuantity = originalItem.requiredQuantity;
      await task.save();

      res.json({
        success: true,
        message: 'Auto-substitution applied based on customer preference',
        task,
      });
      return;
    }

    // Otherwise, dispatch request for customer approval
    originalItem.substitution = {
      originalProductId: originalItem.productId,
      replacementProductId: replacement._id as any,
      replacementName: replacement.name,
      replacementBarcode: replacement.barcode,
      replacementPriceMinor: replacement.priceMinor,
      priceDifferenceMinor: priceDiff,
      customerApproval: 'PENDING',
      requestedAt: new Date(),
    };
    task.status = 'AWAITING_APPROVAL';
    await task.save();

    if (order) {
      order.status = 'AWAITING_CUSTOMER_APPROVAL';
      order.statusHistory.push({
        status: 'AWAITING_CUSTOMER_APPROVAL',
        changedAt: new Date(),
        note: `Substitution requested: Replace ${originalItem.name} with ${replacement.name}`,
      });
      await order.save();

      broadcastEvent({
        type: 'substitution.requested',
        payload: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          originalProductId: originalItem.productId,
          originalName: originalItem.name,
          replacementProductId: replacement._id,
          replacementName: replacement.name,
          replacementPriceMinor: replacement.priceMinor,
          priceDifferenceMinor: priceDiff,
        },
        storeId: task.storeId.toString(),
        targetUserId: order.customerId.toString(),
      });
    }

    res.json({
      success: true,
      message: 'Substitution proposal sent to customer for approval',
      task,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Dual verification and packing (Verification station)
router.post('/tasks/:orderId/verify-pack', authenticate, requirePermission('picking:verify'), requireOrderStoreAccess('orderId'), enforceSeparationOfDuties('pickerId'), async (req: AuthRequest, res) => {
  try {
    const { packageSealNumber, totalBagsOrContainers = 1, notes } = req.body;
    const task = await PickingTask.findOne({ orderId: req.params.orderId });
    if (!task) {
      res.status(404).json({ success: false, error: 'Picking task not found.' });
      return;
    }

    // Separation of duties: picker cannot verify their own pick
    if (task.pickerId && task.pickerId.toString() === req.user!.id) {
      return res.status(403).json({
        success: false,
        error: 'Separation of duties violation: You cannot verify your own pick. A different staff member must verify.',
      });
    }

    task.verifierId = req.user?.id as any;
    task.verifiedAt = new Date();
    task.packageSealNumber = packageSealNumber || `SEAL-${Date.now().toString().slice(-5)}`;
    task.totalBagsOrContainers = totalBagsOrContainers;
    task.verificationNotes = notes || 'All quantities verified, goods sealed';
    task.status = 'PACKED';
    await task.save();

    const order = await Order.findById(task.orderId);
    if (order) {
      order.verifiedPackerId = req.user?.id as any;
      order.verifiedAt = new Date();
      order.status = 'READY_FOR_PICKUP';
      order.statusHistory.push({
        status: 'READY_FOR_PICKUP',
        changedAt: new Date(),
        changedBy: req.user?.id as any,
        note: `Order verified and sealed into ${totalBagsOrContainers} package(s) with Seal #${task.packageSealNumber}. Customer can collect.`,
      });
      await order.save();

      broadcastEvent({
        type: 'order.ready',
        payload: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          packageSealNumber: task.packageSealNumber,
          pickupSlot: order.pickupSlot,
        },
        storeId: task.storeId.toString(),
        targetUserId: order.customerId.toString(),
      });
    }

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'ORDER_PACKED_AND_VERIFIED',
      entityType: 'ORDER',
      entityId: task.orderId.toString(),
      storeId: task.storeId,
      newValue: { seal: task.packageSealNumber, bags: totalBagsOrContainers },
    });

    res.json({
      success: true,
      message: 'Order verified and packed successfully. Ready for customer pickup!',
      task,
      order,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Handover order at collection counter (Customer arrives with QR / OTP)
router.post('/tasks/:orderId/handover', authenticate, requirePermission('orders:handover'), requireOrderStoreAccess('orderId'), async (req: AuthRequest, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate('customerId', 'name phone');

    if (!order) {
      res.status(404).json({ success: false, error: 'Order not found.' });
      return;
    }

    if (order.status === 'COLLECTED') {
      res.status(400).json({ success: false, error: 'ORDER ALREADY COLLECTED! Handover rejected.' });
      return;
    }

    if (order.status !== 'READY_FOR_PICKUP' && order.status !== 'VERIFIED_AND_PACKED') {
      res.status(400).json({
        success: false,
        error: `Order is not ready for pickup. Current state: ${order.status}`,
      });
      return;
    }

    // Shop & Collect must go through the counter flow (order number + SMS OTP + any balance). No shortcut here.
    if (order.orderType === 'CLICK_AND_COLLECT') {
      const paidUp = (order.paidMinor || 0) >= order.totalMinor;
      if (!order.handoverVerifiedAt || !paidUp) {
        res.status(409).json({ success: false, error: 'Use the Handover Counter: the customer must be verified by SMS code and any balance must be paid first.' });
        return;
      }
    }

    order.status = 'COLLECTED';
    order.collectedAt = new Date();
    order.statusHistory.push({
      status: 'COLLECTED',
      changedAt: new Date(),
      changedBy: req.user?.id as any,
      note: `Order handed over to customer by staff ${req.user?.name}`,
    });
    await order.save();

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'ORDER_HANDED_OVER',
      entityType: 'ORDER',
      entityId: order._id.toString(),
      storeId: order.storeId,
      newValue: { collectedAt: order.collectedAt },
    });

    res.json({
      success: true,
      message: `Order ${order.orderNumber} successfully handed over!`,
      order,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
