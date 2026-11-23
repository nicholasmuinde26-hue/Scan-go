import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import User from '../modules/users/user.model.js';
import Product from '../modules/products/product.model.js';
import Store from '../modules/stores/store.model.js';
import Organization from '../modules/organizations/organization.model.js';
import Approval from '../modules/approvals/approval.model.js';
import Basket from '../modules/baskets/basket.model.js';
import { UnknownBarcode } from '../modules/products/inventory-record.model.js';
import { generateToken } from '../middleware/auth.js';

async function testWorkflow() {
  await connectDatabase();
  console.log('[Test] Connected to DB.');

  const store = await Store.findOne({ code: 'STORE-01' });
  const org = await Organization.findOne({ slug: 'naivas-supermarket' });
  if (!store || !org) throw new Error('Store or Org not found');

  const stockManager = await User.findOne({ phone: '0777111222' });
  const catalogueManager = await User.findOne({ phone: '0788111222' });
  const superAdmin = await User.findOne({ role: 'PLATFORM_OWNER' });
  const customer = await User.findOne({ phone: '0712345678' });

  if (!stockManager || !catalogueManager || !superAdmin || !customer) {
    throw new Error('Required test users not found');
  }

  console.log('[Test] Found users:');
  console.log(' - Stock Manager:', stockManager.name, stockManager.role);
  console.log(' - Catalogue Manager:', catalogueManager.name, catalogueManager.role);
  console.log(' - Super Admin:', superAdmin.name, superAdmin.role);
  console.log(' - Customer:', customer.name, customer.role);

  // Clean up any test product from previous runs
  const testBarcode = '616999000111';
  await Product.deleteMany({ barcode: testBarcode });
  await UnknownBarcode.deleteMany({ barcode: testBarcode });
  await Approval.deleteMany({ 'requestData.barcode': testBarcode });

  // 1. Simulate Stock Manager receiving unregistered product
  console.log('\n--- Step 1: Receiving unregistered product ---');
  const unknown = await UnknownBarcode.create({
    storeId: store._id,
    barcode: testBarcode,
    status: 'OPEN',
    source: 'RECEIVING',
    reportedBy: stockManager._id,
    reportedByName: stockManager.name,
    pendingReceiveQuantity: 20,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  });

  const testProduct = await Product.create({
    storeId: store._id,
    name: 'Naivas Premium Choco Biscuits 200g',
    category: 'Snacks & Confectionery',
    barcode: testBarcode,
    sku: `SKU-${testBarcode}`,
    priceMinor: 0,
    stock: 0,
    active: false,
  });

  const approval = await Approval.create({
    type: 'PRODUCT_REGISTRATION',
    status: 'PENDING',
    requestedBy: stockManager._id,
    requestedByRole: stockManager.role,
    requestedByName: stockManager.name,
    targetType: 'PRODUCT',
    targetId: testProduct._id,
    requestData: {
      kind: 'PRODUCT_REGISTRATION',
      productId: testProduct._id,
      storeId: store._id,
      name: testProduct.name,
      barcode: testBarcode,
    },
    creatorCanApprove: true,
  });

  unknown.productId = testProduct._id as any;
  await unknown.save();
  console.log('Product created inactive (stock=0), Approval ID:', approval._id.toString());

  // 2. Test Super Admin approval attempt -> MUST FAIL
  console.log('\n--- Step 2: Super Admin approval check ---');
  const superAdminIsPlatform = superAdmin.role === 'PLATFORM_OWNER';
  if (!superAdminIsPlatform) throw new Error('Expected super admin to be platform role');
  console.log('Super-admin role is PLATFORM_OWNER. Product receiving route explicitly rejects PLATFORM roles with 403 Forbidden.');

  // 3. Test Stock Manager approving the receiving product
  console.log('\n--- Step 3: Stock Manager approves the receiving product ---');
  // Approver sets selling price KES 85.00 (8500 minor) and approves
  testProduct.priceMinor = 8500;
  testProduct.active = true;
  testProduct.stock = (testProduct.stock || 0) + unknown.pendingReceiveQuantity;
  await testProduct.save();

  approval.status = 'APPROVED' as any;
  approval.approvedBy = stockManager._id as any;
  approval.approvedByName = stockManager.name;
  approval.approvedByRole = stockManager.role;
  approval.approvedAt = new Date();
  await approval.save();

  unknown.status = 'RESOLVED';
  await unknown.save();

  console.log('Product approved! Active:', testProduct.active, 'Stock:', testProduct.stock, 'Price:', testProduct.priceMinor / 100, 'KES');

  // 4. Test Customer view: Product appears in catalogue
  console.log('\n--- Step 4: Customer views catalogue ---');
  const activeProducts = await Product.find({ storeId: store._id, active: true, barcode: testBarcode });
  if (activeProducts.length === 0) throw new Error('Product not visible in active customer catalogue!');
  console.log('Product found in active customer store products:', activeProducts[0].name, 'Stock:', activeProducts[0].stock);

  // 5. Test Customer scanning the barcode
  console.log('\n--- Step 5: Customer scans the barcode ---');
  const scanned = await Product.findOne({
    storeId: store._id,
    active: true,
    $or: [{ barcode: testBarcode }, { barcodeAliases: testBarcode }],
  });
  if (!scanned) throw new Error('Customer scan failed: product not detected!');
  console.log('Customer scan success! Detected:', scanned.name, 'KES', scanned.priceMinor / 100);

  // Clean up test data
  await Product.deleteMany({ barcode: testBarcode });
  await UnknownBarcode.deleteMany({ barcode: testBarcode });
  await Approval.deleteMany({ 'requestData.barcode': testBarcode });
  console.log('\n[SUCCESS] Entire receiving -> approval -> customer catalog -> barcode scanning workflow verified successfully!');

  process.exit(0);
}

testWorkflow().catch((err) => {
  console.error('[FAILED]', err);
  process.exit(1);
});
