import { Router } from 'express';
import Product from './product.model.js';
import Order from '../orders/order.model.js';
import { Types } from 'mongoose';
import { authenticate, authorize, requirePermission, requireAnyPermission, requireRoleScope, canAccessStore, isPlatformRole, AuthRequest } from '../../middleware/auth.js';
import AuditLog from '../audits/audit.model.js';
import Store from '../stores/store.model.js';
import Approval from '../approvals/approval.model.js';
import { GoodsReceipt, UnknownBarcode } from './inventory-record.model.js';
import CatalogueProduct from './catalogue-product.model.js';
import { UserRole } from '../../shared/types/index.js';

const router = Router();

const CATALOGUE_ROLES: UserRole[] = ['ORG_ADMIN', 'ORG_OWNER', 'CATALOGUE_INVENTORY_MANAGER', 'SYSTEM_ADMIN'];
const INVENTORY_ROLES: UserRole[] = ['STOCK_CONTROLLER', 'STOCK_MANAGER', 'BRANCH_MANAGER', 'STORE_MANAGER', 'ORG_ADMIN', 'ORG_OWNER', 'SYSTEM_ADMIN'];
const STOCK_OPERATIONS_ROLES: UserRole[] = ['STOCK_CONTROLLER', 'STOCK_MANAGER', 'BRANCH_MANAGER', 'STORE_MANAGER', 'SYSTEM_ADMIN'];
const CATALOGUE_QUEUE_ROLES: UserRole[] = [...INVENTORY_ROLES, 'CATALOGUE_INVENTORY_MANAGER'];

// Tenant scope for catalogue and stock work: branch staff are limited to their OWN branch (not every branch in the
// organization), org roles to their own organization's branches, platform roles to any branch.
async function hasStoreScope(req: AuthRequest, storeId: string): Promise<boolean> {
  return !!req.user && (await canAccessStore(req.user, storeId));
}

async function logInventory(req: AuthRequest, input: Record<string, any>) {
  return AuditLog.create({
    actorId: req.user?.id, actorRole: req.user?.role, actorName: req.user?.name,
    entityType: 'PRODUCT', ...input,
  });
}


/** Who may set or change prices: users with pricing:write (super-admins / platform roles cannot set branch store prices). */
function canSetPrices(req: AuthRequest): boolean {
  if (req.user?.role && isPlatformRole(req.user.role)) return false;
  const perms = req.user?.permissions || [];
  return perms.includes('pricing:write');
}

