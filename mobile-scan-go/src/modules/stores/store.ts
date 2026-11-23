import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Store } from './types';
import { activeBasket } from '../basket/store';
import { useCollectCart } from '../cart/store';
import { presenceSession } from '../presence/store';
import { queryClient } from '../../core/queryClient';

const KEY = 'selected_store';

type StoreListener = (store: Store | null) => void;
const listeners = new Set<StoreListener>();

export const currentStore = {
  get: async (): Promise<Store | null> => {
    const v = await AsyncStorage.getItem(KEY);
    return v ? JSON.parse(v) : null;
  },
  set: async (store: Store): Promise<void> => {
    await AsyncStorage.setItem(KEY, JSON.stringify(store));
    listeners.forEach((fn) => fn(store));
  },
  subscribe: (listener: StoreListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  switchStore: async (newStore: Store): Promise<void> => {
    // 1. Clear in-store basket entirely
    await activeBasket.clear();

    // 2. Clear shop & collect cart completely so nothing carries over
    useCollectCart.getState().clearForStoreChange(newStore._id);

    // 3. Clear store check-in presence session
    await presenceSession.clear();

    // 4. Invalidate and remove queries for catalog products, baskets, and store slots
    queryClient.removeQueries({ queryKey: ['products'] });
    queryClient.removeQueries({ queryKey: ['basket'] });
    queryClient.removeQueries({ queryKey: ['presence'] });
    queryClient.invalidateQueries({ queryKey: ['stores'] });

    // 5. Save the newly selected store and notify all components
    await AsyncStorage.setItem(KEY, JSON.stringify(newStore));
    listeners.forEach((fn) => fn(newStore));
  },
};
