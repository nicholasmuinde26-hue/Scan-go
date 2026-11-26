import AsyncStorage from '@react-native-async-storage/async-storage';

// Personal shopping list — device-local (AsyncStorage), independent of the
// scanned basket. Items check themselves off when their product is scanned.
export type ShoppingListItem = {
  id: string;
  name: string;
  productId?: string;
  checked: boolean;
  createdAt: number;
};

const KEY = 'shopping_list_v1';

type Listener = (items: ShoppingListItem[]) => void;
const listeners = new Set<Listener>();
let cache: ShoppingListItem[] | null = null;

async function load(): Promise<ShoppingListItem[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : [];
  } catch {
    cache = [];
  }
  return cache!;
}

async function persist(items: ShoppingListItem[]): Promise<ShoppingListItem[]> {
  cache = items;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
  listeners.forEach((fn) => fn(items));
  return items;
}

export const shoppingList = {
  subscribe: (fn: Listener) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  all: load,
  add: async (name: string, productId?: string): Promise<ShoppingListItem[]> => {
    const items = await load();
    const trimmed = name.trim();
    if (!trimmed) return items;
    // Dedupe: same product or same name (case-insensitive) bumps nothing — just skip.
    const exists = items.some(
      (i) => (productId && i.productId === productId) || i.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) return items;
    return persist([
      ...items,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: trimmed, productId, checked: false, createdAt: Date.now() },
    ]);
  },
  toggle: async (id: string): Promise<ShoppingListItem[]> => {
    const items = await load();
    return persist(items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)));
  },
  remove: async (id: string): Promise<ShoppingListItem[]> => {
    const items = await load();
    return persist(items.filter((i) => i.id !== id));
  },
  clearChecked: async (): Promise<ShoppingListItem[]> => {
    const items = await load();
    return persist(items.filter((i) => !i.checked));
  },
  clearAll: async (): Promise<ShoppingListItem[]> => persist([]),
  // Called after a successful basket scan — ticks off matching list items.
  markScanned: async (productId?: string, name?: string): Promise<ShoppingListItem[]> => {
    const items = await load();
    const pending = items.filter((i) => !i.checked);
    if (!pending.length) return items;
    const nameLower = (name || '').toLowerCase();
    const changed = items.map((i) => {
      if (i.checked) return i;
      const match = (productId && i.productId === productId) || (nameLower && i.name.toLowerCase() === nameLower);
      return match ? { ...i, checked: true } : i;
    });
    if (changed.every((i, idx) => i === items[idx])) return items;
    return persist(changed);
  },
};
