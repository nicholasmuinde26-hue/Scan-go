import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import Store from '../modules/stores/store.model.js';
import User from '../modules/users/user.model.js';
import Product from '../modules/products/product.model.js';
import Order from '../modules/orders/order.model.js';
import PickingTask from '../modules/picking/picking.model.js';
import { signReceiptToken, generateBasketHash } from '../shared/utils/crypto.js';
import Organization from '../modules/organizations/organization.model.js';
import { createSubscriptionForOrganization, ensurePlanCatalogue } from '../modules/subscriptions/subscription.service.js';
import EntryPoint from '../modules/presence/entry-point.model.js';
import { ensureEntrySecret, signPosterCode } from '../modules/presence/presence.service.js';
import { ENV } from '../config/environment.js';

async function seed() {
  await connectDatabase();

  // Safety: the full seed WIPES the whole database (users, super admins, workspaces, orders...).
  // On a database that already has data it refuses to run unless you pass --reset.
  //   Fresh DB:        npx tsx src/scripts/seed.ts
  //   Wipe + reseed:   npx tsx src/scripts/seed.ts --reset
  //   Keep your data and only add missing demo staff: npx tsx src/scripts/seed-missing-staff.ts
  const existingUsers = await User.countDocuments();
  if (existingUsers > 0 && !process.argv.includes('--reset')) {
    console.error(
      `[Seed] Refusing to run: database "${mongoose.connection.name}" already has ${existingUsers} users and the seed would delete all of them.\n` +
      `       Use --reset to wipe and reseed, or run src/scripts/seed-missing-staff.ts to add only the missing demo staff.`
    );
    process.exit(1);
  }

  console.log('[Seed] Clearing previous data...');

  await mongoose.connection.dropDatabase();
  console.log('[Seed] Database cleared.');

  await ensurePlanCatalogue();
  const naivasOrganization = await Organization.create({
    name: 'Naivas Supermarket',
    slug: 'naivas-supermarket',
    status: 'ACTIVE',
    contactEmail: 'operations@naivas.example',
  });
  const carrefourOrganization = await Organization.create({
    name: 'Carrefour Hypermarket',
    slug: 'carrefour-hypermarket',
    status: 'ACTIVE',
    contactEmail: 'operations@carrefour.example',
  });
  await createSubscriptionForOrganization(naivasOrganization._id.toString(), 'PRO');
  await createSubscriptionForOrganization(carrefourOrganization._id.toString(), 'BASIC');

  // 1. Create Supermarket Stores
  const store1 = await Store.create({
    name: 'Naivas Supermarket - Nairobi CBD Mega',
    code: 'STORE-01',
    location: 'Moi Avenue, Nairobi CBD',
    organizationId: naivasOrganization._id,
    active: true,
    pickupSlots: [
      { slotId: 'SLOT-01', startTime: '09:00', endTime: '11:00', capacity: 25, active: true },
      { slotId: 'SLOT-02', startTime: '11:00', endTime: '13:00', capacity: 25, active: true },
      { slotId: 'SLOT-03', startTime: '14:00', endTime: '16:00', capacity: 25, active: true },
      { slotId: 'SLOT-04', startTime: '17:00', endTime: '19:00', capacity: 25, active: true },
    ],
    exitLanes: [
      { laneId: 'LANE-01', name: 'Exit Express Lane 1 (Self Checkout)', active: true },
      { laneId: 'LANE-02', name: 'Exit Lane 2 (Trolleys & Bags)', active: true },
      { laneId: 'LANE-03', name: 'Exit Lane 3 (Bulk & Audits)', active: true },
    ],
    fraudConfig: {
      largeBasketMinor: 1000000, // KES 10,000
      mediumBasketMinor: 500000, // KES 5,000
      maxItemsWithoutFullCheck: 25,
      manualEntryAmberThreshold: 4,
      randomAuditPercentage: 5,
    },
  });

  const store2 = await Store.create({
    name: 'Carrefour Hypermarket - Westlands Sarit',
    code: 'STORE-02',
    location: 'Sarit Centre, Westlands, Nairobi',
    organizationId: carrefourOrganization._id,
    active: true,
    pickupSlots: [
      { slotId: 'SLOT-W1', startTime: '10:00', endTime: '12:00', capacity: 30, active: true },
      { slotId: 'SLOT-W2', startTime: '14:00', endTime: '16:00', capacity: 30, active: true },
    ],
    exitLanes: [
      { laneId: 'LANE-W1', name: 'West Gate Fast Exit', active: true },
      { laneId: 'LANE-W2', name: 'East Gate Checked Exit', active: true },
    ],
    fraudConfig: {
      largeBasketMinor: 1200000,
      mediumBasketMinor: 600000,
      maxItemsWithoutFullCheck: 30,
      manualEntryAmberThreshold: 4,
      randomAuditPercentage: 5,
    },
  });

  console.log('[Seed] Created stores:', store1.name, store2.name);

  // 2. Create Users
  const passwordHash = await bcrypt.hash('password123', 10);

  const customer1 = await User.create({
    name: 'John Kamau (Loyal Customer)',
    phone: '0712345678',
    email: 'john@example.com',
    passwordHash,
    role: 'CUSTOMER',
    storeId: store1._id,
    tripsCompleted: 8,
    cleanTrips: 8,
    confirmedDiscrepancies: 0,
    totalSpentMinor: 2850000,
  });

  const customer2 = await User.create({
    name: 'Kevin Otieno (High-Risk Profile)',
    phone: '0722000111',
    email: 'kevin@example.com',
    passwordHash,
    role: 'CUSTOMER',
    storeId: store1._id,
    tripsCompleted: 1,
    cleanTrips: 0,
    confirmedDiscrepancies: 2, // Has previous theft/discrepancies!
    totalSpentMinor: 450000,
  });

  const picker = await User.create({
    name: 'Mary Wanjiku (Store Picker)',
    phone: '0733111222',
    email: 'picker.mary@supermarket.co.ke',
    passwordHash,
    role: 'PICKER',
    storeId: store1._id,
  });

  const exitStaff = await User.create({
    name: 'David Kiprop (Exit Officer)',
    phone: '0744222333',
    email: 'david.exit@supermarket.co.ke',
    passwordHash,
    role: 'EXIT_STAFF',
    storeId: store1._id,
  });

  const supervisor = await User.create({
    name: 'Grace Muthoni (Store Supervisor)',
    phone: '0755333444',
    email: 'grace.supervisor@supermarket.co.ke',
    passwordHash,
    role: 'SUPERVISOR',
    storeId: store1._id,
  });

  const manager = await User.create({
    name: 'James Mwangi (Store Manager)',
    phone: '0766444555',
    email: 'james.manager@supermarket.co.ke',
    passwordHash,
    role: 'STORE_MANAGER',
    storeId: store1._id,
  });

  // Inventory roles for testing the stock controller flow: a stock controller proposes products and a
  // catalogue & inventory manager (organization level) approves them.
  const stockController = await User.create({
    name: 'Peter Ouma (Stock Controller)',
    phone: '0777555666',
    email: 'peter.stock@supermarket.co.ke',
    passwordHash,
    role: 'STOCK_CONTROLLER',
    storeId: store1._id,
  });

  // Branch manager for the Naivas Nairobi CBD Mega branch: runs the branch and approves branch-level changes.
  const branchManager = await User.create({
    name: 'Samuel Njoroge (Branch Manager)',
    phone: '0799777888',
    email: 'branch.manager@supermarket.co.ke',
    passwordHash,
    role: 'BRANCH_MANAGER',
    storeId: store1._id,
  });

  const catalogueManager = await User.create({
    name: 'Faith Njeri (Catalogue & Inventory Manager)',
    phone: '0788666777',
    email: 'faith.catalogue@supermarket.co.ke',
    passwordHash,
    role: 'CATALOGUE_INVENTORY_MANAGER',
    organizationId: naivasOrganization._id,
  });

  const systemAdmin = await User.create({
    name: 'Alex Kibet (System Admin)',
    phone: '0700000000',
    email: 'admin@scanandgo.co.ke',
    passwordHash,
    role: 'SYSTEM_ADMIN',
    storeId: store1._id,
  });

  await User.updateMany(
    { storeId: store1._id, role: { $ne: 'SYSTEM_ADMIN' } },
    { $set: { organizationId: naivasOrganization._id } }
  );

  console.log('[Seed] Created users for all roles.');
  console.log(`[Seed] Branch manager login: ${branchManager.phone} / password123 (${store1.name})`);

  // 3. Create Products with realistic Barcodes and Kenyan Supermarket Prices
  const productData = [
    {
      storeId: store1._id,
      name: 'Unga Pembe Maize Flour 2kg',
      category: 'Flour & Grains',
      barcode: '616110001234',
      sku: 'PEM-2KG',
      priceMinor: 22000, // KES 220.00
      weightGrams: 2000,
      isWeighted: false,
      highTheft: false,
      stock: 150,
      image: 'https://images.unsplash.com/photo-1574316071802-0d684efa7bf5?auto=format&fit=crop&w=400&q=80',
    },
    {
      storeId: store1._id,
      name: 'Rina Pure Vegetable Oil 1 Litre',
      category: 'Cooking Oils',
      barcode: '616110002345',
      sku: 'RINA-1L',
      priceMinor: 31000, // KES 310.00
      weightGrams: 920,
      isWeighted: false,
      highTheft: false,
      stock: 90,
      image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=400&q=80',
    },
    {
      storeId: store1._id,
      name: 'Brookside Dairy Best Whole Milk 500ml',
      category: 'Dairy & Eggs',
      barcode: '616110003456',
      sku: 'BRK-500ML',
      priceMinor: 6500, // KES 65.00
      weightGrams: 515,
      isWeighted: false,
      highTheft: false,
      stock: 200,
      image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80',
    },
    {
      storeId: store1._id,
      name: 'Ndovu Premium Rice 2kg',
      category: 'Flour & Grains',
      barcode: '616110004567',
      sku: 'NDV-2KG',
      priceMinor: 42000, // KES 420.00
      weightGrams: 2000,
      isWeighted: false,
      highTheft: false,
      stock: 80,
      image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80',
    },
    {
      storeId: store1._id,
      name: 'Festive White Sliced Bread 400g',
      category: 'Bakery',
      barcode: '616110005678',
      sku: 'FEST-400G',
      priceMinor: 7000, // KES 70.00
      weightGrams: 400,
      isWeighted: false,
      highTheft: false,
      stock: 120,
      image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=400&q=80',
    },
    {
      storeId: store1._id,
      name: 'Fresh Red Farm Tomatoes (Scale Produce)',
      category: 'Fresh Produce',
      barcode: '616110006789',
      sku: 'PROD-TOM-KG',
      priceMinor: 14000, // KES 140/kg
      pricePerKgMinor: 14000,
      weightGrams: 1000,
      isWeighted: true,
      highTheft: false,
      stock: 300,
      image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=400&q=80',
    },
    {
      storeId: store1._id,
      name: 'Kenchic Fresh Whole Chicken 1kg',
      category: 'Meat & Poultry',
      barcode: '616110007890',
      sku: 'KEN-CHIK-1KG',
      priceMinor: 68000, // KES 680.00
      weightGrams: 1000,
      isWeighted: false,
      highTheft: true, // High theft category item!
      stock: 45,
      image: 'https://images.unsplash.com/photo-1587593810167-a84920ea0781?auto=format&fit=crop&w=400&q=80',
    },
    {
      storeId: store1._id,
      name: 'Johnnie Walker Black Label Whisky 750ml',
      category: 'Liquor & Spirits',
      barcode: '616110008901',
      sku: 'JW-BLACK-750ML',
      priceMinor: 385000, // KES 3,850.00
      weightGrams: 1350,
      isWeighted: false,
      highTheft: true, // High theft category item!
      stock: 30,
      image: 'https://images.unsplash.com/photo-1527281400683-1aae777175f8?auto=format&fit=crop&w=400&q=80',
    },
    {
      storeId: store1._id,
      name: 'Nan Pro 1 Infant Formula Baby Milk 800g',
      category: 'Baby Care',
      barcode: '616110009012',
      sku: 'NAN-1-800G',
      priceMinor: 245000, // KES 2,450.00
      weightGrams: 800,
      isWeighted: false,
      highTheft: true, // High theft category item!
      stock: 40,
      image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=400&q=80',
    },
    {
      storeId: store1._id,
      name: 'Omo Hand Washing Powder Detergent 1kg',
      category: 'Household & Cleaning',
      barcode: '616110010123',
      sku: 'OMO-1KG',
      priceMinor: 34000, // KES 340.00
      weightGrams: 1000,
      isWeighted: false,
      highTheft: false,
      stock: 110,
      image: 'https://images.unsplash.com/photo-1610557892470-55d9e80c0bce?auto=format&fit=crop&w=400&q=80',
    },
    {
      storeId: store1._id,
      name: 'Ketepa Pride Premium Tea Bags 100s',
      category: 'Beverages',
      barcode: '616110011234',
      sku: 'KET-100TB',
      priceMinor: 29000, // KES 290.00
      weightGrams: 200,
      isWeighted: false,
      highTheft: false,
      stock: 95,
      image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=400&q=80',
    },
    {
      storeId: store1._id,
      name: 'Colgate Maximum Cavity Protection Toothpaste 140g',
      category: 'Personal Care',
      barcode: '616110012345',
      sku: 'COLG-140G',
      priceMinor: 18000, // KES 180.00
      weightGrams: 140,
      isWeighted: false,
      highTheft: false,
      stock: 180,
      image: 'https://images.unsplash.com/photo-1559591937-e1032338b584?auto=format&fit=crop&w=400&q=80',
    },
  ];

  const createdProducts = await Product.insertMany(productData);
  console.log(`[Seed] Inserted ${createdProducts.length} supermarket products.`);

  // 4. Create a Pre-Seeded Shop & Collect Order awaiting picking
  const orderItemsCC = [
    {
      productId: createdProducts[0]._id,
      productName: createdProducts[0].name,
      barcode: createdProducts[0].barcode,
      quantity: 2,
      unitPriceMinor: createdProducts[0].priceMinor,
      lineTotalMinor: createdProducts[0].priceMinor * 2,
      priceVersion: 1,
      weightGrams: 4000,
    },
    {
      productId: createdProducts[1]._id,
      productName: createdProducts[1].name,
      barcode: createdProducts[1].barcode,
      quantity: 1,
      unitPriceMinor: createdProducts[1].priceMinor,
      lineTotalMinor: createdProducts[1].priceMinor,
      priceVersion: 1,
      weightGrams: 920,
    },
    {
      productId: createdProducts[5]._id, // Fresh produce (tomatoes)
      productName: createdProducts[5].name,
      barcode: createdProducts[5].barcode,
      quantity: 1,
      unitPriceMinor: createdProducts[5].priceMinor,
      lineTotalMinor: createdProducts[5].priceMinor,
      priceVersion: 1,
      isWeighted: true,
      weightGrams: 1000,
    },
  ];

  const totalMinorCC = orderItemsCC.reduce((s, i) => s + i.lineTotalMinor, 0);
  const hashCC = generateBasketHash(orderItemsCC.map(i => ({ productId: i.productId.toString(), quantity: i.quantity, unitPriceMinor: i.unitPriceMinor })));

  const sampleOrderCC = await Order.create({
    orderNumber: 'CC-20261031-1024',
    orderType: 'CLICK_AND_COLLECT',
    storeId: store1._id,
    customerId: customer1._id,
    items: orderItemsCC,
    totalMinor: totalMinorCC,
    totalItems: 4,
    expectedWeightGrams: 5920,
    basketHash: hashCC,
    status: 'PICKING',
    pickupSlot: {
      slotId: 'SLOT-03',
      date: '2026-10-31',
      timeWindow: '2:00 PM – 4:00 PM',
    },
    substitutionsAllowed: true,
    paymentPlan: 'DEPOSIT',
    depositMinor: Math.ceil(totalMinorCC / 2 / 100) * 100,
    paidMinor: Math.ceil(totalMinorCC / 2 / 100) * 100,
    assignedPickerId: picker._id,
    paidAt: new Date(),
    statusHistory: [
      { status: 'PAYMENT_PENDING', changedAt: new Date(Date.now() - 3600000), note: 'Submitted pre-order' },
      { status: 'PICKING', changedAt: new Date(Date.now() - 3000000), note: 'Paid KES 890.00 via M-PESA. Assigned to Mary Wanjiku' },
    ],
  });

  // Create picking task for this pre-order
  await PickingTask.create({
    orderId: sampleOrderCC._id,
    storeId: store1._id,
    pickerId: picker._id,
    status: 'IN_PROGRESS',
    items: orderItemsCC.map(i => ({
      productId: i.productId,
      barcode: i.barcode,
      name: i.productName,
      requiredQuantity: i.quantity,
      scannedQuantity: 1, // 1 already scanned, remaining to scan!
      isWeighted: i.isWeighted,
      expectedWeightGrams: i.weightGrams,
      isVerified: false,
      status: 'PENDING',
    })),
    startedAt: new Date(),
  });

  // 5. Create a Pre-Seeded Scan & Go Order with Single-Use QR Receipt ready for Exit Verification
  const orderItemsSG = [
    {
      productId: createdProducts[2]._id, // Brookside milk
      productName: createdProducts[2].name,
      barcode: createdProducts[2].barcode,
      quantity: 2,
      unitPriceMinor: createdProducts[2].priceMinor,
      lineTotalMinor: createdProducts[2].priceMinor * 2,
      priceVersion: 1,
    },
    {
      productId: createdProducts[4]._id, // Festive bread
      productName: createdProducts[4].name,
      barcode: createdProducts[4].barcode,
      quantity: 1,
      unitPriceMinor: createdProducts[4].priceMinor,
      lineTotalMinor: createdProducts[4].priceMinor,
      priceVersion: 1,
    },
  ];

  const totalMinorSG = orderItemsSG.reduce((s, i) => s + i.lineTotalMinor, 0);
  const hashSG = generateBasketHash(orderItemsSG.map(i => ({ productId: i.productId.toString(), quantity: i.quantity, unitPriceMinor: i.unitPriceMinor })));

  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const sampleOrderSG = await Order.create({
    orderNumber: 'SG-20261031-8842',
    orderType: 'SCAN_AND_GO',
    storeId: store1._id,
    customerId: customer1._id,
    items: orderItemsSG,
    totalMinor: totalMinorSG,
    totalItems: 3,
    expectedWeightGrams: 1430,
    basketHash: hashSG,
    status: 'PAID',
    paidAt: new Date(),
    statusHistory: [
      { status: 'PAID', changedAt: new Date(), note: 'Paid KES 200.00 via M-PESA. Single-use exit receipt issued.' },
    ],
  });

  const receiptTokenSG = signReceiptToken({
    orderId: sampleOrderSG._id.toString(),
    storeId: store1._id.toString(),
    totalMinor: totalMinorSG,
    nonce: 'sample_seed_nonce_123',
    expiresAt,
  });

  sampleOrderSG.collectionQrToken = receiptTokenSG;
  await sampleOrderSG.save();

  // In-store presence for the demo store: location, two printed posters, and their QR links.
  // Replace the coordinates with the real entrance location (PUT /api/v1/presence/stores/:storeId/config) before a pilot.
  await Store.updateOne(
    { _id: store1._id },
    { $set: { geo: { type: 'Point', coordinates: [36.8219, -1.2833] }, geoRadiusMetres: 150 } }
  );
  const entrySecret = await ensureEntrySecret(store1._id);
  const entrance = await EntryPoint.create({ storeId: store1._id, label: 'Main entrance poster', tier: 1 });
  const aisle = await EntryPoint.create({ storeId: store1._id, label: 'Aisle poster (fallback)', tier: 2 });
  const frontend = ENV.FRONTEND_URL.replace(/\/$/, '');
  console.log('[Seed] Poster QR links for', store1.name);
  console.log(`[Seed]   Tier 1 entrance: ${frontend}/enter?p=${signPosterCode(entrance._id.toString(), entrySecret)}`);
  console.log(`[Seed]   Tier 2 aisle:    ${frontend}/enter?p=${signPosterCode(aisle._id.toString(), entrySecret)}`);

  console.log('[Seed] Seeding completed successfully!');
  console.log(`[Seed] Sample Scan & Go Order: ${sampleOrderSG.orderNumber} (Receipt ready for Exit Scanner)`);
  console.log(`[Seed] Sample Shop & Collect Order: ${sampleOrderCC.orderNumber} (Awaiting Picker)`);
  process.exit(0);
}

seed().catch(err => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});