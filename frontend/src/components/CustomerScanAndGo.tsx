import React, { useState, useEffect, useRef } from 'react';
import {
  Scan,
  Plus,
  Minus,
  Trash2,
  AlertTriangle,
  Smartphone,
  CheckCircle2,
  Lock,
  ArrowRight,
  ShieldCheck,
  ShoppingBag,
  Info,
  Wifi,
  WifiOff,
  RotateCw,
  RefreshCw,
  Timer,
  Shield,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Product, Store, Basket } from '../types.js';
import { apiRequest, formatKes } from '../api.js';
import {
  cacheProductsLocally,
  findProductLocally,
  queueOfflineScan,
  getQueuedOfflineScans,
  clearQueuedOfflineScans,
  QueuedOfflineScan,
} from '../offline/offlineStorage.js';

interface CustomerScanAndGoProps {
  currentStore: Store;
  products: Product[];
  onOrderPaid?: (order: any) => void;
  onOpenClickAndCollect?: () => void;
}

export const CustomerScanAndGo: React.FC<CustomerScanAndGoProps> = ({
  currentStore,
  products,
  onOrderPaid,
  onOpenClickAndCollect,
}) => {
  const [basket, setBasket] = useState<Basket | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Offline status & scan queue
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queuedScansCount, setQueuedScansCount] = useState(0);

  // Checkout & Payment State
  const [checkoutOrder, setCheckoutOrder] = useState<any | null>(null);
  const [paymentPhone, setPaymentPhone] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paidReceipt, setPaidReceipt] = useState<{ token: string; order: any } | null>(null);

  // Rotating Dynamic QR Code State
  const [dynamicQrToken, setDynamicQrToken] = useState<string>('');
  const [rotatingSeconds, setRotatingSeconds] = useState<number>(30);
  const rotatingTimerRef = useRef<any>(null);

  // Monitor Network Connectivity & Cache Products
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      handleSyncQueuedScans();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setMessage({
        type: 'warning',
        text: 'Offline mode active (supermarket dead zone). Scans will be cached locally in IndexedDB.',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cache product catalog in IndexedDB for offline scanning
    if (products.length > 0) {
      cacheProductsLocally(products);
    }

    // Check existing queued scans
    getQueuedOfflineScans().then((scans) => setQueuedScansCount(scans.length));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [products]);

  // Synchronize queued offline scans when back online
  const handleSyncQueuedScans = async () => {
    try {
      const scans = await getQueuedOfflineScans();
      if (scans.length === 0 || !basket) return;

      setLoading(true);
      let synced = 0;
      for (const scan of scans) {
        try {
          await apiRequest(`/baskets/${basket._id}/scan`, {
            method: 'POST',
            body: JSON.stringify({ barcode: scan.barcode, isManualEntry: false, quantity: scan.quantity }),
          });
          synced++;
        } catch (e) {
          console.error('Failed to sync scan:', e);
        }
      }

      await clearQueuedOfflineScans();
      setQueuedScansCount(0);

      // Refresh authoritative basket from server
      const updated = await apiRequest(`/baskets/${basket._id}`);
      if (updated?.basket) setBasket(updated.basket);

      setMessage({
        type: 'success',
        text: `Back online! Successfully synchronized ${synced} queued scan(s) with server.`,
      });
    } catch (err: any) {
      console.error('Sync error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Rotating QR code periodic update
  useEffect(() => {
    if (!paidReceipt?.order?._id) return;

    async function fetchRotatingQr() {
      try {
        const res = await apiRequest(`/orders/${paidReceipt!.order._id}/rotating-qr`);
        if (res?.dynamicQrToken) {
          setDynamicQrToken(res.dynamicQrToken);
          setRotatingSeconds(res.secondsRemaining || 30);
        }
      } catch (err) {
        // Fallback to static base token if request fails
        if (paidReceipt) setDynamicQrToken(paidReceipt.token);
      }
    }

    fetchRotatingQr();

    // 1-second countdown interval
    const countdown = setInterval(() => {
      setRotatingSeconds((prev) => {
        if (prev <= 1) {
          fetchRotatingQr();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdown);
  }, [paidReceipt]);

  // Fetch or create customer basket
  useEffect(() => {
    async function initBasket() {
      try {
        setLoading(true);
        const res = await apiRequest('/baskets', {
          method: 'POST',
          body: JSON.stringify({ storeId: currentStore._id }),
        });
        setBasket(res.basket);
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    if (currentStore?._id) {
      initBasket();
    }
  }, [currentStore?._id]);

  // Scan or manual entry (Handles both Online & Offline Mode)
  const handleScanBarcode = async (barcodeToScan: string, isManual = false) => {
    if (!basket) return;

    // OFFLINE MODE: Resolve product from IndexedDB and queue locally
    if (!navigator.onLine) {
      try {
        const localProduct = await findProductLocally(barcodeToScan);
        if (!localProduct) {
          setMessage({
            type: 'error',
            text: `Offline Error: Barcode [${barcodeToScan}] not found in local cached catalog.`,
          });
          return;
        }
        if (localProduct.soldBy === 'weight' || localProduct.requiresSerializedTag) {
          setMessage({ type: 'warning', text: 'Weighed produce labels and serialized high-value tags require an online verification.' });
          return;
        }

        await queueOfflineScan({
          barcode: barcodeToScan,
          name: localProduct.name,
          quantity: 1,
          unitPriceMinor: localProduct.priceMinor,
          timestamp: Date.now(),
        });

        const updatedCount = (await getQueuedOfflineScans()).length;
        setQueuedScansCount(updatedCount);

        // Optimistically update local basket UI
        setBasket((prev: any) => {
          if (!prev) return prev;
          const items = [...(prev.items || [])];
          const existing = items.find((i: any) => i.barcode === barcodeToScan);
          if (existing) {
            existing.quantity += 1;
            existing.lineTotalMinor += localProduct.priceMinor;
          } else {
            items.push({
              productId: localProduct._id,
              barcode: localProduct.barcode,
              name: localProduct.name,
              quantity: 1,
              unitPriceMinor: localProduct.priceMinor,
              lineTotalMinor: localProduct.priceMinor,
            });
          }
          return {
            ...prev,
            items,
            totalItems: (prev.totalItems || 0) + 1,
            estimatedTotalMinor: (prev.estimatedTotalMinor || 0) + localProduct.priceMinor,
          };
        });

        setMessage({
          type: 'warning',
          text: `Offline Scan Queued: ${localProduct.name} (${formatKes(localProduct.priceMinor)}). Will sync when signal returns.`,
        });
        setBarcodeInput('');
        return;
      } catch (err: any) {
        setMessage({ type: 'error', text: err.message });
        return;
      }
    }

    // ONLINE MODE: Authoritative server scan
    try {
      setMessage(null);
      setLoading(true);
      let res: any;
      try {
        res = await apiRequest(`/baskets/${basket._id}/scan`, {
          method: 'POST',
          body: JSON.stringify({ barcode: barcodeToScan, isManualEntry: isManual, quantity: 1 }),
        });
      } catch (error: any) {
        if (error?.data?.code !== 'TAG_REQUIRED') throw error;
        const tagSerial = window.prompt(`Scan or enter the security tag serial for ${error.data.productName}:`)?.trim();
        if (!tagSerial) return;
        res = await apiRequest(`/baskets/${basket._id}/scan`, {
          method: 'POST',
          body: JSON.stringify({ barcode: barcodeToScan, isManualEntry: isManual, quantity: 1, tagSerial }),
        });
      }
      setBasket(res.basket);
      setMessage({
        type: 'success',
        text: `Scanned: ${res.scannedProduct.name} (${formatKes(res.scannedProduct.priceMinor)})`,
      });
      setBarcodeInput('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
      const updated = await apiRequest(`/baskets/${basket._id}`);
      if (updated?.basket) setBasket(updated.basket);
    } finally {
      setLoading(false);
    }
  };

  // Adjust item quantity
  const handleUpdateQuantity = async (productId: string, newQty: number, verification?: { labelBarcode?: string; tagSerial?: string }) => {
    if (!basket) return;
    try {
      setLoading(true);
      const res = await apiRequest(`/baskets/${basket._id}/items/${productId}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: newQty, ...verification }),
      });
      setBasket(res.basket);
      if (newQty === 0) {
        setMessage({ type: 'warning', text: 'Item removed from digital basket (Event logged for exit audit)' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Checkout Basket -> Immutable Order
  const handleCheckout = async () => {
    if (!basket || basket.items.length === 0) return;
    try {
      setPaymentLoading(true);
      const res = await apiRequest('/orders/checkout-basket', {
        method: 'POST',
        body: JSON.stringify({ basketId: basket._id }),
      });
      setCheckoutOrder(res.order);
      setMessage({ type: 'success', text: `Order snapshot created: ${res.order.orderNumber}` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setPaymentLoading(false);
    }
  };

  // Start a real STK push; paid state comes only from the server's provider callback.
  const handleMpesaPay = async () => {
    if (!checkoutOrder) return;
    try {
      setPaymentLoading(true);
      const started = await apiRequest('/payments/mpesa/stk-push', {
        method: 'POST',
        body: JSON.stringify({ orderId: checkoutOrder._id, phone: paymentPhone }),
      });
      setMessage({ type: 'warning', text: 'M-Pesa prompt sent. Waiting for provider confirmation…' });
      let paidOrder: any = null;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const status = await apiRequest(`/payments/${started.paymentId}/status`);
        if (status.status === 'SUCCESS') { paidOrder = await apiRequest(`/orders/${checkoutOrder._id}`); break; }
        if (['FAILED', 'TIMED_OUT', 'HELD'].includes(status.status)) throw new Error(status.status === 'HELD' ? 'Payment is held for review. Contact support.' : 'Payment was not completed. You can retry.');
      }
      if (!paidOrder) throw new Error('Payment confirmation is taking longer than expected. Check Orders before retrying.');
      const order = paidOrder.order || paidOrder;
      setPaidReceipt({ token: order.collectionQrToken || '', order });
      if (onOrderPaid) onOrderPaid(order);

      // Reset local basket state
      const newBasket = await apiRequest('/baskets', {
        method: 'POST',
        body: JSON.stringify({ storeId: currentStore._id }),
      });
      setBasket(newBasket.basket);
      setCheckoutOrder(null);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setPaymentLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-brand-900/60 to-navy-700 border border-brand-500/30 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-brand-500/20 text-brand-400 rounded-lg">
                <Scan className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-white">In-Store Scan & Go Terminal</h2>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Scan items with your camera or barcode scanner as you walk through {currentStore.name}. Server calculates authoritative pricing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                isOnline
                  ? 'bg-brand-950/60 border-brand-500/40 text-brand-300'
                  : 'bg-amber-950/60 border-amber-500/40 text-amber-300 animate-pulse'
              }`}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>{isOnline ? 'Online (Server Active)' : 'Offline (IndexedDB Cache)'}</span>
            </div>

            {queuedScansCount > 0 && (
              <button
                onClick={handleSyncQueuedScans}
                disabled={!isOnline || loading}
                className="flex items-center space-x-1 bg-azure-600 hover:bg-azure-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-xl font-bold shadow transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Sync {queuedScansCount} Queued Scan(s)</span>
              </button>
            )}

            <div className="flex items-center space-x-3 text-xs bg-navy-800/70 px-4 py-2 rounded-xl border border-slate-700">
              <div>
                <span className="text-slate-400 block text-[10px]">Current Store</span>
                <span className="font-semibold text-brand-400">{currentStore.name}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alert / Notification */}
      {message && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium animate-fadeIn ${
            message.type === 'success'
              ? 'bg-brand-950/40 border-brand-500/40 text-brand-300'
              : message.type === 'warning'
              ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-brand-400 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white ml-2">
            ×
          </button>
        </div>
      )}

      {/* Main Grid: Barcode Scanner & Digital Cart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Barcode Scanner & Simulator (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Barcode Input Card */}
          <div className="bg-navy-700/80 border border-slate-700/80 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold text-sm text-white flex items-center space-x-2">
              <Scan className="w-4 h-4 text-brand-400" />
              <span>Barcode Scanner / Manual Input</span>
            </h3>

            {/* Manual Barcode Input */}
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="Enter or scan barcode..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && barcodeInput) {
                    handleScanBarcode(barcodeInput, true);
                  }
                }}
                className="flex-1 bg-navy-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500"
              />
              <button
                disabled={!barcodeInput || loading}
                onClick={() => handleScanBarcode(barcodeInput, true)}
                className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-semibold transition"
              >
                Scan
              </button>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center space-x-1">
              <Info className="w-3.5 h-3.5 text-slate-500 inline" />
              <span>Manual barcode typing is tracked server-side as an anti-fraud risk indicator.</span>
            </p>

            {/* Quick-Scan Product Simulator Buttons */}
            {import.meta.env.DEV && <div className="pt-2 border-t border-slate-700/60">
              <span className="text-xs font-semibold text-slate-400 block mb-2.5">
                Simulate Product Shelf Scans:
              </span>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                {products.slice(0, 8).map((prod) => (
                  <button
                    key={prod._id}
                    onClick={() => handleScanBarcode(prod.barcode, false)}
                    className="flex flex-col text-left p-2.5 bg-navy-800/60 hover:bg-slate-700/60 border border-slate-700/80 rounded-xl transition group"
                  >
                    <span className="font-medium text-xs text-white group-hover:text-brand-400 line-clamp-1">
                      {prod.name}
                    </span>
                    <div className="flex items-center justify-between mt-1 text-[11px]">
                      <span className="text-brand-400 font-bold">{formatKes(prod.priceMinor)}</span>
                      {prod.highTheft && (
                        <span className="bg-rose-500/20 text-rose-300 px-1 rounded text-[9px]">High Theft</span>
                      )}
                    </div>
                  </button>
                ))}

                {/* Deliberate Unknown Barcode Simulator */}
                <button
                  onClick={() => handleScanBarcode('999999000111', false)}
                  className="col-span-2 p-2 bg-rose-950/30 hover:bg-rose-900/40 border border-rose-500/40 rounded-xl text-xs text-rose-300 font-medium transition text-center"
                >
                  ⚠️ Simulate Scanning Fake / Unknown Barcode (Fraud Trigger)
                </button>
              </div>
            </div>}
          </div>

          {/* Anti-fraud Behavioral Telemetry Card */}
          <div className="bg-navy-700/80 border border-slate-700/80 rounded-2xl p-4 text-xs space-y-2">
            <h4 className="font-semibold text-slate-300 flex items-center space-x-1.5">
              <ShieldCheck className="w-4 h-4 text-brand-400" />
              <span>Real-Time Audit Telemetry</span>
            </h4>
            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="bg-navy-800/60 p-2 rounded-lg border border-slate-700">
                <span className="text-slate-400 block text-[10px]">Manual Entries</span>
                <span className={`text-sm font-bold ${basket?.manualEntryCount ? 'text-amber-400' : 'text-slate-200'}`}>
                  {basket?.manualEntryCount || 0}
                </span>
              </div>
              <div className="bg-navy-800/60 p-2 rounded-lg border border-slate-700">
                <span className="text-slate-400 block text-[10px]">Cart Removals</span>
                <span className={`text-sm font-bold ${basket?.removalCount ? 'text-amber-400' : 'text-slate-200'}`}>
                  {basket?.removalCount || 0}
                </span>
              </div>
              <div className="bg-navy-800/60 p-2 rounded-lg border border-slate-700">
                <span className="text-slate-400 block text-[10px]">Unlisted Scans</span>
                <span className={`text-sm font-bold ${basket?.unknownBarcodeCount ? 'text-rose-400' : 'text-slate-200'}`}>
                  {basket?.unknownBarcodeCount || 0}
                </span>
              </div>
            </div>
            {basket?.basketHash && (
              <div className="pt-2 text-[10px] text-slate-500 font-mono truncate">
                Basket Hash: {basket.basketHash}
              </div>
            )}
          </div>
        </div>

        {/* Right: Authoritative Digital Basket & Checkout (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-navy-700/80 border border-slate-700/80 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
              <div className="flex items-center space-x-2">
                <ShoppingBag className="w-5 h-5 text-brand-400" />
                <h3 className="font-bold text-white text-base">Digital Shopping Cart</h3>
                <span className="bg-brand-500/20 text-brand-400 text-xs px-2 py-0.5 rounded-full font-bold">
                  {basket?.totalItems || 0} items
                </span>
              </div>
              <span className="text-xs text-slate-400">Server-Authoritative</span>
            </div>

            {/* Cart Items List */}
            {basket?.items && basket.items.length > 0 ? (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {basket.items.map((item) => (
                  <div
                    key={`${item.productId}:${item.labelBarcode || item.tagSerial || 'unit'}`}
                    className="flex items-center justify-between p-3 bg-navy-800/60 border border-slate-700/70 rounded-xl"
                  >
                    <div className="flex-1 pr-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-sm text-white">{item.name}</span>
                        {item.highTheft && (
                          <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[9px] px-1.5 py-0.2 rounded font-semibold">
                            High-Risk
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1">
                        <span className="font-mono text-[11px] text-slate-500">{item.barcode}</span>
                        <span>•</span>
                        <span>{formatKes(item.unitPriceMinor)} {item.labelBarcode ? 'label total' : 'each'}</span>
                        {item.weightGrams && <span>• {item.weightGrams}g</span>}
                        {item.labelBarcode && <span>• Scale {item.scaleId}</span>}
                        {item.tagSerial && <span>• Tag {item.tagSerial}</span>}
                      </div>
                    </div>

                    {/* Quantity Controls */}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleUpdateQuantity(item.productId, item.quantity - 1, { labelBarcode: item.labelBarcode, tagSerial: item.tagSerial })}
                        className="p-1 rounded-lg bg-navy-700 hover:bg-slate-700 text-slate-300"
                        title="Reduce quantity or remove"
                      >
                        {item.quantity === 1 ? <Trash2 className="w-3.5 h-3.5 text-rose-400" /> : <Minus className="w-3.5 h-3.5" />}
                      </button>
                      <span className="font-bold text-sm text-white px-1 min-w-[20px] text-center">
                        {item.quantity}
                      </span>
                      {!item.labelBarcode && !item.tagSerial && <button
                        onClick={() => handleUpdateQuantity(item.productId, item.quantity + 1)}
                        className="p-1 rounded-lg bg-navy-700 hover:bg-slate-700 text-slate-300"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>}

                      <div className="text-right min-w-[80px] pl-2 font-bold text-sm text-brand-400">
                        {formatKes(item.unitPriceMinor * item.quantity)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 space-y-2">
                <ShoppingBag className="w-10 h-10 mx-auto text-slate-600 stroke-1" />
                <p className="text-sm">Your digital cart is empty.</p>
                <p className="text-xs text-slate-400">Scan barcodes from supermarket shelves above to begin!</p>
              </div>
            )}

            {/* Totals & Checkout Panel */}
            {basket && basket.items.length > 0 && (
              <div className="pt-4 border-t border-slate-700 space-y-3">
                <div className="flex justify-between items-center text-sm text-slate-300">
                  <span>Subtotal ({basket.totalItems} items)</span>
                  <span>{formatKes(basket.totalMinor)}</span>
                </div>
                {basket.expectedWeightGrams > 0 && (
                  <div className="flex justify-between items-center text-xs text-slate-400">
                    <span>Expected Scale Weight</span>
                    <span>{(basket.expectedWeightGrams / 1000).toFixed(2)} kg</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-base font-bold text-white pt-2 border-t border-slate-700/60">
                  <span>Total Payable</span>
                  <span className="text-xl text-brand-400">{formatKes(basket.totalMinor)}</span>
                </div>

                {/* Checkout Trigger */}
                <button
                  disabled={paymentLoading}
                  onClick={handleCheckout}
                  className="w-full mt-2 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-brand-600/30 flex items-center justify-center space-x-2 transition"
                >
                  <Lock className="w-4 h-4" />
                  <span>Freeze Cart & Checkout with M-PESA</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Checkout & M-PESA Payment Modal */}
      {checkoutOrder && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-navy-700 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-5">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-brand-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">M-PESA Express Checkout</h3>
                <p className="text-xs text-slate-400">Order: {checkoutOrder.orderNumber}</p>
              </div>
            </div>

            <div className="bg-navy-800/80 p-4 rounded-xl border border-slate-700/80 space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Items Locked</span>
                <span className="font-semibold text-white">{checkoutOrder.totalItems} items</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Total Server Amount</span>
                <span className="text-base font-bold text-brand-400">{formatKes(checkoutOrder.totalMinor)}</span>
              </div>
              <div className="pt-2 border-t border-navy-700 text-[11px] text-slate-500 font-mono truncate">
                Hash: {checkoutOrder.basketHash}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Safaricom M-PESA Number</label>
              <input
                type="text"
                value={paymentPhone}
                onChange={(e) => setPaymentPhone(e.target.value)}
                className="w-full bg-navy-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-500 font-mono"
              />
              <p className="text-[11px] text-slate-400">
                An STK Push prompt will be sent to the phone to enter M-PESA PIN.
              </p>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                onClick={() => setCheckoutOrder(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 py-2.5 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                disabled={paymentLoading}
                onClick={handleMpesaPay}
                className="flex-1 bg-brand-600 hover:bg-brand-500 text-white py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-lg shadow-brand-600/30"
              >
                {paymentLoading ? (
                  <span>Processing STK...</span>
                ) : (
                  <>
                    <span>Confirm & Pay</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signed Single-Use QR Receipt Modal */}
      {paidReceipt && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-navy-700 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4 text-center">
            <div className="w-12 h-12 bg-brand-500/20 border border-brand-500/40 rounded-full flex items-center justify-center mx-auto text-brand-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Payment Verified!</h3>
              <p className="text-xs text-slate-400">Single-Use Exit QR Receipt Issued</p>
            </div>

            {/* Dynamic Anti-Theft QR Code Container */}
            <div className="bg-white p-4 rounded-2xl inline-block mx-auto shadow-inner relative">
              <QRCodeSVG value={dynamicQrToken || paidReceipt.token} size={180} level="H" />
            </div>

            {/* Rotating Anti-Theft QR Countdown Bar */}
            <div className="bg-navy-800/90 p-3 rounded-xl border border-slate-700 text-xs space-y-2">
              <div className="flex justify-between items-center text-slate-300">
                <span className="flex items-center space-x-1.5 text-brand-400 font-bold">
                  <Shield className="w-4 h-4" />
                  <span>Dynamic Rotating QR Active</span>
                </span>
                <span className="flex items-center space-x-1 text-slate-400 font-mono text-[11px]">
                  <RotateCw className="w-3 h-3 text-azure-400 animate-spin" />
                  <span>Refreshes in {rotatingSeconds}s</span>
                </span>
              </div>
              <div className="w-full bg-navy-700 rounded-full h-1 overflow-hidden">
                <div
                  className="bg-brand-400 h-full transition-all duration-1000"
                  style={{ width: `${(rotatingSeconds / 30) * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 text-center">
                Rolling cryptographic token rotates every 30 seconds. Screenshots cannot be shared or reused.
              </p>
            </div>

            <div className="bg-navy-800/90 p-3 rounded-xl border border-slate-700 text-left text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Order Number:</span>
                <span className="font-mono font-semibold text-white">{paidReceipt.order.orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Paid Amount:</span>
                <span className="font-bold text-brand-400">{formatKes(paidReceipt.order.totalMinor)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Items:</span>
                <span className="text-white font-medium">{paidReceipt.order.totalItems} recorded</span>
              </div>
              <div className="flex justify-between text-[11px] text-amber-400 pt-1 border-t border-navy-700">
                <span>Security Token:</span>
                <span>Single-Use (HMAC-SHA256)</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              Present this QR code to the exit officer or automated exit lane gate to clear departure.
            </p>

            <button
              onClick={() => setPaidReceipt(null)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2.5 rounded-xl text-xs transition"
            >
              Done / Return to Shopping
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
