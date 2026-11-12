import { ENV } from '../../config/environment.js';

/**
 * Sends an SMS through Africa's Talking when AT_USERNAME / AT_API_KEY are set.
 * Returns true when the provider accepted the message. Never throws: callers decide what a failed send means.
 */
export async function sendSms(phone: string, message: string): Promise<boolean> {
  if (!ENV.AT_USERNAME || !ENV.AT_API_KEY) {
    console.warn(`[SMS not configured] would send to ${phone}: ${message}`);
    return false;
  }
  try {
    const host = ENV.AT_USERNAME === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
    const body = new URLSearchParams({ username: ENV.AT_USERNAME, to: phone.startsWith('+') ? phone : `+${phone}`, message });
    if (ENV.AT_SENDER_ID) body.set('from', ENV.AT_SENDER_ID);
    const res = await fetch(`https://${host}/version1/messaging`, {
      method: 'POST',
      headers: { apiKey: ENV.AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    return res.ok;
  } catch (err: any) {
    console.error('[SMS] send failed:', err.message);
    return false;
  }
}
