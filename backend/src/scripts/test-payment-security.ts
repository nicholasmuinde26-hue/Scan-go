import assert from 'assert';
import { parseDarajaCallback, verifyDarajaCallback } from '../modules/payments/daraja.service.js';
import { ENV } from '../config/environment.js';
import { isFlutterwavePaymentValid, verifyFlutterwaveWebhookSignature } from '../modules/payments/flutterwave.service.js';
import {
  signReceiptToken,
  verifyReceiptToken,
  generateRotatingQrPayload,
} from '../shared/utils/crypto.js';

console.log('--- Running Payment Security & Callback Verification Tests ---');

// Test 1: verifyDarajaCallback rejects requests without secret or allowed IP
{
  const mockReqNoAuth: any = {
    query: {},
    headers: {},
    socket: { remoteAddress: '203.0.113.195' }, // Random external IP
  };
  const result = verifyDarajaCallback(mockReqNoAuth);
  assert.strictEqual(result.valid, false, 'Expected callback without secret/IP to fail');
  console.log('✓ Test 1 Passed: Unauthorized callback rejected');
}

// Test 2: verifyDarajaCallback accepts valid secret in URL query
{
  const mockReqWithSecret: any = {
    query: { secret: ENV.MPESA_CALLBACK_SECRET },
    headers: {},
    socket: { remoteAddress: '203.0.113.195' },
  };
  const result = verifyDarajaCallback(mockReqWithSecret);
  assert.strictEqual(result.valid, true, 'Expected callback with valid URL secret to pass');
  console.log('✓ Test 2 Passed: Callback with valid URL secret accepted');
}

// Test 3: verifyDarajaCallback accepts known Daraja IP
{
  const mockReqWithIp: any = {
    query: {},
    headers: {},
    socket: { remoteAddress: '196.201.214.200' },
  };
  const result = verifyDarajaCallback(mockReqWithIp);
  assert.strictEqual(result.valid, true, 'Expected callback from Daraja IP to pass');
  console.log('✓ Test 3 Passed: Callback from official Daraja IP accepted');
}

// Test 4: parseDarajaCallback rejects old/arbitrary body format
{
  const oldSpoofedBody = {
    checkoutRequestId: 'ws_CO_123456',
    amountMinor: 100,
    resultCode: 0,
  };
  const parsed = parseDarajaCallback(oldSpoofedBody);
  assert.strictEqual(parsed.isValidFormat, false, 'Expected old body format to be rejected');
  console.log('✓ Test 4 Passed: Arbitrary/spoofed request body format rejected');
}

// Test 5: parseDarajaCallback correctly parses official Daraja format
{
  const realDarajaBody = {
    Body: {
      stkCallback: {
        MerchantRequestID: '29115-34620561-1',
        CheckoutRequestID: 'ws_CO_191220191020363925',
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        CallbackMetadata: {
          Item: [
            { Name: 'Amount', Value: 150.00 },
            { Name: 'MpesaReceiptNumber', Value: 'QHK123456' },
            { Name: 'TransactionDate', Value: 20261103142010 },
            { Name: 'PhoneNumber', Value: 254712345678 },
          ],
        },
      },
    },
  };
  const parsed = parseDarajaCallback(realDarajaBody);
  assert.strictEqual(parsed.isValidFormat, true);
  assert.strictEqual(parsed.checkoutRequestId, 'ws_CO_191220191020363925');
  assert.strictEqual(parsed.resultCode, 0);
  assert.strictEqual(parsed.amountKes, 150.00);
  assert.strictEqual(parsed.amountMinor, 15000);
  assert.strictEqual(parsed.mpesaReceiptNumber, 'QHK123456');
  console.log('✓ Test 5 Passed: Real Daraja callback payload correctly parsed');
}

