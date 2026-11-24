import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Clock,
  MapPin,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Plus,
  Minus,
  Check,
  X,
  Lock,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Product, Store, Order } from '../types.js';
import { apiRequest, formatKes, getToken } from '../api.js';

interface CustomerClickAndCollectProps {
  currentStore: Store;
  products: Product[];
  onOrderCreated?: (order: Order) => void;
}

export const CustomerClickAndCollect: React.FC<CustomerClickAndCollectProps> = ({
  currentStore,
  products,
  onOrderCreated,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [cart, setCart] = useState<{ product: Product; quantity: number }[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [pickupDate, setPickupDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [substitutionsAllowed, setSubstitutionsAllowed] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add-on shopping state
  const [selectedParentOrder, setSelectedParentOrder] = useState<Order | null>(null);
  const [addonItems, setAddonItems] = useState<{ product: Product; quantity: number }[]>([]);

  // Categories list
  const categories = ['ALL', ...Array.from(new Set(products.map((p) => p.category)))];

  // Load customer orders
  const loadOrders = async () => {
    if (!getToken()) return;
    try {
      const res = await apiRequest('/orders?orderType=CLICK_AND_COLLECT');
      if (res?.orders) {
        setActiveOrders(res.orders);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadOrders();
    if (currentStore?.pickupSlots?.length > 0) {
      setSelectedSlot(currentStore.pickupSlots[0].slotId);
    }
  }, [currentStore]);

  // Cart operations
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product._id === product._id);
      if (existing) {
        return prev.map((item) =>
          item.product._id === product._id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateCartQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product._id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as { product: Product; quantity: number }[]
    );
  };

  const cartTotalMinor = cart.reduce((sum, item) => sum + item.product.priceMinor * item.quantity, 0);
  const cartTotalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Submit Pre-Order
  const handleSubmitOrder = async () => {
    if (cart.length === 0 || !selectedSlot) return;
    try {
      setLoading(true);
      const slotObj = currentStore.pickupSlots.find((s) => s.slotId === selectedSlot);

      const orderPayload = {
        storeId: currentStore._id,
        items: cart.map((i) => ({ productId: i.product._id, quantity: i.quantity })),
        pickupSlot: {
          slotId: selectedSlot,
          date: pickupDate,
          timeWindow: `${slotObj?.startTime} – ${slotObj?.endTime}`,
        },
        substitutionsAllowed,
      };

      const res = await apiRequest('/orders/click-and-collect', {
        method: 'POST',
        body: JSON.stringify(orderPayload),
      });

      setCart([]);
      setMessage({ type: 'success', text: `Pre-order ${res.order.orderNumber} created. Complete payment from your order before it is processed.` });
      await loadOrders();
      if (onOrderCreated) onOrderCreated(res.order);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Customer responds to picker substitution proposal
  const handleSubstitutionResponse = async (orderId: string, productId: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      setLoading(true);
      await apiRequest(`/orders/${orderId}/substitutions/${productId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      setMessage({ type: 'success', text: `Substitution ${decision.toLowerCase()} successfully.` });
      await loadOrders();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Submit Add-on Shopping Order
  const handleCreateAddon = async () => {
    if (!selectedParentOrder || addonItems.length === 0) return;
    try {
      setLoading(true);
      const res = await apiRequest(`/orders/${selectedParentOrder._id}/create-addon`, {
        method: 'POST',
        body: JSON.stringify({
          items: addonItems.map((i) => ({ productId: i.product._id, quantity: i.quantity })),
        }),
      });

      setAddonItems([]);
      setSelectedParentOrder(null);
      setMessage({ type: 'success', text: `Add-on order ${res.addonOrder.orderNumber} created. Complete payment from your order.` });
      await loadOrders();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts =
    selectedCategory === 'ALL'
      ? products
      : products.filter((p) => p.category === selectedCategory);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-brand-900/60 to-navy-700 border border-brand-500/30 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-brand-500/20 text-brand-400 rounded-lg">
                <ShoppingBag className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-white">Shop & Collect (Order Ahead, Collect Later)</h2>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Select products from home, pick a collection time slot, pay via M-PESA, and collect verified sealed groceries at {currentStore.name}.
            </p>
          </div>

          <div className="flex items-center space-x-2 bg-navy-800/80 px-4 py-2 rounded-xl border border-slate-700 text-xs">
            <MapPin className="w-4 h-4 text-brand-400" />
            <div>
              <span className="text-slate-400 block text-[10px]">Collection Branch</span>
              <span className="font-semibold text-white">{currentStore.name}</span>
            </div>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium ${
            message.type === 'success'
              ? 'bg-brand-950/40 border-brand-500/40 text-brand-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-white">
            ×
          </button>
        </div>
      )}

      {/* Main Content: Catalogue + Order/Cart Sidebars */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Product Catalogue (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Category Filter Chips */}
          <div className="flex space-x-2 overflow-x-auto pb-1 no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                    : 'bg-navy-700 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {filteredProducts.map((product) => {
              const inCart = cart.find((i) => i.product._id === product._id);
              return (
                <div
                  key={product._id}
                  className="bg-navy-700/80 border border-slate-700/80 rounded-2xl p-4 flex flex-col justify-between hover:border-slate-600 transition shadow-sm group"
                >
                  <div className="space-y-2">
                    <div className="h-32 rounded-xl bg-navy-800 overflow-hidden relative border border-slate-700/50">
                      {product.image ? (
                        <img
                          src={product.image}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                          <ShoppingBag className="w-8 h-8" />
                        </div>
                      )}
                      {product.highTheft && (
                        <span className="absolute top-2 right-2 bg-rose-500/80 backdrop-blur text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                          High-Risk Item
                        </span>
                      )}
                      {product.isWeighted && (
                        <span className="absolute top-2 left-2 bg-azure-500/80 backdrop-blur text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                          Scale Produce
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block">
                        {product.category}
                      </span>
                      <h4 className="font-semibold text-sm text-white line-clamp-1">{product.name}</h4>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{product.barcode}</p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-700/60 mt-3 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-400 block">Price</span>
                      <span className="text-sm font-bold text-brand-400">{formatKes(product.priceMinor)}</span>
                    </div>

                    {inCart ? (
                      <div className="flex items-center space-x-1.5 bg-navy-800 border border-slate-700 rounded-xl p-1">
                        <button
                          onClick={() => updateCartQty(product._id, -1)}
                          className="p-1 text-slate-300 hover:text-white rounded"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-bold px-1 text-white">{inCart.quantity}</span>
                        <button
                          onClick={() => updateCartQty(product._id, 1)}
                          className="p-1 text-slate-300 hover:text-white rounded"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(product)}
                        className="bg-brand-600 hover:bg-brand-500 text-white p-2 rounded-xl text-xs font-semibold flex items-center space-x-1 transition shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Cart, Pickup Slot & Active Orders (4 cols) */}
        <div className="lg:col-span-4 space-y-5">
          {/* Pre-Order Cart & Time Slot Config */}
          <div className="bg-navy-700/80 border border-slate-700/80 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
              <div className="flex items-center space-x-2">
                <ShoppingBag className="w-4 h-4 text-brand-400" />
                <h3 className="font-bold text-sm text-white">Pre-Order Cart</h3>
              </div>
              <span className="text-xs text-brand-400 font-bold">{cartTotalItems} items</span>
            </div>

            {/* Cart Items List */}
            {cart.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {cart.map((item) => (
                  <div key={item.product._id} className="flex justify-between items-center text-xs text-slate-200">
                    <span className="truncate max-w-[140px]">{item.product.name}</span>
                    <span className="text-slate-400 font-mono">x{item.quantity}</span>
                    <span className="font-semibold text-brand-400">
                      {formatKes(item.product.priceMinor * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-3 text-center">Add items from catalogue to pre-order.</p>
            )}

            {/* Pickup Date & Slot Configuration */}
            <div className="pt-3 border-t border-slate-700/80 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1 mb-1">
                  <Calendar className="w-3.5 h-3.5 text-brand-400" />
                  <span>Collection Date</span>
                </label>
                <input
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full bg-navy-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1 mb-1">
                  <Clock className="w-3.5 h-3.5 text-brand-400" />
                  <span>Pickup Time Slot</span>
                </label>
                <select
                  value={selectedSlot}
                  onChange={(e) => setSelectedSlot(e.target.value)}
                  className="w-full bg-navy-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
                >
                  {currentStore.pickupSlots?.map((slot) => (
                    <option key={slot.slotId} value={slot.slotId}>
                      {slot.startTime} – {slot.endTime} (Cap: {slot.capacity})
                    </option>
                  ))}
                </select>
              </div>

              {/* Substitution Policy Checkbox */}
              <div className="pt-1">
                <label className="flex items-start space-x-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={substitutionsAllowed}
                    onChange={(e) => setSubstitutionsAllowed(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-brand-600 focus:ring-brand-500 bg-navy-800"
                  />
                  <span>Allow approved substitutions if any item is out of stock</span>
                </label>
              </div>
            </div>

            {/* Total and Checkout */}
            {cart.length > 0 && (
              <div className="pt-3 border-t border-slate-700 space-y-3">
                <div className="flex justify-between items-center text-sm font-bold text-white">
                  <span>Total Payable:</span>
                  <span className="text-brand-400 text-base">{formatKes(cartTotalMinor)}</span>
                </div>
                <button
                  disabled={loading}
                  onClick={handleSubmitOrder}
                  className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center space-x-2 shadow-lg shadow-brand-600/30"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Submit & Pay with M-PESA</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Active Orders & Handover QR Cards */}
          <div className="bg-navy-700/80 border border-slate-700/80 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-white flex items-center space-x-2">
              <Clock className="w-4 h-4 text-brand-400" />
              <span>Active Orders & Pickup Passes</span>
            </h3>

            {activeOrders.length > 0 ? (
              <div className="space-y-4">
                {activeOrders.slice(0, 3).map((order) => {
                  const isReady = order.status === 'READY_FOR_PICKUP' || order.status === 'VERIFIED_AND_PACKED';
                  const isPicking = order.status === 'PICKING';
                  const isCollected = order.status === 'COLLECTED';
                  const isApprovalNeeded = order.status === 'AWAITING_CUSTOMER_APPROVAL';

                  return (
                    <div
                      key={order._id}
                      className="bg-navy-800/80 border border-slate-700 rounded-xl p-3.5 space-y-3"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="font-bold text-xs text-white">{order.orderNumber}</span>
                          <p className="text-[10px] text-slate-400">
                            {order.pickupSlot?.date} • {order.pickupSlot?.timeWindow}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            isReady
                              ? 'bg-brand-500/20 text-brand-400 border border-brand-500/40'
                              : isCollected
                              ? 'bg-slate-700 text-slate-300'
                              : isApprovalNeeded
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {/* Substitution Approval Alert */}
                      {isApprovalNeeded && (
                        <div className="p-2.5 bg-rose-950/40 border border-rose-500/40 rounded-lg space-y-2 text-xs">
                          <p className="text-rose-200 font-medium flex items-center space-x-1">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                            <span>Store picker requested a product substitution:</span>
                          </p>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleSubstitutionResponse(order._id, order.items[0].productId, 'APPROVED')}
                              className="flex-1 bg-brand-600 hover:bg-brand-500 text-white py-1 rounded text-[11px] font-bold flex items-center justify-center space-x-1"
                            >
                              <Check className="w-3 h-3" />
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() => handleSubstitutionResponse(order._id, order.items[0].productId, 'REJECTED')}
                              className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 py-1 rounded text-[11px] font-medium flex items-center justify-center space-x-1"
                            >
                              <X className="w-3 h-3" />
                              <span>Reject & Refund</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Ready for Pickup QR Code & 6-digit OTP Pass */}
                      {isReady && (
                        <div className="bg-navy-950/60 p-3 rounded-lg border border-brand-500/30 text-center space-y-2">
                          <div className="bg-white p-2 rounded-xl inline-block shadow">
                            <QRCodeSVG
                              value={order.collectionQrToken || order.orderNumber}
                              size={120}
                              level="M"
                            />
                          </div>
                          <div className="text-xs">
                            <span className="text-slate-400 block text-[10px]">Collection OTP / PIN</span>
                            <span className="text-lg font-mono font-bold tracking-widest text-brand-400">
                              {order.collectionCode || '482910'}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400">
                            Present this QR and OTP at the supermarket pickup counter to collect sealed goods.
                          </p>
                        </div>
                      )}

                      {/* Controlled Add-On Shopping Button */}
                      {!isCollected && (
                        <button
                          onClick={() => setSelectedParentOrder(order)}
                          className="w-full bg-navy-700 hover:bg-slate-700 border border-slate-700 text-slate-300 py-1.5 rounded-lg text-xs font-medium flex items-center justify-center space-x-1 transition"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span>Add More Products (Controlled Add-on)</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-4">No active Shop &amp; Collect orders.</p>
            )}
          </div>
        </div>
      </div>

      {/* Controlled Add-on Shopping Modal */}
      {selectedParentOrder && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-navy-700 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex justify-between items-center border-b border-slate-700 pb-3">
              <div>
                <h3 className="font-bold text-white text-base">Controlled Add-on Shopping</h3>
                <p className="text-xs text-slate-400">
                  Attached to verified parent order: {selectedParentOrder.orderNumber}
                </p>
              </div>
              <button
                onClick={() => setSelectedParentOrder(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Select any additional products you realized you need. They will be processed as a separately verified add-on transaction without tampering with the original locked order.
            </p>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {products.slice(0, 5).map((p) => {
                const added = addonItems.find((a) => a.product._id === p._id);
                return (
                  <div
                    key={p._id}
                    className="flex justify-between items-center p-2 bg-navy-800/60 rounded-xl border border-slate-700 text-xs"
                  >
                    <div>
                      <span className="font-medium text-white block">{p.name}</span>
                      <span className="text-brand-400 font-bold">{formatKes(p.priceMinor)}</span>
                    </div>
                    {added ? (
                      <span className="text-xs font-bold text-brand-400 px-3">Added ({added.quantity})</span>
                    ) : (
                      <button
                        onClick={() => setAddonItems((prev) => [...prev, { product: p, quantity: 1 }])}
                        className="bg-brand-600 hover:bg-brand-500 text-white px-3 py-1 rounded-lg font-bold"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {addonItems.length > 0 && (
              <div className="pt-3 border-t border-slate-700 flex justify-between items-center">
                <span className="text-xs text-slate-300 font-semibold">
                  Add-on Total:{' '}
                  {formatKes(addonItems.reduce((s, i) => s + i.product.priceMinor * i.quantity, 0))}
                </span>
                <button
                  disabled={loading}
                  onClick={handleCreateAddon}
                  className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Confirm & Pay Add-on</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
