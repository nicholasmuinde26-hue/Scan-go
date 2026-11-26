import { config } from '../../core/config';
import { guestRequest, guestStore, type GuestSession } from './store';

export interface GuestBasketLine {
  productId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  barcode?: string;
  labelBarcode?: string;
  isWeighted?: boolean;
  weightGrams?: number;
}

export interface GuestBasket {
  _id: string;
  storeId: string;
  status: string;
  items: GuestBasketLine[];
  totalItems: number;
  totalMinor: number;
}

export interface GuestSessionInfo {
  id: string;
  storeId: string;
  storeName: string;
  trustTier: number;
  presenceMethod: string;
  expiresAt: string;
}

/** Redeem a pass token (sgp_…) — provisions the shadow guest user + session. */
export async function redeemPass(token: string, deviceId = 'MOBILE'): Promise<{ passId: string; session: GuestSessionInfo }> {
  const response = await fetch(`${config.apiUrl}/guest/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client': 'mobile' },
    body: JSON.stringify({ token: token.trim(), deviceId }),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'This guest pass could not be redeemed.');
  }
  await guestStore.save({
    token: token.trim(),
    passId: data.passId,
    storeId: String(data.session.storeId),
    storeName: data.session.storeName,
  });
  return { passId: data.passId, session: data.session };
}

export const guestApi = {
  session: () =>
    guestRequest<{ success: true; session: GuestSessionInfo | null; enforced: boolean; store?: { _id: string; name: string } }>('/guest/session'),

  currentBasket: () => guestRequest<{ success: true; basket: GuestBasket | null }>('/guest/baskets/current'),

  openBasket: (storeId: string) =>
    guestRequest<{ success: true; basket: GuestBasket }>('/guest/baskets', {
      method: 'POST',
      body: JSON.stringify({ storeId, deviceId: 'MOBILE' }),
    }),

  scan: (basketId: string, barcode: string, quantity = 1) =>
    guestRequest<{ success: true; scannedProduct?: any; basket: GuestBasket }>(`/guest/baskets/${basketId}/scan`, {
      method: 'POST',
      body: JSON.stringify({ barcode, quantity }),
    }),

  setQuantity: (basketId: string, productId: string, quantity: number) =>
    guestRequest<{ success: true; basket: GuestBasket }>(`/guest/baskets/${basketId}/items/${productId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity }),
    }),

  clear: (basketId: string) =>
    guestRequest<{ success: true; basket: GuestBasket }>(`/guest/baskets/${basketId}/clear`, { method: 'DELETE' }),

  leave: async () => {
    await guestStore.clear();
  },
};
