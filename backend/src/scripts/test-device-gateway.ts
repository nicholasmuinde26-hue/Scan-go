import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { createApp } from '../app.js';
import User from '../modules/users/user.model.js';
import Store from '../modules/stores/store.model.js';
import Product from '../modules/products/product.model.js';
import StoreSession from '../modules/presence/store-session.model.js';
import Basket from '../modules/baskets/basket.model.js';
import RetailDevice from '../modules/devices/device.model.js';
import DeviceEvent from '../modules/devices/device-event.model.js';
import { generateToken } from '../middleware/auth.js';

/**
 * End-to-end smoke test for the retail device gateway.
 *
 * Spins the app up in-process on an ephemeral port, then exercises the real
 * HTTP surface a smart basket would use:
 *   register device (manager JWT) -> heartbeat -> product scan -> idempotent
 *   replay -> item removal -> bad-credential rejection.
 *
 * Creates a throwaway session + basket + device and cleans them up afterwards.
 * Run:  npx tsx src/scripts/test-device-gateway.ts
 */

const results: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  await connectDatabase();
  const app = createApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}/api/v1`;

  const store = await Store.findOne({}).sort({ createdAt: 1 });
  const manager = await User.findOne({
    storeId: store?._id,
    role: { $in: ['STORE_MANAGER', 'SUPERVISOR', 'BRANCH_MANAGER', 'GENERAL_MANAGER', 'REGION_MANAGER'] },
  });
  const customer = await User.findOne({ role: 'CUSTOMER' });
  const product = await Product.findOne({ storeId: store!._id, priceMinor: { $gt: 0 } });
  if (!store || !manager || !customer || !product) {
    throw new Error('Need a store, a manager-role user, a customer and a priced product in the DB.');
  }
  console.log(`[setup] store=${store.name} manager=${manager.name} product=${product.name} (${product.barcode})`);

  const deviceId = `smoke-basket-${Date.now()}`;
  let sessionId = '';
  let basketId = '';
  let secret = '';

  try {
    // --- fixture: an ACTIVE in-store session for the customer -------------
    const session = await StoreSession.create({
      userId: customer._id,
      storeId: store._id,
      deviceId: 'SMOKE_TEST',
      trustTier: 1,
      presenceMethod: 'STATIC_QR_ONLY',
      softSignals: { gps: false, wifi: false },
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      ttlMinutes: 120,
      activityCount: 0,
    });
    sessionId = session._id.toString();

    const managerToken = generateToken({
      id: manager._id.toString(), role: manager.role, storeId: store._id.toString(),
      organizationId: store.organizationId?.toString(), name: manager.name, phone: manager.phone,
    });

    // --- 1. register the device -------------------------------------------
    const reg = await fetch(`${base}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({
        deviceId, storeId: store._id.toString(), kind: 'BASKET_PRO',
        label: 'Smoke-test basket', capabilities: { scanner: true },
      }),
    });
    const regBody = await reg.json() as any;
    check('register device', reg.status === 201 && !!regBody.secret, `HTTP ${reg.status}`);
    secret = regBody.secret || '';
    if (!secret) {
      console.log('Aborting remaining checks — device registration failed.');
      return;
    }

    const devHeaders = {
      'Content-Type': 'application/json',
      'X-Device-Id': deviceId,
      'X-Device-Key': secret,
    };

    // --- 2. heartbeat ------------------------------------------------------
    const hb = await fetch(`${base}/devices/events`, {
      method: 'POST', headers: devHeaders,
      body: JSON.stringify({ eventId: `hb-${Date.now()}`, type: 'HEARTBEAT', sessionId, payload: { firmwareVersion: 'smoke-1.0' } }),
    });
    const hbBody = await hb.json() as any;
    check('heartbeat applied', hb.status === 202 && hbBody.applied === true, JSON.stringify(hbBody).slice(0, 120));

    // --- 3. product scan ---------------------------------------------------
    const scanEventId = `scan-${Date.now()}`;
    const scan = await fetch(`${base}/devices/events`, {
      method: 'POST', headers: devHeaders,
      body: JSON.stringify({
        eventId: scanEventId, type: 'PRODUCT_SCAN', sessionId,
        payload: { barcode: product.barcode, quantity: 2, firmwareVersion: 'smoke-1.0' },
      }),
    });
    const scanBody = await scan.json() as any;
    const scanResult = scanBody;
    check('product scan applied', scan.status === 202 && scanBody.applied === true, JSON.stringify(scanResult).slice(0, 160));
    check('scan priced correctly', scanResult?.totals?.totalItems === 2, `totalItems=${scanResult?.totals?.totalItems}`);
    const createdBasket = await Basket.findOne({ storeSessionId: new mongoose.Types.ObjectId(sessionId), status: 'OPEN' });
    basketId = createdBasket?._id?.toString() || '';

    // --- 4. idempotent replay ----------------------------------------------
    const replay = await fetch(`${base}/devices/events`, {
      method: 'POST', headers: devHeaders,
      body: JSON.stringify({
        eventId: scanEventId, type: 'PRODUCT_SCAN', sessionId,
        payload: { barcode: product.barcode, quantity: 2 },
      }),
    });
    const replayBody = await replay.json() as any;
    const basketAfter = await Basket.findById(basketId);
    check('event replay is idempotent', replayBody.duplicate === true && basketAfter?.totalItems === 2,
      `duplicate=${replayBody.duplicate} totalItems=${basketAfter?.totalItems}`);

    // --- 5. item removal -----------------------------------------------------
    const rem = await fetch(`${base}/devices/events`, {
      method: 'POST', headers: devHeaders,
      body: JSON.stringify({
        eventId: `rem-${Date.now()}`, type: 'ITEM_REMOVED', sessionId, basketId,
        payload: { barcode: product.barcode },
      }),
    });
    const remBody = await rem.json() as any;
    const basketFinal = await Basket.findById(basketId);
    check('item removed', remBody.applied === true && basketFinal?.totalItems === 0 && basketFinal?.removalCount === 1,
      `totalItems=${basketFinal?.totalItems} removalCount=${basketFinal?.removalCount}`);

    // --- 6. weight anomaly signal ---------------------------------------------
    const weigh = await fetch(`${base}/devices/events`, {
      method: 'POST', headers: devHeaders,
      body: JSON.stringify({
        eventId: `wt-${Date.now()}`, type: 'WEIGHT_READING', sessionId, basketId,
        payload: { weightGrams: (basketFinal?.expectedWeightGrams || 0) + 5000 },
      }),
    });
    const weighBody = await weigh.json() as any;
    check('weight anomaly flagged', weighBody.riskSignal === 'WEIGHT_ANOMALY',
      `riskSignal=${weighBody.riskSignal}`);

    // --- 7. bad credentials rejected -------------------------------------------
    const bad = await fetch(`${base}/devices/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId, 'X-Device-Key': 'sgd_wrong' },
      body: JSON.stringify({ eventId: `bad-${Date.now()}`, type: 'HEARTBEAT' }),
    });
    check('bad device key rejected', bad.status === 401, `HTTP ${bad.status}`);

    // --- 8. event log persisted -----------------------------------------------
    // hb + scan + removal + weight = 4 docs; the replay is deduplicated and the
    // bad-key attempt never reaches ingestion.
    const logged = await DeviceEvent.countDocuments({ deviceId });
    check('events persisted to log', logged === 4, `${logged} DeviceEvent docs`);
  } finally {
    // --- cleanup ---------------------------------------------------------------
    await RetailDevice.deleteMany({ deviceId });
    await DeviceEvent.deleteMany({ deviceId });
    if (sessionId) {
      await Basket.deleteMany({ storeSessionId: new mongoose.Types.ObjectId(sessionId) });
      await StoreSession.deleteMany({ _id: sessionId });
    }
    server.close();
    await mongoose.disconnect();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
