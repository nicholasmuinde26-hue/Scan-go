import { useCallback, useEffect, useMemo, useState } from 'react';
import { Product } from '../../types.js';

export interface CartLine {
  product: Product;
  quantity: number;
}

/** Cart that lives in the portal so it survives switching tabs, and resets when the store changes. */
export function useCart(storeId: string | undefined) {
  const [cart, setCart] = useState<CartLine[]>([]);

  useEffect(() => {
    setCart([]);
  }, [storeId]);

  // Returns false when the item cannot be added (out of stock / at the stock limit).
  const add = useCallback(
    (product: Product): boolean => {
      const existing = cart.find((l) => l.product._id === product._id);
      const nextQty = (existing?.quantity || 0) + 1;
      if (product.stock !== undefined && nextQty > product.stock) return false;
      setCart((prev) => {
        const found = prev.find((l) => l.product._id === product._id);
        return found
          ? prev.map((l) => (l.product._id === product._id ? { ...l, quantity: l.quantity + 1 } : l))
          : [...prev, { product, quantity: 1 }];
      });
      return true;
    },
    [cart]
  );

  const changeQty = useCallback((productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.product._id !== productId) return l;
          const next = l.quantity + delta;
          if (next > l.product.stock) return l;
          return { ...l, quantity: next };
        })
        .filter((l) => l.quantity > 0)
    );
  }, []);

  const clear = useCallback(() => setCart([]), []);

  const totals = useMemo(
    () => ({
      totalMinor: cart.reduce((s, l) => s + l.product.priceMinor * l.quantity, 0),
      totalItems: cart.reduce((s, l) => s + l.quantity, 0),
    }),
    [cart]
  );

  return { cart, add, changeQty, clear, ...totals };
}