// Test 6: parseDarajaCallback ignores rogue amountMinor injected at top level
{
  const hijackedPayload = {
    amountMinor: 1, // Attacker tries to pay KES 0.01
    checkoutRequestId: 'ws_CO_spoofed',
    Body: {
      stkCallback: {
        MerchantRequestID: 'merch_1',
        CheckoutRequestID: 'ws_CO_real',
        ResultCode: 0,
        ResultDesc: 'Success',
        CallbackMetadata: {
          Item: [
            { Name: 'Amount', Value: 500.00 },
            { Name: 'MpesaReceiptNumber', Value: 'NLJ7RT61SV' },
          ],
        },
      },
    },
  };
  const parsed = parseDarajaCallback(hijackedPayload);
  assert.strictEqual(parsed.checkoutRequestId, 'ws_CO_real');
  assert.strictEqual(parsed.amountMinor, 50000, 'Must ignore rogue top-level amountMinor and take Daraja metadata amount');
  console.log('✓ Test 6 Passed: Rogue top-level amountMinor ignored');
}

// Test 7: parseDarajaCallback parses failed/cancelled callback (ResultCode 1032)
{
  const cancelledPayload = {
    Body: {
      stkCallback: {
        MerchantRequestID: '29115-34620561-1',
        CheckoutRequestID: 'ws_CO_191220191020363925',
        ResultCode: 1032,
        ResultDesc: 'Request cancelled by user.',
      },
    },
  };
  const parsed = parseDarajaCallback(cancelledPayload);
  assert.strictEqual(parsed.isValidFormat, true);
  assert.strictEqual(parsed.resultCode, 1032);
  assert.strictEqual(parsed.amountMinor, undefined);
  console.log('✓ Test 7 Passed: Daraja cancellation payload parsed');
}

// Test 8: Rotating dynamic QR token within current window is accepted
{
  const baseToken = signReceiptToken({
    orderId: '507f1f77bcf86cd799439011',
    storeId: '507f1f77bcf86cd799439022',
    totalMinor: 25000,
    nonce: 'abc123nonce',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });

  const { dynamicPayload } = generateRotatingQrPayload(baseToken);
  const verifyResult = verifyReceiptToken(dynamicPayload);
  assert.strictEqual(verifyResult.valid, true);
  assert.strictEqual(verifyResult.isRotating, true);
  console.log('✓ Test 8 Passed: Live dynamic rotating QR token verified');
}

// Test 9: Stale / screenshot rotating QR token is rejected
{
  const baseToken = signReceiptToken({
    orderId: '507f1f77bcf86cd799439011',
    storeId: '507f1f77bcf86cd799439022',
    totalMinor: 25000,
    nonce: 'abc123nonce',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });

  // Create an expired window (10 windows ago = 5 minutes old screenshot)
  const expiredWindow = Math.floor(Date.now() / 30000) - 10;
  const stalePayload = `${baseToken}.rot.${expiredWindow}.fake_sig`;
  const verifyResult = verifyReceiptToken(stalePayload);
  assert.strictEqual(verifyResult.valid, false);
  assert.strictEqual(verifyResult.isScreenshot, true);
  console.log('✓ Test 9 Passed: Screenshot / stale rotating QR token rejected');
}

console.log('--- All Security & Callback Parsing Tests Passed Successfully! ---');

// Card provider confirmation must match status, transaction reference, currency, and amount.
{
  const valid = { id: 42, tx_ref: 'SG-order-ref', status: 'successful', amount: 150, currency: 'KES' };
  assert.strictEqual(isFlutterwavePaymentValid(valid, { reference: 'SG-order-ref', amountMinor: 15000 }), true);
  assert.strictEqual(isFlutterwavePaymentValid({ ...valid, amount: 149 }, { reference: 'SG-order-ref', amountMinor: 15000 }), false);
  assert.strictEqual(isFlutterwavePaymentValid({ ...valid, tx_ref: 'other' }, { reference: 'SG-order-ref', amountMinor: 15000 }), false);
  assert.strictEqual(verifyFlutterwaveWebhookSignature('configured-hash', 'configured-hash'), true);
  assert.strictEqual(verifyFlutterwaveWebhookSignature('wrong-hash', 'configured-hash'), false);
  console.log('✓ Card provider status, reference, amount, and webhook signature checks passed');
}
