import { Product } from '../types.js';

const DB_NAME = 'ScanAndGo_OfflineDB';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openOfflineDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;

      // 1. Cached Product Catalogue per store
      if (!db.objectStoreNames.contains('products')) {
        const prodStore = db.createObjectStore('products', { keyPath: 'barcode' });
        prodStore.createIndex('storeId', 'storeId', { unique: false });
      }

      // 2. Offline queued scans
      if (!db.objectStoreNames.contains('offlineScanQueue')) {
        db.createObjectStore('offlineScanQueue', { keyPath: 'id', autoIncrement: true });
      }

      // 3. Offline valid signed receipts cache (for exit staff offline validation)
      if (!db.objectStoreNames.contains('offlineReceipts')) {
        db.createObjectStore('offlineReceipts', { keyPath: 'receiptToken' });
      }
    };

    request.onsuccess = (event: any) => {
      resolve(event.target.result);
    };

    request.onerror = (event: any) => {
      reject(event.target.error);
    };
  });

  return dbPromise;
}

// --- Product Catalogue Caching ---
export async function cacheProductsLocally(products: Product[]): Promise<void> {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('products', 'readwrite');
    const store = tx.objectStore('products');

    for (const prod of products) {
      store.put(prod);
    }

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('[Offline DB] Error caching products:', err);
  }
}

export async function findProductLocally(barcode: string): Promise<Product | null> {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('products', 'readonly');
    const store = tx.objectStore('products');
    const request = store.get(barcode);

    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.error('[Offline DB] Error finding product:', err);
    return null;
  }
}

export async function getAllCachedProducts(): Promise<Product[]> {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('products', 'readonly');
    const store = tx.objectStore('products');
    const request = store.getAll();

    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

// --- Offline Scan Queue ---
export interface QueuedOfflineScan {
  id?: number;
  barcode: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  timestamp: number;
}

export async function queueOfflineScan(scan: Omit<QueuedOfflineScan, 'id'>): Promise<void> {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('offlineScanQueue', 'readwrite');
    const store = tx.objectStore('offlineScanQueue');
    store.add(scan);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('[Offline DB] Error queuing offline scan:', err);
  }
}

export async function getQueuedOfflineScans(): Promise<QueuedOfflineScan[]> {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('offlineScanQueue', 'readonly');
    const store = tx.objectStore('offlineScanQueue');
    const request = store.getAll();

    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function clearQueuedOfflineScans(): Promise<void> {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('offlineScanQueue', 'readwrite');
    const store = tx.objectStore('offlineScanQueue');
    store.clear();

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('[Offline DB] Error clearing offline scan queue:', err);
  }
}

// --- Exit Staff Offline Receipts Cache ---
export interface CachedOfflineReceipt {
  receiptToken: string;
  orderNumber: string;
  totalMinor: number;
  totalItems: number;
  customerName?: string;
  clearedOffline?: boolean;
  clearedAt?: string;
}

export async function cacheReceiptLocally(receipt: CachedOfflineReceipt): Promise<void> {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('offlineReceipts', 'readwrite');
    const store = tx.objectStore('offlineReceipts');
    store.put(receipt);

    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('[Offline DB] Error caching offline receipt:', err);
  }
}

export async function findReceiptLocally(receiptToken: string): Promise<CachedOfflineReceipt | null> {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('offlineReceipts', 'readonly');
    const store = tx.objectStore('offlineReceipts');
    const request = store.get(receiptToken);

    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function getAllCachedReceipts(): Promise<CachedOfflineReceipt[]> {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('offlineReceipts', 'readonly');
    const store = tx.objectStore('offlineReceipts');
    const request = store.getAll();

    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}
