import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CartLine } from './types';

type CartState = {
  storeId: string | null;
  lines: CartLine[];
  setStoreId: (storeId: string) => void;
  add: (line: CartLine, storeId?: string) => void;
  remove: (productId: string) => void;
  clear: () => void;
  clearForStoreChange: (newStoreId: string) => void;
};

export const useCollectCart = create<CartState>()(
  persist(
    (set, get) => ({
      storeId: null,
      lines: [],
      setStoreId: (storeId: string) => {
        const current = get().storeId;
        if (current && current !== storeId) {
          // Store switched, completely reset cart
          set({ storeId, lines: [] });
        } else {
          set({ storeId });
        }
      },
      add: (line: CartLine, storeId?: string) => {
        const currentStoreId = get().storeId;
        // If adding to a different store than currently in cart, reset cart for new store
        if (storeId && currentStoreId && currentStoreId !== storeId) {
          set({ storeId, lines: [line] });
          return;
        }

        const found = get().lines.find((x) => x.productId === line.productId);
        set({
          storeId: storeId || currentStoreId,
          lines: found
            ? get().lines.map((x) =>
                x.productId === line.productId
                  ? { ...x, quantity: x.quantity + line.quantity }
                  : x
              )
            : [...get().lines, line],
        });
      },
      remove: (productId: string) =>
        set({ lines: get().lines.filter((x) => x.productId !== productId) }),
      clear: () => set({ lines: [] }),
      clearForStoreChange: (newStoreId: string) =>
        set({ storeId: newStoreId, lines: [] }),
    }),
    {
      name: 'collect-cart',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
