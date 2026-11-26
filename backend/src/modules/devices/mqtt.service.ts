import mqtt, { MqttClient } from 'mqtt';
import crypto from 'crypto';
import { ENV } from '../../config/environment.js';
import RetailDevice from './device.model.js';
import { findActiveDevice, ingestDeviceEvent } from './device-event.service.js';

/**
 * MQTT transport for the device gateway. Devices publish to
 *   retail/{storeSlug}/devices/{deviceId}/events
 * and the gateway publishes the outcome to
 *   retail/{storeSlug}/devices/{deviceId}/events/{eventId}/result  (QoS 1)
 * so a device gets its ack even on a flaky link.
 *
 * Authentication is identical to HTTPS: the payload may carry `deviceKey`
 * which is verified against the device's stored credential hash before the
 * event is applied. The topic deviceId must match a registered device.
 *
 * Disabled unless MQTT_URL is set — HTTPS ingestion is unaffected.
 */

const EVENT_TOPIC = 'retail/+/devices/+/events';

let client: MqttClient | null = null;
let started = false;

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function verifyDeviceKey(device: any, key: unknown): Promise<boolean> {
  if (!key || typeof key !== 'string') return false;
  const fresh = await RetailDevice.findById(device._id).select('+credentialHash');
  if (!fresh) return false;
  const provided = Buffer.from(hashKey(key), 'hex');
  const stored = Buffer.from(fresh.credentialHash, 'hex');
  return provided.length === stored.length && crypto.timingSafeEqual(provided, stored);
}

async function handleMessage(topic: string, raw: Buffer) {
  const parts = topic.split('/');
  // retail/{store}/devices/{deviceId}/events
  const deviceId = parts[3];
  if (!deviceId) return;

  let message: any;
  try {
    message = JSON.parse(raw.toString('utf8'));
  } catch {
    return; // malformed payload — nothing to ack against anyway
  }

  const device = await findActiveDevice(deviceId);
  if (!device) return;

  // Credential check: MQTT has no headers, so the device secret travels in
  // the payload (`deviceKey`) or the password used at CONNECT (per-device
  // usernames are a deployment option; payload key is the baseline).
  if (!(await verifyDeviceKey(device, message?.deviceKey))) {
    const storeSlug = parts[1] || 'unknown';
    client?.publish(`retail/${storeSlug}/devices/${deviceId}/events/${message?.eventId || 'unknown'}/result`, JSON.stringify({
      success: false,
      error: 'Invalid device credential.',
      code: 'DEVICE_AUTH_FAILED',
    }), { qos: 1 });
    return;
  }

  try {
    const { httpStatus, body } = await ingestDeviceEvent(device, message || {});
    const storeSlug = parts[1] || 'unknown';
    const resultTopic = `retail/${storeSlug}/devices/${deviceId}/events/${message?.eventId || 'unknown'}/result`;
    client?.publish(resultTopic, JSON.stringify({ httpStatus, ...body }), { qos: 1 });
  } catch (error: any) {
    console.error(`[mqtt] failed to ingest event for ${deviceId}:`, error?.message);
  }
}

export function startMqttGateway(): void {
  if (started || !ENV.MQTT_URL) return;
  started = true;

  client = mqtt.connect(ENV.MQTT_URL, {
    username: ENV.MQTT_USERNAME || undefined,
    password: ENV.MQTT_PASSWORD || undefined,
    clientId: `scan-go-gateway-${process.pid}`,
    reconnectPeriod: 5000,
    clean: true,
  });

  client.on('connect', () => {
    console.log(`[mqtt] connected to ${ENV.MQTT_URL}`);
    client?.subscribe(EVENT_TOPIC, { qos: 1 }, (err) => {
      if (err) console.error('[mqtt] subscribe failed:', err.message);
      else console.log(`[mqtt] subscribed to ${EVENT_TOPIC}`);
    });
  });

  client.on('message', (topic, payload) => {
    void handleMessage(topic, payload).catch((error) =>
      console.error('[mqtt] message handling failed:', error?.message)
    );
  });

  client.on('error', (error) => console.error('[mqtt] connection error:', error.message));
  client.on('reconnect', () => console.log('[mqtt] reconnecting...'));
  client.on('offline', () => console.log('[mqtt] offline'));
}

export function stopMqttGateway(): void {
  client?.end(true);
  client = null;
  started = false;
}