/** Returns a message if any of these codes is already a barcode, extra barcode or PLU of another product in the branch. */
async function findCodeConflict(storeId: any, codes: string[], excludeProductId?: any): Promise<string | null> {
  const clean = [...new Set(codes.map((c) => String(c || '').trim()).filter(Boolean))];
  if (!clean.length) return null;
  const query: any = { storeId, $or: [{ barcode: { $in: clean } }, { barcodeAliases: { $in: clean } }, { pluCode: { $in: clean } }] };
  if (excludeProductId) query._id = { $ne: excludeProductId };
  const hit = await Product.findOne(query).select('name');
  return hit ? `A code you entered is already used by "${hit.name}" in this branch. Every barcode, extra barcode and PLU must be unique.` : null;
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

/** Stock controllers / stock managers and catalogue managers may approve receiving products; super-admin/platform roles cannot. */
function canApproveRegistrations(req: AuthRequest): boolean {
  if (!req.user || isPlatformRole(req.user.role)) return false;
  const perms = req.user.permissions || [];
  return perms.includes('inventory:approve');
}

// ---- Product photos ---------------------------------------------------------------------------------------------
// The browser compresses every photo to ~640px JPEG before upload. It is stored on the product (never in list
// queries) and served from GET /products/:id/image, so customers and pickers just use a normal <img src>.
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_IMAGE_CHARS = 450_000;
function cleanImage(input: unknown): string | undefined {
  if (input === undefined || input === null || input === '') return undefined;
  const value = String(input);
  if (value.length > MAX_IMAGE_CHARS) throw new HttpError(400, 'That photo is too large. Retake it or choose a smaller one.');
  if (!IMAGE_DATA_URL.test(value)) throw new HttpError(400, 'The photo must be a JPEG, PNG or WebP image.');
  return value;
}
const imageUrlFor = (id: any) => `/api/v1/products/${id}/image?v=${Date.now()}`;
function applyImage(doc: any, dataUrl: string) { doc.imageData = dataUrl; doc.image = imageUrlFor(doc._id); }
/** Saves the photo on this product, the organization catalogue entry, and the same product in every other branch. */
async function shareImage(product: any, dataUrl: string) {
  applyImage(product, dataUrl);
  await product.save();
  if (!product.catalogueProductId) return;
  await CatalogueProduct.updateOne({ _id: product.catalogueProductId }, { $set: { imageData: dataUrl } });
  const siblings = await Product.find({ catalogueProductId: product.catalogueProductId, _id: { $ne: product._id } }).select('_id');
  for (const sibling of siblings) await Product.updateOne({ _id: sibling._id }, { $set: { imageData: dataUrl, image: imageUrlFor(sibling._id) } });
}
function publicProduct(doc: any) {
  const plain = doc?.toObject ? doc.toObject() : { ...doc };
  delete plain.imageData;
  return plain;
}

// ---- New-product registration (receiving unregistered goods) ------------------------------------------------------
interface RegistrationInput {
  storeId: any; barcode: string; name: string; category: string; image?: string;
  priceMinor?: number; vatRateBps?: number; soldBy?: 'unit' | 'weight'; pluCode?: string; pricePerKgMinor?: number; barcodeAliases?: string[];
  unknown: any;
}

/**
 * Creates the inactive product and its PRODUCT_REGISTRATION approval for a barcode that is being received but is not
 * in the catalogue yet. The goods already counted stay on the UnknownBarcode record and are added to stock when the
 * product is approved. A catalogue manager (inventory:approve + pricing:write) who supplies a price skips the queue.
 */
async function submitRegistration(req: AuthRequest, input: RegistrationInput) {
  const soldBy = input.soldBy === 'weight' ? 'weight' : 'unit';
  let product = await Product.findOne({ storeId: input.storeId, barcode: input.barcode, active: false });
  if (!product) {
    product = new Product({
      storeId: input.storeId, name: input.name, category: input.category, barcode: input.barcode,
      barcodeAliases: input.barcodeAliases || [], pluCode: input.pluCode, sku: `SKU-${input.barcode}`,
      priceMinor: input.priceMinor || 0, vatRateBps: input.vatRateBps || 0,
      isWeighted: soldBy === 'weight', soldBy, pricePerKgMinor: soldBy === 'weight' ? input.pricePerKgMinor : undefined,
      stock: 0, active: false,
    });
  } else {
    product.name = input.name;
    product.category = input.category;
    if (input.priceMinor) product.priceMinor = input.priceMinor;
    if (input.vatRateBps !== undefined) product.vatRateBps = input.vatRateBps;
  }
  if (input.image) applyImage(product, input.image);
  await product.save();
  const approval = await Approval.create({
    type: 'PRODUCT_REGISTRATION', status: 'PENDING', requestedBy: req.user!.id, requestedByRole: req.user!.role, requestedByName: req.user!.name,
    targetType: 'PRODUCT', targetId: product._id,
    requestData: { kind: 'PRODUCT_REGISTRATION', productId: product._id, storeId: String(input.storeId), name: product.name, barcode: input.barcode },
    requiresSecondFactor: false, expiresAt: new Date(Date.now() + 7 * 86400000), creatorCanApprove: true,
  });
  input.unknown.productId = product._id;
  await input.unknown.save();
  await logInventory(req, { action: 'PRODUCT_REGISTRATION_REQUESTED', entityId: product._id.toString(), storeId: input.storeId, newValue: { approvalId: approval._id, barcode: input.barcode, receivedQuantity: input.unknown.pendingReceiveQuantity } });
  const priced = soldBy === 'weight' ? Number(input.pricePerKgMinor) > 0 : Number(input.priceMinor) > 0;
  if (canApproveRegistrations(req) && priced) {
    const done = await approveRegistration(req, approval, {}, 'Registered by inventory manager');
    return { product: done.product, approval: done.approval, receipt: done.receipt, autoApproved: true };
  }
  return { product: publicProduct(product), approval, receipt: null, autoApproved: false };
}

/** Puts an approved registration on sale at THIS branch and refreshes the org catalogue template. */
async function approveRegistration(req: AuthRequest, approval: any, changes: Record<string, any>, reason: string) {
  const storeId = String(approval.requestData.storeId);
  const product = await Product.findById(approval.targetId).select('+imageData');
  if (!product) throw new HttpError(404, 'Product record not found.');
  if (changes.name !== undefined) { const v = String(changes.name).trim(); if (!v) throw new HttpError(400, 'Product name cannot be empty.'); product.name = v; }
  if (changes.category !== undefined) { const v = String(changes.category).trim(); if (!v) throw new HttpError(400, 'Category cannot be empty.'); product.category = v; }
  if (changes.priceMinor !== undefined) { const v = Number(changes.priceMinor); if (!Number.isInteger(v) || v < 0) throw new HttpError(400, 'Enter a valid selling price.'); product.priceMinor = v; }
  if (changes.pricePerKgMinor !== undefined) { const v = Number(changes.pricePerKgMinor); if (!Number.isInteger(v) || v < 0) throw new HttpError(400, 'Enter a valid price per kg.'); product.pricePerKgMinor = v; }
  if (changes.vatRateBps !== undefined) { const v = Number(changes.vatRateBps); if (!Number.isInteger(v) || v < 0 || v > 10000) throw new HttpError(400, 'VAT must be between 0% and 100%.'); product.vatRateBps = v; }
  const weighed = product.soldBy === 'weight';
  if (weighed ? !(Number(product.pricePerKgMinor) > 0) : !(product.priceMinor > 0)) throw new HttpError(400, 'Enter the selling price before approving this product.');

  const decided = await Approval.findOneAndUpdate(
    { _id: approval._id, targetType: 'PRODUCT', status: 'PENDING' },
    { $set: { status: 'APPROVED', approvedBy: req.user!.id, approvedByName: req.user!.name, approvedByRole: req.user!.role, approvedAt: new Date(), notes: reason } },
    { new: true }
  );
  if (!decided) throw new HttpError(409, 'This request was already decided by another manager.');
  try {
    product.active = true;
    const unknown = (await UnknownBarcode.findOne({ storeId, productId: product._id, status: 'OPEN' })) ||
                    (await UnknownBarcode.findOne({ storeId, barcode: product.barcode, status: 'OPEN' }));
    const quantity = Number(unknown?.pendingReceiveQuantity || 0);
    if (quantity > 0) product.stock = (product.stock || 0) + quantity;

    // Branches are independent: approving a registration only puts THIS branch's product
    // on sale and refreshes the org catalogue template. Other branches pull the item
    // from the catalogue themselves (POST /products/from-catalogue).
    const store = await Store.findById(storeId).select('organizationId');
    if (store?.organizationId) {
      let master = await CatalogueProduct.findOne({ organizationId: store.organizationId, barcode: product.barcode });
      if (!master) master = new CatalogueProduct({ organizationId: store.organizationId, barcode: product.barcode });
      Object.assign(master, {
        name: product.name, category: product.category, barcodeAliases: product.barcodeAliases || [], pluCode: product.pluCode, sku: product.sku,
        priceMinor: product.priceMinor, compareAtPriceMinor: product.compareAtPriceMinor, vatRateBps: product.vatRateBps, isWeighted: product.isWeighted,
        soldBy: product.soldBy, pricePerKgMinor: product.pricePerKgMinor, requiresSerializedTag: product.requiresSerializedTag, highTheft: product.highTheft, active: true,
      });
      if (product.imageData) (master as any).imageData = product.imageData;
      await master.save();
      product.catalogueProductId = master._id as any;
    }
    await product.save();

    let receipt: any = null;
    if (quantity > 0 && unknown) {
      receipt = await GoodsReceipt.create({ storeId, productId: product._id, barcode: product.barcode, quantity, supplier: unknown.pendingSupplier, deliveryReference: unknown.pendingDeliveryReference, notes: unknown.pendingReceiveNotes || 'Delivery received before the product was registered', receivedBy: unknown.reportedBy || req.user!.id, receivedByName: unknown.reportedByName || req.user!.name });
    }
    if (unknown) { unknown.status = 'RESOLVED'; unknown.productId = product._id as any; await unknown.save(); }
    await logInventory(req, { action: 'PRODUCT_REGISTRATION_APPROVED', entityId: product._id.toString(), storeId, reason, newValue: { approvalId: approval._id, name: product.name, priceMinor: product.priceMinor, stock: product.stock, receiptId: receipt?._id } });
    return { product: publicProduct(product), approval: decided, receipt };
  } catch (error) {
    await Approval.updateOne({ _id: approval._id }, { $set: { status: 'PENDING' }, $unset: { approvedBy: 1, approvedByName: 1, approvedByRole: 1, approvedAt: 1, notes: 1 } });
    throw error;
  }
}

/** Rejecting removes the never-sold draft product but keeps the received quantity in the unknown-barcode queue. */
async function rejectRegistration(req: AuthRequest, approval: any, reason: string) {
  const storeId = String(approval.requestData.storeId);
  const decided = await Approval.findOneAndUpdate(
    { _id: approval._id, targetType: 'PRODUCT', status: 'PENDING' },
    { $set: { status: 'REJECTED', rejectedBy: req.user!.id, rejectedByName: req.user!.name, rejectedByRole: req.user!.role, rejectedAt: new Date(), rejectionReason: reason } },
    { new: true }
  );
  if (!decided) throw new HttpError(409, 'This request was already decided by another manager.');
  const product = await Product.findById(approval.targetId).select('barcode active');
  const barcode = product?.barcode || approval.requestData.barcode;
  if (product && !product.active) await Product.deleteOne({ _id: product._id, active: false });
  await UnknownBarcode.updateOne({ storeId, barcode, status: 'OPEN' }, { $unset: { productId: 1 } });
  await logInventory(req, { action: 'PRODUCT_REGISTRATION_REJECTED', entityId: String(approval.targetId), storeId, reason });
  return decided;
}

/**
 * Stock controllers add products by proposing them: the product is saved as inactive with stock 0 and a
 * PRODUCT_REGISTRATION approval is raised. It goes on sale only when a catalogue manager approves it, which is
 * also when the initial price becomes live. Stock is added afterwards through Receive Stock.
 */
async function proposeProduct(req: AuthRequest, res: any, storeId: string) {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  const category = String(b.category || '').trim();
  const barcode = String(b.barcode || '').trim();
  const priceMinor = Number(b.priceMinor);
  const vatRateBps = Number(b.vatRateBps || 0);
  if (!name || !category || !barcode) return res.status(400).json({ success: false, error: 'Name, category and barcode are required.' });
  if (!Number.isInteger(priceMinor) || priceMinor < 0) return res.status(400).json({ success: false, error: 'A valid non-negative price is required.' });
  if (!Number.isInteger(vatRateBps) || vatRateBps < 0 || vatRateBps > 10000) return res.status(400).json({ success: false, error: 'VAT must be between 0% and 100%.' });
  const soldBy = b.soldBy === 'weight' || b.isWeighted ? 'weight' : 'unit';
  const pluCode = b.pluCode ? String(b.pluCode).trim() : undefined;
  const pricePerKgMinor = soldBy === 'weight' ? Number(b.pricePerKgMinor) : undefined;
  if (soldBy === 'weight' && (!pluCode || !Number.isInteger(pricePerKgMinor) || Number(pricePerKgMinor) <= 0)) {
    return res.status(400).json({ success: false, error: 'Weighed products need a PLU code and a positive price per kg.' });
  }
  const compareAtPriceMinor = b.compareAtPriceMinor == null || b.compareAtPriceMinor === '' ? undefined : Number(b.compareAtPriceMinor);
  if (compareAtPriceMinor !== undefined && (!Number.isInteger(compareAtPriceMinor) || compareAtPriceMinor <= priceMinor)) {
    return res.status(400).json({ success: false, error: 'The was price must be higher than the selling price.' });
  }
  const aliases: string[] = Array.isArray(b.barcodeAliases) ? [...new Set<string>(b.barcodeAliases.map((a: unknown) => String(a).trim()).filter(Boolean))] : [];
  const conflict = await findCodeConflict(storeId, [barcode, ...aliases, ...(pluCode ? [pluCode] : [])]);
  if (conflict) return res.status(409).json({ success: false, error: conflict });

  const product = await Product.create({
    storeId, name, category, barcode, barcodeAliases: aliases, pluCode,
    sku: String(b.sku || `SKU-${barcode}`), priceMinor, compareAtPriceMinor, vatRateBps,
    isWeighted: soldBy === 'weight', soldBy, pricePerKgMinor,
    requiresSerializedTag: !!b.requiresSerializedTag, highTheft: !!b.highTheft,
    stock: 0, active: false,
  });
  const approval = await Approval.create({
    type: 'PRODUCT_REGISTRATION', status: 'PENDING', requestedBy: req.user!.id, requestedByRole: req.user!.role, requestedByName: req.user!.name,
    targetType: 'PRODUCT', targetId: product._id,
    requestData: { kind: 'PRODUCT_REGISTRATION', productId: product._id, storeId, name: product.name, barcode },
    requiresSecondFactor: false, expiresAt: new Date(Date.now() + 7 * 86400000), creatorCanApprove: true,
  });
  await logInventory(req, { action: 'PRODUCT_REGISTRATION_REQUESTED', entityId: product._id.toString(), storeId, newValue: { approvalId: approval._id, barcode, priceMinor } });
  return res.status(202).json({
    success: true, pendingApproval: true, product, approval,
    message: 'Product submitted for approval. It goes on sale after a catalogue manager approves it; then add stock with Receive Stock.',
  });
}

// Get products with optional filter by store, category, search query
router.get('/', async (req, res) => {
  try {
    const { storeId, category, search, highTheft } = req.query;
    const query: any = { active: true };

    if (storeId) query.storeId = storeId;
    if (category) query.category = category;
    if (highTheft !== undefined) query.highTheft = highTheft === 'true';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } },
        { barcodeAliases: { $regex: search, $options: 'i' } },
        { pluCode: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }

    const products = await Product.find(query).sort({ category: 1, name: 1 });
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sales = storeId && Types.ObjectId.isValid(String(storeId))
      ? await Order.aggregate([
          {
            $match: {
              storeId: new Types.ObjectId(String(storeId)),
              createdAt: { $gte: since },
              status: { $in: ['PAID', 'PICKING', 'AWAITING_CUSTOMER_APPROVAL', 'AWAITING_FINAL_PAYMENT', 'READY_FOR_VERIFICATION', 'VERIFIED_AND_PACKED', 'READY_FOR_PICKUP', 'COLLECTED', 'EXITED'] },
              isAddon: { $ne: true },
            },
          },
          { $unwind: '$items' },
          { $group: { _id: '$items.productId', unitsSold30d: { $sum: '$items.quantity' } } },
        ])
      : [];
    const salesByProduct = new Map<string, number>();
    sales.forEach((sale: any) => salesByProduct.set(String(sale._id), Number(sale.unitsSold30d)));
    const catalog = products.map((product) => ({
      ...product.toObject(),
      unitsSold30d: salesByProduct.get(String(product._id)) || 0,
    }));
    res.json({ success: true, count: catalog.length, products: catalog });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Lookup product by barcode
router.get('/barcode/:barcode', async (req, res) => {
  try {
    const { barcode } = req.params;
    const { storeId } = req.query;

    const query: any = { $or: [{ barcode }, { barcodeAliases: barcode }], active: true };
    if (storeId) query.storeId = storeId;

    const product = await Product.findOne(query);
    if (!product) {
      res.status(404).json({ success: false, error: 'Product not found for barcode: ' + barcode });
      return;
    }

    res.json({ success: true, product });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Product photo (public: used directly as <img src> by the customer shop and the picker screens)
router.get('/:id/image', async (req, res) => {
  try {
    if (!Types.ObjectId.isValid(req.params.id)) { res.status(404).end(); return; }
    const product = await Product.findById(req.params.id).select('+imageData');
    const match = /^data:(image\/[a-z]+);base64,(.+)$/.exec(product?.imageData || '');
    if (!match) { res.status(404).end(); return; }
    res.set({ 'Content-Type': match[1], 'Cache-Control': 'public, max-age=31536000, immutable' });
    res.send(Buffer.from(match[2], 'base64'));
  } catch { res.status(404).end(); }
});

// Low stock alerts
router.get('/alerts/low-stock', authenticate, requirePermission('inventory:read'), async (req: AuthRequest, res) => {
  try {
    const { threshold = 15 } = req.query;
    const query: any = { active: true, stock: { $lte: Number(threshold) } };
    // Never trust the storeId in the query alone: it must be a branch the caller may see.
    const requested = String(req.query.storeId || req.user?.storeId || '');
    if (!requested || !(await hasStoreScope(req, requested))) {
      res.status(403).json({ success: false, error: 'Branch scope is required.' });
      return;
    }
    query.storeId = requested;

    const lowStockProducts = await Product.find(query).sort({ stock: 1 });
    res.json({ success: true, count: lowStockProducts.length, products: lowStockProducts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk import products (JSON array or CSV items)
router.post('/bulk-import', authenticate, requirePermission('inventory:write', 'pricing:write'), requireRoleScope('ORG'), async (req: AuthRequest, res) => {
  try {
    const { products: items, storeId, organizationWide = false } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: 'products array is required and cannot be empty.' });
      return;
    }
    // Chain-wide pushes change every branch's prices — restricted to org config holders.
    if (organizationWide && !(req.user?.permissions || []).includes('org:config')) {
      res.status(403).json({ success: false, error: 'Organization-wide catalogue pushes require organization configuration permission.' });
      return;
    }

    const targetStoreId = storeId || req.user?.storeId;
    if (!targetStoreId) {
      res.status(400).json({ success: false, error: 'target storeId is required.' });
      return;
    }
    if (!(await hasStoreScope(req, String(targetStoreId)))) return res.status(403).json({ success: false, error: 'You cannot import catalogue data into this branch.' });
    if (!req.user?.role || !CATALOGUE_ROLES.includes(req.user.role)) return res.status(403).json({ success: false, error: 'Only the supermarket catalogue team can import master product and price data.' });

    const targetStore = await Store.findById(targetStoreId).select('organizationId');
    if (!targetStore) return res.status(404).json({ success: false, error: 'Branch not found.' });
    const targetStores = organizationWide && targetStore.organizationId
      ? await Store.find({ organizationId: targetStore.organizationId, active: true }).select('_id')
      : [{ _id: targetStore._id }];
    if (organizationWide && !targetStore.organizationId) return res.status(409).json({ success: false, error: 'This branch must belong to a registered supermarket before organization-wide catalogue import.' });
    for (const branch of targetStores) if (!(await hasStoreScope(req, branch._id.toString()))) return res.status(403).json({ success: false, error: 'Catalogue user cannot update every branch in this supermarket.' });

    let inserted = 0;
    let updated = 0;
    let pendingPriceApprovals = 0;
    const errors: any[] = [];

    for (const item of items) {
      try {
        if (!item.barcode || !item.name) {
          errors.push({ item, error: 'Missing barcode or name' });
          continue;
        }

        const priceMinor = item.priceMinor !== undefined ? Number(item.priceMinor) : Math.round(Number(item.price ?? 0) * 100);
        if (!Number.isInteger(priceMinor) || priceMinor < 0 || !Number.isFinite(Number(item.vatRateBps ?? 0)) || Number(item.vatRateBps ?? 0) < 0 || Number(item.vatRateBps ?? 0) > 10000) {
          errors.push({ item, error: 'Invalid price or VAT rate.' });
          continue;
        }
        const aliases = Array.isArray(item.barcodeAliases) ? item.barcodeAliases.map(String).map((value: string) => value.trim()).filter(Boolean) : [];
        if (aliases.includes(String(item.barcode))) { errors.push({ item, error: 'Primary barcode cannot also be an alias.' }); continue; }
        let catalogueProduct: any = null;
        if (targetStore.organizationId) {
          catalogueProduct = await CatalogueProduct.findOne({ organizationId: targetStore.organizationId, $or: [{ barcode: item.barcode }, { barcodeAliases: item.barcode }] });
          if (!catalogueProduct) catalogueProduct = new CatalogueProduct({ organizationId: targetStore.organizationId, barcode: item.barcode });
          catalogueProduct.name = item.name;
          catalogueProduct.category = item.category || 'General';
          catalogueProduct.sku = item.sku || catalogueProduct.sku || `SKU-${String(item.barcode).slice(-10)}`;
          catalogueProduct.barcodeAliases = Array.from(new Set([...(catalogueProduct.barcodeAliases || []), ...aliases]));
          catalogueProduct.pluCode = item.pluCode || catalogueProduct.pluCode;
          catalogueProduct.priceMinor = priceMinor;
          catalogueProduct.compareAtPriceMinor = Number(item.compareAtPriceMinor) || undefined;
          catalogueProduct.vatRateBps = Number(item.vatRateBps || 0);
          catalogueProduct.isWeighted = !!item.isWeighted;
          catalogueProduct.highTheft = !!item.highTheft;
          catalogueProduct.active = true;
          await catalogueProduct.save();
        }

        for (const branch of targetStores) {
          const branchId = branch._id;
          const existing = await Product.findOne({ storeId: branchId, $or: [{ barcode: item.barcode }, { barcodeAliases: item.barcode }, ...(catalogueProduct ? [{ catalogueProductId: catalogueProduct._id }] : [])] });
          const aliasCollision = aliases.length ? await Product.findOne({ storeId: branchId, ...(existing ? { _id: { $ne: existing._id } } : {}), $or: [{ barcode: { $in: aliases } }, { barcodeAliases: { $in: aliases } }, { pluCode: { $in: aliases } }] }) : null;
          if (aliasCollision) { errors.push({ item, storeId: branchId, error: 'Barcode alias is assigned to another branch product.' }); continue; }
          if (existing) {
            existing.catalogueProductId = catalogueProduct?._id || existing.catalogueProductId;
            existing.name = item.name || existing.name;
            existing.category = item.category || existing.category;
            existing.sku = item.sku || existing.sku;
            existing.barcodeAliases = Array.from(new Set([...(existing.barcodeAliases || []), ...aliases]));
            existing.pluCode = item.pluCode || existing.pluCode;
            existing.highTheft = !!item.highTheft;
            existing.isWeighted = !!item.isWeighted;
            if (priceMinor !== existing.priceMinor || Number(item.vatRateBps ?? existing.vatRateBps) !== existing.vatRateBps || (Number(item.compareAtPriceMinor) || undefined) !== existing.compareAtPriceMinor) {
              await Approval.create({ type: 'INVENTORY_CHANGE', status: 'PENDING', requestedBy: req.user!.id, requestedByRole: req.user!.role, requestedByName: req.user!.name, targetType: 'PRODUCT', targetId: existing._id, requestData: { kind: 'PRICE_CHANGE', storeId: branchId, priceMinor, previousPriceMinor: existing.priceMinor, compareAtPriceMinor: Number(item.compareAtPriceMinor) || null, vatRateBps: Number(item.vatRateBps || 0) }, requiresSecondFactor: false, expiresAt: new Date(Date.now() + 7 * 86400000), creatorCanApprove: false });
              pendingPriceApprovals++;
            }
            await existing.save();
            updated++;
          } else {
            await Product.create({ storeId: branchId, catalogueProductId: catalogueProduct?._id, name: item.name, category: item.category || 'General', barcode: item.barcode, sku: item.sku || catalogueProduct?.sku || `SKU-${String(item.barcode).slice(-10)}`, priceMinor, compareAtPriceMinor: Number(item.compareAtPriceMinor) || undefined, stock: 0, highTheft: !!item.highTheft, isWeighted: !!item.isWeighted, barcodeAliases: aliases, pluCode: item.pluCode || undefined, vatRateBps: Number(item.vatRateBps || 0) });
            inserted++;
          }
        }
      } catch (err: any) {
        errors.push({ item, error: err.message });
      }
    }

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'BULK_IMPORT_PRODUCTS',
      entityType: 'PRODUCT',
      storeId: targetStoreId,
      newValue: { inserted, updated, pendingPriceApprovals, errorCount: errors.length },
    });

    res.json({
      success: true,
      summary: { totalProcessed: items.length, inserted, updated, pendingPriceApprovals, failed: errors.length },
      errors: errors.slice(0, 10),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Preview a bulk catalogue import without changing product or stock records.
router.post('/bulk-import/preview', authenticate, requirePermission('inventory:write', 'pricing:write'), requireRoleScope('ORG'), async (req: AuthRequest, res) => {
  try {
    const { storeId, products: rows, organizationWide = false } = req.body;
    if (!storeId || !Array.isArray(rows) || rows.length === 0) return res.status(400).json({ success: false, error: 'storeId and a non-empty products array are required.' });
    if (organizationWide && !(req.user?.permissions || []).includes('org:config')) {
      return res.status(403).json({ success: false, error: 'Organization-wide catalogue pushes require organization configuration permission.' });
    }
    if (!(await hasStoreScope(req, String(storeId)))) return res.status(403).json({ success: false, error: 'You cannot import into this branch.' });
    const baseStore = await Store.findById(storeId).select('organizationId');
    if (!baseStore) return res.status(404).json({ success: false, error: 'Branch not found.' });
    if (organizationWide && !baseStore.organizationId) return res.status(409).json({ success: false, error: 'This branch must belong to a registered supermarket before organization-wide catalogue import.' });
    const branches = organizationWide && baseStore.organizationId ? await Store.find({ organizationId: baseStore.organizationId, active: true }).select('_id') : [{ _id: baseStore._id }];
    for (const branch of branches) if (!(await hasStoreScope(req, branch._id.toString()))) return res.status(403).json({ success: false, error: 'Catalogue user cannot update every branch in this supermarket.' });
    const seen = new Set<string>();
    const valid: any[] = [];
    const errors: Array<{ row: number; barcode?: string; error: string }> = [];
    for (const [index, row] of rows.entries()) {
      const barcode = String(row.barcode || '').trim();
      const name = String(row.name || '').trim();
      const priceMinor = Number(row.priceMinor ?? Math.round(Number(row.price) * 100));
      if (!barcode || !name) { errors.push({ row: index + 1, barcode, error: 'Barcode and product name are required.' }); continue; }
      if (!Number.isInteger(priceMinor) || priceMinor < 0 || Number(row.vatRateBps || 0) < 0 || Number(row.vatRateBps || 0) > 10000) { errors.push({ row: index + 1, barcode, error: 'A valid non-negative price and VAT rate (0–100%) are required.' }); continue; }
      const aliases = Array.isArray(row.barcodeAliases) ? row.barcodeAliases.map((value: any) => String(value).trim()).filter(Boolean) : [];
      const identifiers = [barcode, ...aliases, ...(row.pluCode ? [String(row.pluCode).trim()] : [])].filter(Boolean);
      if (identifiers.some((code) => seen.has(code))) { errors.push({ row: index + 1, barcode, error: 'Barcode or alias duplicates another row in this upload.' }); continue; }
      identifiers.forEach((code) => seen.add(code));
      if (identifiers.includes(barcode) && aliases.includes(barcode)) { errors.push({ row: index + 1, barcode, error: 'Primary barcode cannot also be listed as an alias.' }); continue; }
      const masterExisting = baseStore.organizationId ? await CatalogueProduct.findOne({ organizationId: baseStore.organizationId, $or: [{ barcode: { $in: identifiers } }, { barcodeAliases: { $in: identifiers } }, { pluCode: { $in: identifiers } }] }).select('_id name') : null;
      const branchCollision = await Product.findOne({ storeId: { $in: branches.map((branch) => branch._id) }, $or: [{ barcode: { $in: identifiers } }, { barcodeAliases: { $in: identifiers } }, { pluCode: { $in: identifiers } }] }).select('_id name');
      const aliasContainsPrimary = aliases.includes(barcode);
      if (aliasContainsPrimary) { errors.push({ row: index + 1, barcode, error: 'Primary barcode cannot also be listed as an alias.' }); continue; }
      valid.push({ ...row, barcode, name, priceMinor, action: masterExisting || branchCollision ? 'UPDATE' : 'INSERT', existingProductId: masterExisting?._id || branchCollision?._id });
    }
    res.json({ success: true, preview: { total: rows.length, valid, errors, canCommit: valid.length > 0 && errors.length === 0 } });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

// Org catalogue template library: items other branches (or this one) have registered.
// Branches browse this and pull items into their own inventory — nothing is pushed automatically.
router.get('/catalogue', authenticate, requirePermission('inventory:read'), requireRoleScope('ORG', 'BRANCH', 'REGION'), async (req: AuthRequest, res) => {
  try {
    const storeId = String(req.query.storeId || req.user?.storeId || '');
    if (!storeId || !(await hasStoreScope(req, storeId))) {
      return res.status(403).json({ success: false, error: 'Branch scope is required.' });
    }
    const store = await Store.findById(storeId).select('organizationId');
    if (!store?.organizationId) return res.json({ success: true, items: [] });
    const items = await CatalogueProduct.find({ organizationId: store.organizationId, active: true }).sort({ category: 1, name: 1 });
    const existing = await Product.find({ storeId, catalogueProductId: { $in: items.map((i) => i._id) } }).select('catalogueProductId');
    const inBranch = new Set(existing.map((p) => String(p.catalogueProductId)));
    res.json({ success: true, items: items.map((item) => ({ ...item.toObject(), inBranch: inBranch.has(String(item._id)) })) });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

// Pull catalogue template items into THIS branch as independent products.
// The branch owns its own price, stock and active flag from that point on.
router.post('/from-catalogue', authenticate, requirePermission('inventory:write'), requireRoleScope('ORG', 'BRANCH', 'REGION'), async (req: AuthRequest, res) => {
  try {
    const { storeId, catalogueProductIds } = req.body;
    if (!storeId || !(await hasStoreScope(req, String(storeId)))) {
      return res.status(403).json({ success: false, error: 'You cannot add catalogue items to this branch.' });
    }
    const store = await Store.findById(storeId).select('organizationId');
    if (!store?.organizationId) return res.status(409).json({ success: false, error: 'This branch must belong to a registered supermarket.' });

    const query: any = { organizationId: store.organizationId, active: true };
    if (Array.isArray(catalogueProductIds) && catalogueProductIds.length > 0) query._id = { $in: catalogueProductIds };
    const items = await CatalogueProduct.find(query);
    if (items.length === 0) return res.status(404).json({ success: false, error: 'No catalogue items found.' });

    let added = 0, skipped = 0;
    const errors: any[] = [];
    for (const item of items) {
      try {
        const exists = await Product.findOne({
          storeId,
          $or: [{ catalogueProductId: item._id }, { barcode: item.barcode }, { barcodeAliases: item.barcode }],
        }).select('_id');
        if (exists) { skipped++; continue; }
        const conflict = await findCodeConflict(storeId, [item.barcode, ...(item.barcodeAliases || []), ...(item.pluCode ? [item.pluCode] : [])]);
        if (conflict) { errors.push({ item: item.name, error: conflict }); continue; }
        const product = new Product({
          storeId, catalogueProductId: item._id, name: item.name, category: item.category,
          barcode: item.barcode, barcodeAliases: item.barcodeAliases || [], pluCode: item.pluCode,
          sku: item.sku, priceMinor: item.priceMinor, compareAtPriceMinor: item.compareAtPriceMinor,
          vatRateBps: item.vatRateBps, isWeighted: item.isWeighted, soldBy: item.soldBy,
          pricePerKgMinor: item.pricePerKgMinor, requiresSerializedTag: item.requiresSerializedTag,
          highTheft: item.highTheft, stock: 0, active: true,
        });
        if (item.imageData) applyImage(product, item.imageData);
        await product.save();
        added++;
      } catch (err: any) { errors.push({ item: item.name, error: err.message }); }
    }
    await logInventory(req, { action: 'CATALOGUE_ITEMS_ADOPTED', entityId: String(storeId), storeId, newValue: { added, skipped, errorCount: errors.length } });
    res.json({ success: true, summary: { added, skipped, failed: errors.length }, errors: errors.slice(0, 10) });
  } catch (error: any) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/inventory/receive', authenticate, requirePermission('inventory:write'), requireRoleScope('ORG', 'BRANCH', 'REGION'), async (req: AuthRequest, res) => {
  try {
    const { storeId, barcode, quantity, supplier, deliveryReference, notes } = req.body;
    const code = String(barcode || '').trim();
    const qty = Number(quantity);
    if (!storeId || !code || !Number.isInteger(qty) || qty < 1) return res.status(400).json({ success: false, error: 'Branch, barcode and a positive whole quantity are required.' });
    if (!(await hasStoreScope(req, String(storeId)))) return res.status(403).json({ success: false, error: 'You cannot receive stock for this branch.' });
    const product = await Product.findOne({ storeId, active: true, $or: [{ barcode: code }, { barcodeAliases: code }, { pluCode: code }] });
    if (!product) {
      // Not an error: the screen switches to "new product" and finishes through POST /inventory/receive-new.
      return res.status(404).json({ success: false, unknownBarcode: true, barcode: code, error: 'This barcode is not registered for this branch yet.' });
    }
    const receivedProduct = await Product.findOneAndUpdate({ _id: product._id, storeId, active: true }, { $inc: { stock: qty } }, { new: true });
    if (!receivedProduct) return res.status(409).json({ success: false, error: 'Product changed while receiving. Scan and retry.' });
    const previousStock = receivedProduct.stock - qty;
    let receipt;
    try {
      receipt = await GoodsReceipt.create({ storeId, productId: product._id, barcode: code, quantity: qty, supplier, deliveryReference, notes, receivedBy: req.user!.id, receivedByName: req.user!.name });
    } catch (error) {
      await Product.updateOne({ _id: product._id }, { $inc: { stock: -qty } });
      throw error;
    }
    await logInventory(req, { action: 'GOODS_RECEIVED', entityId: product._id.toString(), storeId, previousValue: { stock: previousStock }, newValue: { stock: receivedProduct.stock, quantity: qty, receiptId: receipt._id }, reason: notes || `Goods received${deliveryReference ? ` · ${deliveryReference}` : ''}` });
    return res.json({ success: true, product: receivedProduct, receipt });
  } catch (error: any) { return res.status(500).json({ success: false, error: error.message }); }
});

router.get('/inventory/unknown-barcodes', authenticate, requirePermission('inventory:read'), requireRoleScope('ORG', 'BRANCH', 'REGION'), async (req: AuthRequest, res) => {
  const storeId = String(req.query.storeId || req.user?.storeId || '');
  if (!storeId || !(await hasStoreScope(req, storeId))) return res.status(403).json({ success: false, error: 'Branch scope is required.' });
  const unknownBarcodes = await UnknownBarcode.find({ storeId, status: 'OPEN' }).sort({ lastSeenAt: -1 }).limit(250).lean();
  return res.json({ success: true, unknownBarcodes });
});

router.get('/inventory/receipts', authenticate, requirePermission('inventory:read'), requireRoleScope('ORG', 'BRANCH', 'REGION'), async (req: AuthRequest, res) => {
  const storeId = String(req.query.storeId || req.user?.storeId || '');
  if (!storeId || !(await hasStoreScope(req, storeId))) return res.status(403).json({ success: false, error: 'Branch scope is required.' });
  const receipts = await GoodsReceipt.find({ storeId }).populate('productId', 'name barcode sku').sort({ createdAt: -1 }).limit(100).lean();
  return res.json({ success: true, receipts });
});

/**
 * Receive goods whose barcode is not in the catalogue yet. The stock controller only types a name and (optionally) takes a
 * photo. The delivery is held until a catalogue manager prices and approves the product, then it is added to stock.
 */
router.post('/inventory/receive-new', authenticate, requirePermission('inventory:write'), requireRoleScope('ORG', 'BRANCH', 'REGION'), async (req: AuthRequest, res) => {
  try {
    const { storeId, barcode, quantity, supplier, deliveryReference, notes } = req.body;
    const code = String(barcode || '').trim();
    const qty = Number(quantity);
    const name = String(req.body.name || '').trim();
    const category = String(req.body.category || '').trim() || 'General';
    if (!storeId || !code || !name || !Number.isInteger(qty) || qty < 1) throw new HttpError(400, 'Barcode, product name and a positive whole quantity are required.');
    if (!(await hasStoreScope(req, String(storeId)))) throw new HttpError(403, 'You cannot receive stock for this branch.');
    const image = cleanImage(req.body.image);
    const existing = await Product.findOne({ storeId, $or: [{ barcode: code }, { barcodeAliases: code }, { pluCode: code }] }).select('active');
    if (existing?.active) throw new HttpError(409, 'This product is already registered. Receive it normally.');

    const now = new Date();
    const unknown = await UnknownBarcode.findOneAndUpdate(
      { storeId, barcode: code, status: 'OPEN' },
      { $set: { lastSeenAt: now, source: 'RECEIVING', reportedBy: req.user?.id, reportedByName: req.user?.name, pendingSupplier: supplier, pendingDeliveryReference: deliveryReference, pendingReceiveNotes: notes }, $setOnInsert: { firstSeenAt: now }, $inc: { seenCount: 1, pendingReceiveQuantity: qty } },
      { upsert: true, new: true }
    );
    if (unknown!.productId || existing) {
      const storeFilter = Types.ObjectId.isValid(storeId) ? { $in: [String(storeId), new Types.ObjectId(storeId)] } : String(storeId);
      const activeApproval = await Approval.findOne({
        targetType: 'PRODUCT',
        'requestData.barcode': code,
        'requestData.storeId': storeFilter,
        status: 'PENDING',
      });
      if (activeApproval) {
        return res.status(202).json({ success: true, pendingApproval: true, approval: activeApproval, message: `Added ${qty} more to the delivery already waiting for approval (${unknown!.pendingReceiveQuantity} in total).` });
      }
    }
    const priceMinor = req.body.priceMinor === undefined || req.body.priceMinor === '' ? undefined : Number(req.body.priceMinor);
    if (priceMinor !== undefined && (!Number.isInteger(priceMinor) || priceMinor < 0)) throw new HttpError(400, 'Enter a valid selling price.');
    const result = await submitRegistration(req, { storeId, barcode: code, name, category, image, priceMinor, vatRateBps: Number(req.body.vatRateBps || 0), unknown });
    return res.status(result.autoApproved ? 201 : 202).json({
      success: true, pendingApproval: !result.autoApproved, autoApproved: result.autoApproved, product: result.product, approval: result.approval,
      message: result.autoApproved ? `${name} is on sale and ${qty} unit(s) were added to stock.` : `${name} was received (${qty} unit(s)). It goes on sale once a catalogue manager prices and approves it.`,
    });
  } catch (error: any) { return res.status(error.status || 500).json({ success: false, error: error.message }); }
});

router.post('/inventory/unknown-barcodes/:id/register', authenticate, requirePermission('inventory:write'), requireRoleScope('ORG', 'BRANCH', 'REGION'), async (req: AuthRequest, res) => {
  try {
    const unknown = await UnknownBarcode.findById(req.params.id);
    if (!unknown || unknown.status !== 'OPEN') throw new HttpError(404, 'Open unknown barcode not found.');
    if (!(await hasStoreScope(req, unknown.storeId.toString()))) throw new HttpError(403, 'You cannot register products for this branch.');
    if (unknown.productId) throw new HttpError(409, 'This barcode already has a product registration waiting for approval.');
    const name = String(req.body.name || '').trim();
    const category = String(req.body.category || '').trim() || 'General';
    if (!name) throw new HttpError(400, 'Product name is required.');
    const soldBy = req.body.soldBy === 'weight' || req.body.isWeighted ? 'weight' : 'unit';
    const pluCode = req.body.pluCode ? String(req.body.pluCode).trim() : undefined;
    const conflict = await findCodeConflict(unknown.storeId, pluCode ? [pluCode] : []);
    if (conflict) throw new HttpError(409, conflict);
    const priceMinor = req.body.priceMinor === undefined || req.body.priceMinor === '' ? 0 : Number(req.body.priceMinor);
    const pricePerKgMinor = soldBy === 'weight' ? Number(req.body.pricePerKgMinor) : undefined;
    if (!Number.isInteger(priceMinor) || priceMinor < 0) throw new HttpError(400, 'Enter a valid selling price.');
    if (soldBy === 'weight' && (!pluCode || !Number.isInteger(pricePerKgMinor) || Number(pricePerKgMinor) <= 0)) throw new HttpError(400, 'Weighed products require a PLU and a positive price per kg.');
    const result = await submitRegistration(req, { storeId: unknown.storeId, barcode: unknown.barcode, name, category, image: cleanImage(req.body.image), priceMinor, vatRateBps: Number(req.body.vatRateBps || 0), soldBy, pluCode, pricePerKgMinor, barcodeAliases: req.body.barcodeAliases || [], unknown });
    return res.status(201).json({ success: true, product: result.product, approval: result.approval, autoApproved: result.autoApproved });
  } catch (error: any) { return res.status(error.status || 400).json({ success: false, error: error.message }); }
});

router.get('/inventory/approvals', authenticate, requireAnyPermission('inventory:approve', 'pricing:approve'), requireRoleScope('ORG', 'BRANCH', 'REGION'), async (req: AuthRequest, res) => {
  const storeId = String(req.query.storeId || req.user?.storeId || '');
  if (!storeId || !(await hasStoreScope(req, storeId))) return res.status(403).json({ success: false, error: 'Branch scope is required.' });
  const storeFilter = Types.ObjectId.isValid(storeId) ? { $in: [String(storeId), new Types.ObjectId(storeId)] } : String(storeId);
  const approvals: any[] = await Approval.find({ targetType: 'PRODUCT', 'requestData.storeId': storeFilter, status: 'PENDING' }).populate('requestedBy', 'name role').sort({ createdAt: 1 }).lean();
  const productIds = approvals.filter((a) => a.requestData?.kind === 'PRODUCT_REGISTRATION').map((a) => a.targetId);
  const [drafts, held]: any[] = productIds.length ? await Promise.all([
    Product.find({ _id: { $in: productIds } }).select('name category barcode image priceMinor vatRateBps soldBy pricePerKgMinor pluCode').lean(),
    UnknownBarcode.find({ storeId: storeFilter, status: 'OPEN', productId: { $in: productIds } }).select('productId pendingReceiveQuantity pendingSupplier pendingDeliveryReference').lean(),
  ]) : [[], []];
  const draftById = new Map<string, any>(drafts.map((d: any) => [String(d._id), d]));
  const heldByProduct = new Map<string, any>(held.map((h: any) => [String(h.productId), h]));
  const enriched = approvals.map((a) => a.requestData?.kind !== 'PRODUCT_REGISTRATION' ? a : {
    ...a, product: draftById.get(String(a.targetId)) || null,
    receivedQuantity: heldByProduct.get(String(a.targetId))?.pendingReceiveQuantity || 0,
    supplier: heldByProduct.get(String(a.targetId))?.pendingSupplier,
    deliveryReference: heldByProduct.get(String(a.targetId))?.pendingDeliveryReference,
  });
  return res.json({ success: true, approvals: enriched });
});

router.post('/:id/price-change', authenticate, requirePermission('pricing:write'), requireRoleScope('ORG', 'BRANCH', 'REGION'), async (req: AuthRequest, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found.' });
    if (!(await hasStoreScope(req, product.storeId.toString()))) return res.status(403).json({ success: false, error: 'You cannot change catalogue data for this branch.' });
    const priceMinor = Number(req.body.priceMinor);
    const pricePerKgMinor = req.body.pricePerKgMinor === undefined ? product.pricePerKgMinor : Number(req.body.pricePerKgMinor);
    const vatRateBps = Number(req.body.vatRateBps ?? product.vatRateBps ?? 0);
    if (!Number.isInteger(priceMinor) || priceMinor < 0 || !Number.isInteger(vatRateBps) || vatRateBps < 0 || vatRateBps > 10000) return res.status(400).json({ success: false, error: 'A valid non-negative price and VAT rate from 0–100% are required.' });
    if (product.soldBy === 'weight' && (!Number.isInteger(pricePerKgMinor) || Number(pricePerKgMinor) <= 0)) return res.status(400).json({ success: false, error: 'A weighted product needs a positive integer price per kg.' });
    const compareAtPriceMinor = req.body.compareAtPriceMinor == null ? undefined : Number(req.body.compareAtPriceMinor);
    if (compareAtPriceMinor !== undefined && (!Number.isInteger(compareAtPriceMinor) || compareAtPriceMinor <= priceMinor)) return res.status(400).json({ success: false, error: 'Was price must be greater than the proposed selling price.' });
    const approval = await Approval.create({ type: 'INVENTORY_CHANGE', status: 'PENDING', requestedBy: req.user!.id, requestedByRole: req.user!.role, requestedByName: req.user!.name, targetType: 'PRODUCT', targetId: product._id, requestData: { kind: 'PRICE_CHANGE', storeId: product.storeId, priceMinor, previousPriceMinor: product.priceMinor, pricePerKgMinor, previousPricePerKgMinor: product.pricePerKgMinor, compareAtPriceMinor: req.body.compareAtPriceMinor ?? null, vatRateBps }, requiresSecondFactor: false, expiresAt: new Date(Date.now() + 7 * 86400000), creatorCanApprove: false, notes: String(req.body.reason || '').trim() });
    await logInventory(req, { action: 'PRODUCT_PRICE_CHANGE_REQUESTED', entityId: product._id.toString(), storeId: product.storeId, previousValue: { priceMinor: product.priceMinor }, newValue: { priceMinor, approvalId: approval._id }, reason: String(req.body.reason || 'Price change requested').trim() });
    return res.status(202).json({ success: true, approval, message: 'Price change submitted for branch manager approval.' });
  } catch (error: any) { return res.status(400).json({ success: false, error: error.message }); }
});

router.post('/inventory/approvals/:id/decision', authenticate, requireAnyPermission('inventory:approve', 'pricing:approve'), requireRoleScope('ORG', 'BRANCH', 'REGION'), async (req: AuthRequest, res) => {
  try {
    if (req.user?.role && isPlatformRole(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Super-admin cannot approve store inventory receiving. This action must be performed by the stock manager or catalogue & inventory manager.',
      });
    }
    const decision = req.body.decision;
    // Approving needs no typed reason (it defaults to "Approved"); rejecting always does.
    const reason = String(req.body.reason || '').trim() || (decision === 'APPROVED' ? 'Approved' : '');
    if (!['APPROVED', 'REJECTED'].includes(decision) || !reason) return res.status(400).json({ success: false, error: decision === 'REJECTED' ? 'Please give a reason for rejecting.' : 'A decision is required.' });
    const approval = await Approval.findById(req.params.id);
    if (!approval || approval.targetType !== 'PRODUCT' || approval.status !== 'PENDING') return res.status(404).json({ success: false, error: 'Pending inventory approval not found.' });
    const isRegistration = approval.requestData?.kind === 'PRODUCT_REGISTRATION';
    // Separation of duties stays for price and stock changes. A catalogue manager (who sets prices AND approves) may approve a
    // product registration they raised themselves, since they are the authority that registration is waiting for.
    if (approval.requestedBy.toString() === req.user!.id && !(isRegistration && canApproveRegistrations(req))) return res.status(403).json({ success: false, error: 'The requester cannot approve their own change.' });
    const storeId = String(approval.requestData.storeId);
    if (!(await hasStoreScope(req, storeId))) return res.status(403).json({ success: false, error: 'You cannot approve changes for this branch.' });
    if (isRegistration) {
      if (!req.user!.permissions.includes('inventory:approve')) return res.status(403).json({ success: false, error: 'You cannot approve this type of change.' });
      if (decision === 'REJECTED') return res.json({ success: true, approval: await rejectRegistration(req, approval, reason) });
      const done = await approveRegistration(req, approval, req.body.changes || {}, reason);
      return res.json({ success: true, approval: done.approval, product: done.product, receipt: done.receipt });
    }
    const product = await Product.findById(approval.targetId);
    if (!product) return res.status(404).json({ success: false, error: 'Product record not found.' });
    const change = approval.requestData;
    const requiredApprovalPermission = change.kind === 'PRICE_CHANGE' ? 'pricing:approve' : 'inventory:approve';
    if (!req.user!.permissions.includes(requiredApprovalPermission)) return res.status(403).json({ success: false, error: 'You cannot approve this type of change.' });
    let propagationBranches: Array<{ _id: Types.ObjectId }> = [];
    const decidedAt = new Date();
    const decidedApproval = await Approval.findOneAndUpdate(
      { _id: approval._id, targetType: 'PRODUCT', status: 'PENDING' },
      { $set: decision === 'APPROVED'
        ? { status: decision, approvedBy: req.user!.id, approvedByName: req.user!.name, approvedByRole: req.user!.role, approvedAt: decidedAt, notes: String(reason).trim() }
        : { status: decision, rejectedBy: req.user!.id, rejectedByName: req.user!.name, rejectedByRole: req.user!.role, rejectedAt: decidedAt, rejectionReason: String(reason).trim() } },
      { new: true }
    );
    if (!decidedApproval) return res.status(409).json({ success: false, error: 'This request was already decided by another manager.' });
    let registrationReceipt: any = null;
    if (decision === 'APPROVED') {
      if (change.kind === 'PRICE_CHANGE') {
        product.priceMinor = Number(change.priceMinor);
        if (change.pricePerKgMinor !== undefined) product.pricePerKgMinor = Number(change.pricePerKgMinor);
        product.priceVersion += 1;
        product.compareAtPriceMinor = change.compareAtPriceMinor == null ? undefined : Number(change.compareAtPriceMinor);
        product.vatRateBps = Number(change.vatRateBps || 0);
      } else if (change.kind === 'STOCK_ADJUSTMENT') {
        const nextStock = product.stock + Number(change.quantityChange);
        if (!Number.isFinite(nextStock) || nextStock < 0) {
          await Approval.updateOne({ _id: decidedApproval._id, status: decision }, { $set: { status: 'PENDING' }, $unset: { approvedBy: 1, approvedByName: 1, approvedByRole: 1, approvedAt: 1, notes: 1 } });
          return res.status(409).json({ success: false, error: 'The approved adjustment would make stock negative.' });
        }
        product.stock = nextStock;
      } else {
        product.active = true;
        const unknownRecord = await UnknownBarcode.findOne({ storeId, barcode: product.barcode, status: 'OPEN' });
        if (unknownRecord?.pendingReceiveQuantity) product.stock = unknownRecord.pendingReceiveQuantity;
        const store = await Store.findById(storeId).select('organizationId');
        if (store?.organizationId) {
          let catalogueProduct = await CatalogueProduct.findOne({ organizationId: store.organizationId, barcode: product.barcode });
          if (!catalogueProduct) catalogueProduct = new CatalogueProduct({ organizationId: store.organizationId, barcode: product.barcode });
          catalogueProduct.name = product.name;
          catalogueProduct.category = product.category;
          catalogueProduct.barcodeAliases = product.barcodeAliases || [];
          catalogueProduct.pluCode = product.pluCode;
          catalogueProduct.sku = product.sku;
          catalogueProduct.priceMinor = product.priceMinor;
          catalogueProduct.compareAtPriceMinor = product.compareAtPriceMinor;
          catalogueProduct.vatRateBps = product.vatRateBps;
          catalogueProduct.isWeighted = product.isWeighted;
          catalogueProduct.soldBy = product.soldBy;
          catalogueProduct.pricePerKgMinor = product.pricePerKgMinor;
          catalogueProduct.requiresSerializedTag = product.requiresSerializedTag;
          catalogueProduct.highTheft = product.highTheft;
          catalogueProduct.active = true;
          await catalogueProduct.save();
          product.catalogueProductId = catalogueProduct._id as any;
          propagationBranches = await Store.find({ organizationId: store.organizationId, active: true }).select('_id').lean() as any;
        }
      }
    } else if (change.kind !== 'PRODUCT_REGISTRATION') product.set('approvalRejectionReason', String(reason).trim());
    await product.save();
    if (decision === 'APPROVED' && change.kind === 'PRODUCT_REGISTRATION') {
      const unknownRecord = await UnknownBarcode.findOne({ storeId, barcode: product.barcode, status: 'OPEN' });
      if (unknownRecord?.pendingReceiveQuantity) {
        registrationReceipt = await GoodsReceipt.create({ storeId, productId: product._id, barcode: product.barcode, quantity: unknownRecord.pendingReceiveQuantity, supplier: unknownRecord.pendingSupplier, deliveryReference: unknownRecord.pendingDeliveryReference, notes: unknownRecord.pendingReceiveNotes || 'Initial unknown-barcode delivery received after product approval', receivedBy: unknownRecord.reportedBy || req.user!.id, receivedByName: unknownRecord.reportedByName || req.user!.name });
      }
    }
    if (decision === 'APPROVED' && change.kind === 'PRODUCT_REGISTRATION' && product.catalogueProductId) {
      for (const branch of propagationBranches) {
        if (branch._id.toString() === storeId) continue;
        const exists = await Product.findOne({ storeId: branch._id, $or: [{ catalogueProductId: product.catalogueProductId }, { barcode: product.barcode }] });
        if (!exists) await Product.create({ storeId: branch._id, catalogueProductId: product.catalogueProductId, name: product.name, category: product.category, barcode: product.barcode, barcodeAliases: product.barcodeAliases, pluCode: product.pluCode, sku: product.sku, priceMinor: product.priceMinor, compareAtPriceMinor: product.compareAtPriceMinor, vatRateBps: product.vatRateBps, isWeighted: product.isWeighted, soldBy: product.soldBy, pricePerKgMinor: product.pricePerKgMinor, requiresSerializedTag: product.requiresSerializedTag, highTheft: product.highTheft, stock: 0, active: true });
      }
    }
    approval.status = decision;
    if (decision === 'APPROVED' && change.kind === 'PRODUCT_REGISTRATION') await UnknownBarcode.updateOne({ storeId, barcode: product.barcode, status: 'OPEN' }, { $set: { status: 'RESOLVED', productId: product._id } });
    await logInventory(req, { action: `${change.kind || 'PRODUCT_REGISTRATION'}_${decision}`, entityId: product._id.toString(), storeId, reason: String(reason).trim(), newValue: { approvalId: approval._id, product: product.toObject(), receiptId: registrationReceipt?._id } });
    return res.json({ success: true, approval: decidedApproval, product });
  } catch (error: any) { return res.status(error.status || 500).json({ success: false, error: error.message }); }
});

router.post('/inventory/unknown-barcodes/:id/dismiss', authenticate, requirePermission('inventory:write'), requireRoleScope('ORG', 'BRANCH', 'REGION'), async (req: AuthRequest, res) => {
  const unknown = await UnknownBarcode.findById(req.params.id);
  if (!unknown || unknown.status !== 'OPEN') return res.status(404).json({ success: false, error: 'Open unknown barcode not found.' });
  if (!(await hasStoreScope(req, unknown.storeId.toString()))) return res.status(403).json({ success: false, error: 'You cannot dismiss records for this branch.' });
  if (!String(req.body.reason || '').trim()) return res.status(400).json({ success: false, error: 'A dismissal reason is required.' });
  unknown.status = 'DISMISSED';
  await unknown.save();
  await logInventory(req, { action: 'UNKNOWN_BARCODE_DISMISSED', entityId: unknown._id.toString(), storeId: unknown.storeId, reason: String(req.body.reason).trim() });
  return res.json({ success: true, unknownBarcode: unknown });
});

// Adjust stock with mandatory reason (Damaged, Theft, Restock, Expired, Cycle Count)
router.post('/:id/adjust-stock', authenticate, requirePermission('inventory:adjust'), requireRoleScope('ORG', 'BRANCH', 'REGION'), async (req: AuthRequest, res) => {
  try {
    const { quantityChange, reason, adjustmentType } = req.body;
    if (quantityChange === undefined || !reason) {
      res.status(400).json({ success: false, error: 'quantityChange and a mandatory reason are required.' });
      return;
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      res.status(404).json({ success: false, error: 'Product not found.' });
      return;
    }
    if (!(await hasStoreScope(req, product.storeId.toString()))) return res.status(403).json({ success: false, error: 'You cannot adjust stock for this branch.' });
    if (req.user?.role === 'CATALOGUE_INVENTORY_MANAGER') return res.status(403).json({ success: false, error: 'Catalogue managers cannot adjust branch stock.' });
    const change = Number(quantityChange);
    if (!Number.isInteger(change) || change === 0) return res.status(400).json({ success: false, error: 'Stock adjustment must be a non-zero whole number.' });
    if (String(adjustmentType).toUpperCase() === 'RESTOCK') return res.status(400).json({ success: false, error: 'Use the Receive Stock workflow for supplier deliveries.' });

    const needsApproval = change <= -5 || ['DAMAGED', 'EXPIRED', 'THEFT', 'WRITE_OFF'].includes(String(adjustmentType).toUpperCase());
    if (needsApproval) {
      const approval = await Approval.create({ type: 'INVENTORY_CHANGE', status: 'PENDING', requestedBy: req.user!.id, requestedByRole: req.user!.role, requestedByName: req.user!.name, targetType: 'PRODUCT', targetId: product._id, requestData: { kind: 'STOCK_ADJUSTMENT', storeId: product.storeId, quantityChange: change, reason: String(reason).trim(), adjustmentType }, requiresSecondFactor: false, expiresAt: new Date(Date.now() + 7 * 86400000), creatorCanApprove: false });
      await logInventory(req, { action: 'STOCK_ADJUSTMENT_REQUESTED', entityId: product._id.toString(), storeId: product.storeId, previousValue: { stock: product.stock }, newValue: { quantityChange: change, approvalId: approval._id, adjustmentType }, reason });
      return res.status(202).json({ success: true, approval, pendingApproval: true, message: 'Large stock reduction submitted for branch manager approval.' });
    }

    const previousStock = product.stock;
    const newStock = previousStock + change;
    if (newStock < 0) return res.status(409).json({ success: false, error: 'Adjustment would make stock negative.' });
    const updatedProduct = await Product.findOneAndUpdate({ _id: product._id, storeId: product.storeId, stock: { $gte: change < 0 ? -change : 0 } }, { $inc: { stock: change } }, { new: true });
    if (!updatedProduct) return res.status(409).json({ success: false, error: 'Stock changed or is insufficient for this adjustment. Refresh and retry.' });

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'STOCK_ADJUSTMENT',
      entityType: 'PRODUCT',
      entityId: product._id.toString(),
      storeId: product.storeId,
      previousValue: { stock: previousStock },
      newValue: { stock: updatedProduct.stock, quantityChange, adjustmentType },
      reason,
    });

    res.json({
      success: true,
      message: `Stock adjusted by ${quantityChange}. New stock: ${updatedProduct.stock}`,
      product: updatedProduct,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cycle stock count verification
router.post('/stock-count', authenticate, requirePermission('inventory:adjust'), requireRoleScope('ORG', 'BRANCH', 'REGION'), async (req: AuthRequest, res) => {
  try {
    const { counts, storeId } = req.body; // Array of { productId, countedStock, notes }
    if (!Array.isArray(counts)) {
      res.status(400).json({ success: false, error: 'counts array is required.' });
      return;
    }
    if (!storeId || !(await hasStoreScope(req, String(storeId)))) return res.status(403).json({ success: false, error: 'Valid branch scope is required for stock counts.' });
    if (req.user?.role === 'CATALOGUE_INVENTORY_MANAGER') return res.status(403).json({ success: false, error: 'Catalogue managers cannot perform branch stock counts.' });

    const results = [];
    for (const c of counts) {
      const prod = await Product.findById(c.productId);
      if (prod && prod.storeId.toString() === String(storeId)) {
        const diff = Number(c.countedStock) - prod.stock;
        if (!Number.isInteger(Number(c.countedStock)) || Number(c.countedStock) < 0) continue;
        if (Math.abs(diff) >= 5) {
          const approval = await Approval.create({ type: 'INVENTORY_CHANGE', status: 'PENDING', requestedBy: req.user!.id, requestedByRole: req.user!.role, requestedByName: req.user!.name, targetType: 'PRODUCT', targetId: prod._id, requestData: { kind: 'STOCK_ADJUSTMENT', storeId: prod.storeId, quantityChange: diff, reason: String(c.notes || 'Stock count variance'), adjustmentType: 'CYCLE_COUNT' }, requiresSecondFactor: false, expiresAt: new Date(Date.now() + 7 * 86400000), creatorCanApprove: false });
          results.push({ productId: prod._id, name: prod.name, variance: diff, pendingApproval: true, approvalId: approval._id });
          await logInventory(req, { action: 'STOCK_COUNT_VARIANCE_REQUESTED', entityId: prod._id.toString(), storeId, previousValue: { stock: prod.stock }, newValue: { countedStock: Number(c.countedStock), variance: diff, approvalId: approval._id }, reason: String(c.notes || 'Cycle stock count') });
          continue;
        }
        prod.stock = Number(c.countedStock);
        await prod.save();
        results.push({ productId: prod._id, name: prod.name, variance: diff, newStock: prod.stock });
        await logInventory(req, { action: 'STOCK_COUNT_RECONCILED', entityId: prod._id.toString(), storeId, previousValue: { stock: prod.stock - diff }, newValue: { stock: prod.stock, variance: diff }, reason: String(c.notes || 'Cycle stock count') });
      }
    }

    res.json({ success: true, count: results.length, variances: results });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create product (Admin / Store Manager / Stock Controller)
router.post('/', authenticate, requirePermission('inventory:write'), requireRoleScope('ORG', 'BRANCH', 'REGION'), async (req: AuthRequest, res) => {
  try {
    delete req.body.image; delete req.body.imageData; // photos go through POST /:id/image
    const storeId = String(req.body.storeId || req.user?.storeId || '');
    if (!storeId || !(await hasStoreScope(req, storeId))) return res.status(403).json({ success: false, error: 'You cannot create catalogue items for this branch.' });
    const branch = await Store.findById(storeId).select('organizationId');
    if (!branch) return res.status(404).json({ success: false, error: 'Branch not found.' });
    // Roles that cannot set prices (stock controllers) propose the product for approval instead.
    if (!canSetPrices(req)) return await proposeProduct(req, res, storeId);
    if (req.body.soldBy === 'weight' && (!req.body.pluCode || !Number.isFinite(Number(req.body.pricePerKgMinor)) || Number(req.body.pricePerKgMinor) <= 0)) return res.status(400).json({ success: false, error: 'Weighted products require a PLU code and positive price per kg.' });
    const catalogueProduct = branch.organizationId ? await CatalogueProduct.create({ organizationId: branch.organizationId, name: req.body.name, category: req.body.category, barcode: req.body.barcode, barcodeAliases: req.body.barcodeAliases || [], pluCode: req.body.pluCode, sku: req.body.sku, priceMinor: Number(req.body.priceMinor), compareAtPriceMinor: req.body.compareAtPriceMinor, vatRateBps: Number(req.body.vatRateBps || 0), isWeighted: !!req.body.isWeighted, soldBy: req.body.soldBy || 'unit', pricePerKgMinor: req.body.pricePerKgMinor, requiresSerializedTag: !!req.body.requiresSerializedTag, highTheft: !!req.body.highTheft }) : null;
    const branches = req.user && ['ORG', 'PLATFORM'].includes((await import('../../middleware/auth.js')).roleScope(req.user.role)) && branch.organizationId
      ? await Store.find({ organizationId: branch.organizationId, active: true }).select('_id')
      : [{ _id: branch._id }];
    let product: any = null;
    for (const targetBranch of branches) {
      const existing = await Product.findOne({ storeId: targetBranch._id, $or: [{ barcode: req.body.barcode }, ...(catalogueProduct ? [{ catalogueProductId: catalogueProduct._id }] : [])] });
      if (existing) { if (targetBranch._id.toString() === storeId) product = existing; continue; }
      const created = await Product.create({ ...req.body, storeId: targetBranch._id, catalogueProductId: catalogueProduct?._id, soldBy: req.body.soldBy || 'unit', requiresSerializedTag: !!req.body.requiresSerializedTag, stock: 0 });
      if (targetBranch._id.toString() === storeId) product = created;
    }
    if (!product) return res.status(500).json({ success: false, error: 'Catalogue product could not be assigned to the selected branch.' });
    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'CREATE_PRODUCT',
      entityType: 'PRODUCT',
      entityId: product._id.toString(),
      storeId: product.storeId,
      newValue: product,
    });
    res.status(201).json({ success: true, product });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Update product / price (Server-Authoritative Price Versioning)
router.put('/:id', authenticate, requirePermission('inventory:write'), requireRoleScope('ORG', 'BRANCH', 'REGION'), async (req: AuthRequest, res) => {
  try {
    delete req.body.image; delete req.body.imageData; // photos go through POST /:id/image
    const product = await Product.findById(req.params.id);
    if (!product) {
      res.status(404).json({ success: false, error: 'Product not found' });
      return;
    }

    if (!(await hasStoreScope(req, product.storeId.toString()))) return res.status(403).json({ success: false, error: 'You cannot edit catalogue data for this branch.' });

    // Stock controllers may correct a product's descriptive details in their own branch only. The main barcode, PLU,
    // sold-by unit and tag rules (which decide how scanning and pricing work) stay with catalogue managers.
    if (!canSetPrices(req)) {
      const same = (a: any, b: any) => String(a ?? '') === String(b ?? '');
      const locked: string[] = [];
      if (req.body.barcode !== undefined && !same(req.body.barcode, product.barcode)) locked.push('main barcode');
      if (req.body.pluCode !== undefined && !same(req.body.pluCode, product.pluCode)) locked.push('PLU code');
      if (req.body.soldBy !== undefined && !same(req.body.soldBy, product.soldBy || 'unit')) locked.push('sold-by unit');
      if (req.body.isWeighted !== undefined && !!req.body.isWeighted !== !!product.isWeighted) locked.push('weighed setting');
      if (req.body.requiresSerializedTag !== undefined && !!req.body.requiresSerializedTag !== !!product.requiresSerializedTag) locked.push('security tag rule');
      if (req.body.priceMinor !== undefined || req.body.pricePerKgMinor !== undefined || req.body.stock !== undefined || req.body.storeId !== undefined || req.body.vatRateBps !== undefined) {
        return res.status(403).json({ success: false, error: 'Prices and VAT are changed by catalogue managers; stock changes use Receive Stock or a stock count.' });
      }
      if (locked.length) return res.status(403).json({ success: false, error: `Changing the ${locked.join(', ')} needs a catalogue manager.` });
      const before = product.toObject();
      if (req.body.name !== undefined) product.name = String(req.body.name).trim();
      if (req.body.category !== undefined) product.category = String(req.body.category).trim();
      if (req.body.sku !== undefined) product.sku = String(req.body.sku).trim();
      if (req.body.highTheft !== undefined) product.highTheft = !!req.body.highTheft;
      if (Array.isArray(req.body.barcodeAliases)) {
        const aliases: string[] = [...new Set<string>(req.body.barcodeAliases.map((a: unknown) => String(a).trim()).filter(Boolean))];
        const added = aliases.filter((a) => !(product.barcodeAliases || []).includes(a));
        const conflict = await findCodeConflict(product.storeId, added, product._id);
        if (conflict) return res.status(409).json({ success: false, error: conflict });
        product.barcodeAliases = aliases;
      }
      await product.save();
      await logInventory(req, { action: 'UPDATE_PRODUCT', entityId: product._id.toString(), storeId: product.storeId, previousValue: before, newValue: product.toObject(), reason: req.body.reason || 'Product details updated by stock controller' });
      return res.json({ success: true, product });
    }
    if (req.body.priceMinor !== undefined || req.body.pricePerKgMinor !== undefined || req.body.stock !== undefined || req.body.storeId !== undefined || req.body.vatRateBps !== undefined) return res.status(400).json({ success: false, error: 'Price and tax changes require branch manager approval; stock changes must use receiving or stock-count workflows.' });

    const previous = product.toObject();
    const branch = await Store.findById(product.storeId).select('organizationId');
    let catalogueProduct = product.catalogueProductId ? await CatalogueProduct.findById(product.catalogueProductId) : null;
    if (!catalogueProduct && branch?.organizationId) {
      catalogueProduct = await CatalogueProduct.findOne({ organizationId: branch.organizationId, barcode: product.barcode });
      if (!catalogueProduct) catalogueProduct = await CatalogueProduct.create({ organizationId: branch.organizationId, name: product.name, category: product.category, barcode: product.barcode, barcodeAliases: product.barcodeAliases || [], pluCode: product.pluCode, sku: product.sku, priceMinor: product.priceMinor, compareAtPriceMinor: product.compareAtPriceMinor, vatRateBps: product.vatRateBps, isWeighted: product.isWeighted, highTheft: product.highTheft });
    }
    if (catalogueProduct) {
      for (const field of ['name', 'category', 'barcode', 'sku', 'barcodeAliases', 'pluCode', 'isWeighted', 'soldBy', 'pricePerKgMinor', 'requiresSerializedTag', 'highTheft'] as const) {
        if (req.body[field] !== undefined) (catalogueProduct as any)[field] = req.body[field];
      }
      await catalogueProduct.save();
      const relatedProducts = await Product.find({ $or: [{ catalogueProductId: catalogueProduct._id }, { _id: product._id }, ...(branch?.organizationId ? [{ storeId: { $in: (await Store.find({ organizationId: branch.organizationId }).distinct('_id')) }, barcode: catalogueProduct.barcode }] : [])] });
      for (const related of relatedProducts) {
        related.catalogueProductId = catalogueProduct._id as any;
        related.name = catalogueProduct.name;
        related.category = catalogueProduct.category;
        related.barcode = catalogueProduct.barcode;
        related.sku = catalogueProduct.sku;
        related.barcodeAliases = catalogueProduct.barcodeAliases;
        related.pluCode = catalogueProduct.pluCode;
        related.isWeighted = catalogueProduct.isWeighted;
        related.soldBy = catalogueProduct.soldBy;
        related.pricePerKgMinor = catalogueProduct.pricePerKgMinor;
        related.requiresSerializedTag = catalogueProduct.requiresSerializedTag;
        related.highTheft = catalogueProduct.highTheft;
        await related.save();
      }
    } else {
      Object.assign(product, req.body);
      await product.save();
    }

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'UPDATE_PRODUCT',
      entityType: 'PRODUCT',
      entityId: product._id.toString(),
      storeId: product.storeId,
      previousValue: previous,
      newValue: catalogueProduct?.toObject() || product.toObject(),
      reason: req.body.reason || 'Catalogue update',
    });

    res.json({ success: true, product: await Product.findById(product._id) });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Add or replace a product photo (shared with the organization catalogue and the same product in every branch)
router.post('/:id/image', authenticate, requirePermission('inventory:write'), requireRoleScope('ORG', 'BRANCH', 'REGION'), async (req: AuthRequest, res) => {
  try {
    const productId = String(req.params.id);
    if (!Types.ObjectId.isValid(productId)) throw new HttpError(404, 'Product not found.');
    const product = await Product.findById(productId).select('+imageData');
    if (!product) throw new HttpError(404, 'Product not found.');
    if (!(await hasStoreScope(req, product.storeId.toString()))) throw new HttpError(403, 'You cannot change photos for this branch.');
    const image = cleanImage(req.body.image);
    if (!image) throw new HttpError(400, 'A photo is required.');
    await shareImage(product, image);
    await logInventory(req, { action: 'PRODUCT_IMAGE_UPDATED', entityId: product._id.toString(), storeId: product.storeId, reason: 'Product photo updated' });
    return res.json({ success: true, image: product.image });
  } catch (error: any) { return res.status(error.status || 500).json({ success: false, error: error.message }); }
});

export default router;
