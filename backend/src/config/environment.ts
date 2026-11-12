import dotenv from 'dotenv';
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// Strict validation: fail startup in production if sensitive secrets are not configured or still have default values
if (isProduction) {
  const missingSecrets: string[] = [];
  const insecureSecrets: string[] = [];

  if (!process.env.JWT_SECRET) {
    missingSecrets.push('JWT_SECRET');
  } else if (process.env.JWT_SECRET.includes('super_secret_jwt_key')) {
    insecureSecrets.push('JWT_SECRET');
  }

  if (!process.env.HMAC_RECEIPT_SECRET) {
    missingSecrets.push('HMAC_RECEIPT_SECRET');
  } else if (process.env.HMAC_RECEIPT_SECRET.includes('loss_prevention_key')) {
    insecureSecrets.push('HMAC_RECEIPT_SECRET');
  }

  if (!process.env.MPESA_PASSKEY) {
    missingSecrets.push('MPESA_PASSKEY');
  } else if (process.env.MPESA_PASSKEY.includes('bfb279f9aa9b')) {
    insecureSecrets.push('MPESA_PASSKEY');
  }

  if (!process.env.MPESA_CALLBACK_SECRET) {
    missingSecrets.push('MPESA_CALLBACK_SECRET');
  } else if (process.env.MPESA_CALLBACK_SECRET.includes('saf_callback_secret')) {
    insecureSecrets.push('MPESA_CALLBACK_SECRET');
  }

  if (!process.env.MPESA_CONSUMER_KEY) {
    missingSecrets.push('MPESA_CONSUMER_KEY');
  }

  if (!process.env.MPESA_CONSUMER_SECRET) {
    missingSecrets.push('MPESA_CONSUMER_SECRET');
  }

  if (!process.env.FLUTTERWAVE_SECRET_KEY) {
    missingSecrets.push('FLUTTERWAVE_SECRET_KEY');
  }

  if (!process.env.FLUTTERWAVE_WEBHOOK_SECRET) {
    missingSecrets.push('FLUTTERWAVE_WEBHOOK_SECRET');
  }

  if (!process.env.MPESA_CALLBACK_URL || !process.env.MPESA_CALLBACK_URL.startsWith('https://')) {
    missingSecrets.push('MPESA_CALLBACK_URL (must be a public HTTPS URL)');
  }

  if (!process.env.FRONTEND_URL || !process.env.FRONTEND_URL.startsWith('https://')) {
    missingSecrets.push('FRONTEND_URL (must be a public HTTPS URL)');
  }

  if (missingSecrets.length > 0) {
    console.error(`[FATAL] Missing production environment secrets: ${missingSecrets.join(', ')}`);
    console.error('[FATAL] You must configure real production secrets in your environment variables before starting the server.');
    process.exit(1);
  }

  if (insecureSecrets.length > 0) {
    console.error(`[FATAL] Insecure production environment secrets (still using defaults): ${insecureSecrets.join(', ')}`);
    console.error('[FATAL] You must change default secret values before going to production.');
    process.exit(1);
  }
}

export const ENV = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/scan_and_go_db',
  JWT_SECRET: process.env.JWT_SECRET || 'super_secret_jwt_key_scan_and_go_2026',
  HMAC_RECEIPT_SECRET: process.env.HMAC_RECEIPT_SECRET || 'hmac_supermarket_loss_prevention_key_9988',
  NODE_ENV: process.env.NODE_ENV || 'development',
  // Daraja configuration - MUST be set via environment variables in production
  MPESA_SHORTCODE: process.env.MPESA_SHORTCODE || '174379',
  MPESA_PASSKEY: process.env.MPESA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
  MPESA_ENVIRONMENT: (process.env.MPESA_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production',
  MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY || '',
  MPESA_CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET || '',
  MPESA_CALLBACK_SECRET: process.env.MPESA_CALLBACK_SECRET || 'saf_callback_secret_token_scanandgo_2026',
  MPESA_ALLOWED_IPS: process.env.MPESA_ALLOWED_IPS || '',
  MPESA_CALLBACK_URL: process.env.MPESA_CALLBACK_URL || '',
  MPESA_RECONCILIATION_INTERVAL_MS: parseInt(process.env.MPESA_RECONCILIATION_INTERVAL_MS || '60000', 10),
  // An STK prompt lives ~60-90s on the handset. After this long with no result we mark it TIMED_OUT so the customer can retry.
  MPESA_PENDING_EXPIRY_MS: parseInt(process.env.MPESA_PENDING_EXPIRY_MS || '150000', 10),
  // A card checkout page the customer walked away from is abandoned after this long.
  CARD_PENDING_EXPIRY_MS: parseInt(process.env.CARD_PENDING_EXPIRY_MS || String(30 * 60 * 1000), 10),
  // Number of reverse proxies in front of the API (0 = none). Needed for correct client IPs / rate limiting behind a proxy or ngrok.
  TRUST_PROXY_HOPS: parseInt(process.env.TRUST_PROXY_HOPS || '0', 10),
  FLUTTERWAVE_SECRET_KEY: process.env.FLUTTERWAVE_SECRET_KEY || '',
  FLUTTERWAVE_WEBHOOK_SECRET: process.env.FLUTTERWAVE_WEBHOOK_SECRET || '',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  ENABLE_PAYMENT_SIMULATION: process.env.ENABLE_PAYMENT_SIMULATION === 'true',
  // Shop & Collect: pay-later orders must put down this share of the total up front (default half).
  CC_DEPOSIT_PERCENT: Math.min(100, Math.max(10, parseInt(process.env.CC_DEPOSIT_PERCENT || '50', 10))),
  // An order not collected this many hours after its pickup slot ends is a no-show (deposit is kept by the store).
  CC_NOSHOW_GRACE_HOURS: parseInt(process.env.CC_NOSHOW_GRACE_HOURS || '2', 10),
  // After this many forfeited deposits a customer must pay in full to use Shop & Collect.
  CC_NOSHOW_STRIKE_LIMIT: parseInt(process.env.CC_NOSHOW_STRIKE_LIMIT || '2', 10),
  // Pickup OTP lifetime and wrong-guess limit.
  CC_PICKUP_OTP_TTL_MS: parseInt(process.env.CC_PICKUP_OTP_TTL_MS || String(10 * 60 * 1000), 10),
  CC_PICKUP_OTP_MAX_ATTEMPTS: parseInt(process.env.CC_PICKUP_OTP_MAX_ATTEMPTS || '5', 10),
  // Optional Africa's Talking SMS (without these, OTPs are logged server-side and returned to staff only outside production).
  AT_USERNAME: process.env.AT_USERNAME || '',
  AT_API_KEY: process.env.AT_API_KEY || '',
  AT_SENDER_ID: process.env.AT_SENDER_ID || '',
  // CORS configuration
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '',
};
