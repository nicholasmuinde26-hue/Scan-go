import User from '../users/user.model.js';

const messages: Record<string, { title: string; body: (payload: any) => string }> = {
  'substitution.requested': { title: 'Replacement needs your approval', body: p => `${p.originalName} is unavailable. Review the suggested replacement for order ${p.orderNumber}.` },
  'order.paid': { title: 'Payment confirmed', body: p => `Payment for order ${p.orderNumber} was confirmed.` },
  'order.ready': { title: 'Your order is ready', body: p => `Order ${p.orderNumber || ''} is ready for pickup.` },
  'order.collected': { title: 'Order collected', body: p => `Order ${p.orderNumber || ''} has been collected.` },
};

export async function sendCustomerPush(userId: string, eventType: string, payload: any) {
  const template = messages[eventType];
  if (!template) return;
  const user = await User.findById(userId).select('deviceTokens');
  const tokens = (user?.deviceTokens || []).filter(Boolean);
  if (!tokens.length) return;
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(tokens.map(to => ({ to, sound: 'default', title: template.title, body: template.body(payload), data: { type: eventType, ...payload } }))),
  });
  if (!response.ok) console.warn(`[Push] Expo delivery request returned ${response.status}`);
}
