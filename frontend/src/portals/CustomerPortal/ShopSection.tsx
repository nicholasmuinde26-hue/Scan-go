import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scan, ShoppingBag, Search, Plus, Minus, Clock, Check, ArrowRight, CreditCard, MapPin, Flame, BadgePercent, ChevronRight, Store as StoreIcon } from 'lucide-react';
import { RealCameraScanner } from '../../components/RealCameraScanner.js';
import { Product, Store } from '../../types.js';
import { formatKes } from '../../api.js';
import { CheckoutModal } from './CheckoutModal.js';
import { CustomerOrder, IS_DEV, categoryIcon, depositFor, todayISO } from './customerTypes.js';
import { useCart } from './useCart.js';
import { consumeStartInScanAndGo, presenceLimitMessage, usePresenceSession } from '../../presence.js';

/** The poster QR holds a link like https://app/enter?p=<code>. Accepts that link, "?p=<code>", or the bare code. */
function extractPosterCode(text: string): string {
  const value = text.trim();
  try { const fromUrl = new URL(value).searchParams.get('p'); if (fromUrl) return fromUrl; } catch { /* not a URL */ }
  const match = /[?&]p=([^&\s]+)/.exec(value);
  if (match) return decodeURIComponent(match[1]);
  return /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(value) ? value : '';
}

interface Props {
  store: Store;
  products: Product[];
  cart: ReturnType<typeof useCart>;
  defaultPhone: string;
  defaultEmail: string;
  onOrderPaid: (order: CustomerOrder) => void;
  onOrderCreated: () => void;
  goToStores: () => void;
}

type Mode = 'SHOP' | 'SCAN_GO';
type ProductSort = 'recommended' | 'price-low' | 'price-high' | 'name';

const ProductRailCard: React.FC<{ product: Product; onAdd: (product: Product) => void; badge?: 'offer' | 'popular' }> = ({ product, onAdd, badge }) => {
  const offer = Boolean(product.compareAtPriceMinor && product.compareAtPriceMinor > product.priceMinor);
  const discount = offer ? Math.round((1 - product.priceMinor / (product.compareAtPriceMinor || product.priceMinor)) * 100) : 0;
  return (
    <article className="group flex w-44 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg sm:w-48">
      <div className="relative flex h-32 items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-white to-azure-50 text-4xl">
        {product.image ? <img src={product.image} alt={product.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" loading="lazy" /> : categoryIcon(product.category || '')}
        {badge === 'offer' && offer && <span className="absolute left-2 top-2 rounded-full bg-rose-600 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white">Save {discount}%</span>}
        {badge === 'popular' && <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-navy-800/90 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white"><Flame className="h-3 w-3 text-amber-300" />Popular</span>}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{product.category || 'Essentials'}</span>
        <h3 className="mt-1 min-h-9 text-xs font-bold leading-snug text-navy-800 line-clamp-2">{product.name}</h3>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className={`text-sm font-black ${offer ? 'text-rose-700' : 'text-brand-700'}`}>{formatKes(product.priceMinor)}</span>
          {offer && <span className="text-[10px] text-slate-400 line-through">{formatKes(product.compareAtPriceMinor!)}</span>}
        </div>
        {badge === 'popular' && <span className="mt-1 text-[10px] text-slate-400">{product.unitsSold30d} sold in 30 days</span>}
        <button onClick={() => onAdd(product)} disabled={product.stock <= 0} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2 text-[11px] font-bold text-white transition hover:bg-brand-700 disabled:bg-slate-300">
          <Plus className="h-3.5 w-3.5" /> Add to basket
        </button>
      </div>
    </article>
  );
};

export const ShopSection: React.FC<Props> = ({ store, products, cart, defaultPhone, defaultEmail, onOrderPaid, onOrderCreated, goToStores }) => {
  const collectAvailable = store.shopAndCollectAvailable !== false;
  // After checking in from a store poster the shopper lands straight on Scan & Go.
  const [mode, setMode] = useState<Mode>(() => (consumeStartInScanAndGo() || !collectAvailable ? 'SCAN_GO' : 'SHOP'));
  // In-store check-in: Scan & Go needs it, Shop & Collect does not.
  const presence = usePresenceSession(mode === 'SCAN_GO' ? store._id : undefined);
  const navigate = useNavigate();
  const [scanningPoster, setScanningPoster] = useState(false);
  const [posterText, setPosterText] = useState('');
  const [posterError, setPosterError] = useState('');
  // Scanning the entrance poster inside the app takes the shopper to the same check-in page the phone camera would open.
  const openCheckIn = (text: string) => {
    const code = extractPosterCode(text);
    if (!code) { setPosterError('That is not a store check-in QR. Scan the poster at the store entrance.'); return; }
    navigate(`/enter?p=${encodeURIComponent(code)}`);
  };
  const [paymentPlan, setPaymentPlan] = useState<'FULL' | 'DEPOSIT'>('FULL');
  const depositPercent = store.collectDepositPercent ?? 50;
  // Switching to a branch whose plan has no Shop & Collect must not leave the customer on a mode that cannot be paid for.
  useEffect(() => {
    if (!collectAvailable && mode === 'SHOP') setMode('SCAN_GO');
  }, [collectAvailable, mode]);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ProductSort>('recommended');
  const [manualBarcode, setManualBarcode] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const slots = useMemo(() => (store.pickupSlots || []).filter((s) => s.active), [store]);
  const [slotId, setSlotId] = useState('');
  const [pickupDate, setPickupDate] = useState(todayISO());
  const [substitutionsAllowed, setSubstitutionsAllowed] = useState(true);
  const selectedSlot = slots.find((s) => s.slotId === slotId) || slots[0];

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p) => counts.set(p.category || 'Other', (counts.get(p.category || 'Other') || 0) + 1));
    return [{ name: 'All', count: products.length }, ...[...counts.entries()].sort().map(([name, count]) => ({ name, count }))];
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = products.filter(
      (p) =>
        (category === 'All' || (p.category || 'Other') === category) &&
        (!q || p.name.toLowerCase().includes(q) || p.barcode.includes(q) || (p.barcodeAliases || []).some((code) => code.toLowerCase().includes(q)) || (p.pluCode || '').toLowerCase().includes(q))
    );
    return result.sort((a, b) => {
      if (sort === 'price-low') return a.priceMinor - b.priceMinor;
      if (sort === 'price-high') return b.priceMinor - a.priceMinor;
      if (sort === 'name') return a.name.localeCompare(b.name);
      return (b.unitsSold30d || 0) - (a.unitsSold30d || 0) || a.name.localeCompare(b.name);
    });
  }, [products, category, search, sort]);

  const selectCategory = (name: string) => {
    setCategory(name);
    const scrollArea = document.querySelector<HTMLElement>('[data-customer-scroll-area]');
    const target = document.getElementById('catalogue-products');
    if (!scrollArea || !target) return;
    const top = target.getBoundingClientRect().top - scrollArea.getBoundingClientRect().top + scrollArea.scrollTop - 12;
    scrollArea.scrollTo({ top, behavior: 'smooth' });
  };

  const offerProducts = useMemo(
    () => products.filter((p) => p.stock > 0 && Boolean(p.compareAtPriceMinor && p.compareAtPriceMinor > p.priceMinor)).sort((a, b) => ((b.compareAtPriceMinor || 0) - b.priceMinor) - ((a.compareAtPriceMinor || 0) - a.priceMinor)),
    [products]
  );
  const fastMovingProducts = useMemo(
    () => products.filter((p) => p.stock > 0 && (p.unitsSold30d || 0) > 0).sort((a, b) => (b.unitsSold30d || 0) - (a.unitsSold30d || 0)).slice(0, 10),
    [products]
  );

  const addProduct = (p: Product) => {
    if (p.stock <= 0) return;
    if (mode === 'SCAN_GO' && presence.enforced && !presence.session && !presence.loading) {
      setScanError('Check in at the store entrance before scanning.');
      return;
    }
    if (mode === 'SCAN_GO' && presence.session) {
      // Same limits the server applies to this check-in, shown before the shopper reaches payment.
      const blocked = presenceLimitMessage(presence.session, { totalItems: cart.totalItems + 1, totalMinor: cart.totalMinor + p.priceMinor });
      if (blocked) {
        setScanError(blocked);
        return;
      }
    }
    if (!cart.add(p)) {
      setToast(`Only ${p.stock} of ${p.name} in stock`);
    } else {
      setToast(`${p.name} added`);
    }
    window.setTimeout(() => setToast(null), 2500);
  };

  const handleBarcode = (code: string) => {
    const found = products.find((p) => p.barcode === code.trim());
    if (!found) {
      setScanError(`Barcode ${code} is not in this store's catalogue.`);
      return false;
    }
    setScanError(null);
    addProduct(found);
    return true;
  };

  const needsSlot = mode === 'SHOP';
  // Why Scan & Go payment is blocked right now, if it is: not checked in, still checking, or over this check-in's limits.
  const scanGoBlock =
    mode !== 'SCAN_GO'
      ? null
      : presence.loading
        ? 'Checking your in-store check-in…'
        : presence.enforced && !presence.session
          ? 'Check in at the store entrance to pay with Scan & Go.'
          : presenceLimitMessage(presence.session, { totalItems: cart.totalItems, totalMinor: cart.totalMinor });
  const canCheckout = cart.cart.length > 0 && !scanGoBlock && (!needsSlot || (Boolean(selectedSlot) && Boolean(pickupDate)));

  const CartPanel = (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4 lg:sticky lg:top-4">
      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-brand-600" />
          <h3 className="font-bold text-sm text-navy-700">{mode === 'SCAN_GO' ? 'Scanned items' : 'Your basket'}</h3>
        </div>
        <span className="text-xs font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">
          {cart.totalItems} items
        </span>
      </div>

      {cart.cart.length === 0 ? (
        <div className="py-8 text-center text-slate-400 space-y-1.5">
          <ShoppingBag className="w-8 h-8 mx-auto stroke-1" />
          <p className="text-xs font-medium">Nothing here yet.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {cart.cart.map(({ product, quantity }) => (
            <div key={product._id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs gap-2">
              <div className="min-w-0">
                <span className="font-bold text-navy-700 truncate block">{product.name}</span>
                <span className="text-slate-500 font-semibold">{formatKes(product.priceMinor)}</span>
              </div>
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shrink-0">
                <button aria-label={`Remove one ${product.name}`} onClick={() => cart.changeQty(product._id, -1)} className="p-1 hover:bg-slate-100 rounded">
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-bold text-navy-800 px-1 min-w-[1.25rem] text-center">{quantity}</span>
                <button aria-label={`Add one ${product.name}`} onClick={() => cart.changeQty(product._id, 1)} className="p-1 hover:bg-slate-100 rounded">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {mode === 'SHOP' && cart.cart.length > 0 && (
        <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
          {slots.length === 0 ? (
            <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5 font-medium">
              This store has no pickup slots open right now. Try another store or use Scan &amp; Go in the store.
            </p>
          ) : (
            <>
              <div>
                <label htmlFor="pickup-date" className="text-[11px] font-bold text-slate-500 block mb-1">
                  Pickup date
                </label>
                <input
                  id="pickup-date"
                  type="date"
                  min={todayISO()}
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-medium text-navy-700"
                />
              </div>
              <div>
                <label htmlFor="pickup-slot" className="text-[11px] font-bold text-slate-500 block mb-1">
                  Time slot
                </label>
                <select
                  id="pickup-slot"
                  value={selectedSlot?.slotId || ''}
                  onChange={(e) => setSlotId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 font-semibold text-navy-700"
                >
                  {slots.map((s) => (
                    <option key={s.slotId} value={s.slotId}>
                      {s.startTime} – {s.endTime}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-start gap-2 pt-1 text-[11px] text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={substitutionsAllowed}
                  onChange={(e) => setSubstitutionsAllowed(e.target.checked)}
                  className="mt-0.5 rounded text-brand-600"
                />
                <span>If an item is out of stock, the picker may suggest a replacement for me to approve.</span>
              </label>
            </>
          )}
        </div>
      )}

      {mode === 'SHOP' && cart.cart.length > 0 && (
        <fieldset className="pt-3 border-t border-slate-100 space-y-2 text-xs">
          <legend className="text-[11px] font-bold text-slate-500 mb-1">How would you like to pay?</legend>
          {([
            ['FULL', 'Pay in full now', formatKes(cart.totalMinor), 'Nothing more to pay at pickup.'],
            ['DEPOSIT', `Pay ${depositPercent}% now, rest at pickup`, formatKes(depositFor(cart.totalMinor, depositPercent)), 'Your order is packed once the deposit clears. The deposit is kept if you do not collect in time.'],
          ] as const).map(([id, label, amount, hint]) => (
            <label key={id} className={`flex items-start gap-2.5 rounded-xl border p-2.5 cursor-pointer ${paymentPlan === id ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
              <input type="radio" name="payment-plan" checked={paymentPlan === id} onChange={() => setPaymentPlan(id)} className="mt-0.5 text-brand-600" />
              <span className="flex-1">
                <span className="flex justify-between font-bold text-navy-700"><span>{label}</span><span>{amount}</span></span>
                <span className="block text-[11px] text-slate-500 mt-0.5">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {cart.cart.length > 0 && (
        <div className="pt-3 border-t border-slate-100 space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="font-bold text-slate-700">Total</span>
            <span className="font-black text-lg text-brand-700">{formatKes(cart.totalMinor)}</span>
          </div>
          {scanGoBlock && !presence.loading && (
            <p role="alert" className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 font-medium">{scanGoBlock}</p>
          )}
          <button
            disabled={!canCheckout}
            onClick={() => setCheckoutOpen(true)}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-xs transition shadow-md shadow-brand-600/20 flex items-center justify-center gap-2"
          >
            {mode === 'SCAN_GO' ? <CreditCard className="w-4 h-4" /> : null}
            <span>{mode === 'SCAN_GO' ? 'Pay and get exit pass' : paymentPlan === 'DEPOSIT' ? 'Pay deposit' : 'Checkout'}</span>
            {mode === 'SHOP' && <ArrowRight className="w-4 h-4" />}
          </button>
          <button onClick={cart.clear} className="w-full text-[11px] font-semibold text-slate-400 hover:text-rose-600">
            Empty basket
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Store + mode */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <button onClick={goToStores} className="flex items-center gap-2 text-xs text-slate-600 hover:text-brand-700 font-semibold text-left">
          <MapPin className="w-4 h-4 text-brand-600" />
          <span>
            Shopping at <strong className="text-navy-800">{store.name}</strong> · change store
          </span>
        </button>
        <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1 self-start">
          {([
            ['SHOP', 'Shop & Collect', ShoppingBag],
            ['SCAN_GO', 'Scan & Go (in store)', Scan],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              disabled={id === 'SHOP' && !collectAvailable}
              title={id === 'SHOP' && !collectAvailable ? (store.shopAndCollectUnavailableReason || 'Shop & Collect is unavailable for this branch.') : undefined}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${
                mode === id ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {!collectAvailable && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 font-medium">
          {store.shopAndCollectUnavailableReason || `${store.name} does not offer Shop & Collect yet.`} You can still use Scan &amp; Go while you are in the store, or choose another branch.
        </p>
      )}

      {mode === 'SHOP' && (
        <div className="space-y-5">
          <section className="relative isolate overflow-hidden rounded-[1.75rem] bg-gradient-to-r from-navy-900 via-navy-800 to-brand-800 px-5 py-7 text-white shadow-lg sm:px-8 sm:py-9">
            <div className="absolute -right-12 -top-24 -z-10 h-72 w-72 rounded-full bg-brand-400/20 blur-3xl" />
            <div className="absolute bottom-0 right-1/3 -z-10 h-40 w-40 rounded-full bg-azure-400/20 blur-3xl" />
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-100">
                  <StoreIcon className="h-3.5 w-3.5" /> {store.organization?.name || store.name}
                </div>
                <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-4xl">Your everyday shop, made easy.</h2>
                <p className="mt-2 max-w-xl text-xs leading-relaxed text-white/75 sm:text-sm">
                  Browse this branch’s live catalogue, find good offers, and choose a collection time that works for you.
                </p>
              </div>
              <div className="flex min-w-56 items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700"><MapPin className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-white/60">Shopping at</span>
                  <span className="block truncate text-xs font-bold">{store.name}</span>
                  <span className="block truncate text-[10px] text-white/70">{store.location}</span>
                </span>
              </div>
            </div>
          </section>

          {offerProducts.length > 0 && (
            <section className="overflow-hidden rounded-3xl border border-rose-100 bg-gradient-to-br from-rose-50/80 via-white to-white p-4 sm:p-5">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div>
                  <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-rose-600"><BadgePercent className="h-4 w-4" /> Offers & savings</span>
                  <h2 className="mt-1 text-lg font-black text-navy-800 sm:text-xl">Offers at this branch</h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">Current prices and savings are set by {store.organization?.name || 'this supermarket'}.</p>
                </div>
                <button onClick={() => { setCategory('All'); document.getElementById('catalogue-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} className="hidden items-center gap-1 text-xs font-bold text-rose-700 hover:text-rose-800 sm:flex">
                  Browse catalogue <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
                {offerProducts.slice(0, 10).map((product) => <ProductRailCard key={product._id} product={product} onAdd={addProduct} badge="offer" />)}
              </div>
            </section>
          )}

          {fastMovingProducts.length > 0 && (
            <section className="rounded-3xl border border-amber-100 bg-gradient-to-br from-amber-50/70 via-white to-white p-4 sm:p-5">
              <div className="mb-4">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-amber-700"><Flame className="h-4 w-4" /> Popular with shoppers</span>
                <h2 className="mt-1 text-lg font-black text-navy-800 sm:text-xl">Fast movers</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">Based on items purchased at this branch over the last 30 days.</p>
              </div>
              <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
                {fastMovingProducts.map((product) => <ProductRailCard key={product._id} product={product} onAdd={addProduct} badge="popular" />)}
              </div>
            </section>
          )}
        </div>
      )}

      {toast && (
        <div role="status" className="fixed bottom-6 right-6 z-40 bg-navy-800 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-semibold">
          <Check className="w-4 h-4 text-brand-400" /> {toast}
        </div>
      )}

      {mode === 'SHOP' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_320px] xl:grid-cols-[260px_minmax(0,1fr)_360px] gap-5 items-start">
          <aside className="self-start bg-white rounded-2xl p-3 border border-slate-200 shadow-xs lg:sticky lg:top-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block px-2 mb-2">Categories</span>
            <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible">
              {categories.map((c) => (
                <button
                  key={c.name}
                  onClick={() => selectCategory(c.name)}
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                    category === c.name ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>
                    {c.name === 'All' ? '🛒' : categoryIcon(c.name)} {c.name}
                  </span>
                  <span className={`text-[11px] px-2 rounded-full ${category === c.name ? 'bg-white/20' : 'bg-slate-100 text-slate-600'}`}>{c.count}</span>
                </button>
              ))}
            </div>
          </aside>

          <div id="catalogue-products" className="min-w-0 space-y-4 scroll-mt-24">
            <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products, brands, or barcode"
                  aria-label="Search products"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs text-navy-800 outline-none focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <label className="flex items-center gap-2 whitespace-nowrap text-[11px] font-semibold text-slate-500">
                Sort by
                <select value={sort} onChange={(e) => setSort(e.target.value as ProductSort)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-navy-800 outline-none focus:border-brand-400">
                  <option value="recommended">Recommended</option>
                  <option value="price-low">Price: low to high</option>
                  <option value="price-high">Price: high to low</option>
                  <option value="name">Name</option>
                </select>
              </label>
            </div>

            {products.length === 0 ? (
              <div className="py-12 bg-white rounded-2xl border border-slate-200 text-center text-slate-400 text-xs">
                This store has no products listed yet.
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 bg-white rounded-2xl border border-slate-200 text-center text-slate-400 text-xs">No products match your search.</div>
            ) : (
              <>
                <div className="mb-3 flex items-end justify-between border-b border-slate-200 pb-2">
                  <div>
                    <h2 className="text-base font-black text-navy-800">{category === 'All' ? 'All products' : `${categoryIcon(category)} ${category}`}</h2>
                    <p className="mt-0.5 text-[10px] text-slate-500">{filtered.length} {filtered.length === 1 ? 'product' : 'products'}</p>
                  </div>
                  {category !== 'All' && <button onClick={() => selectCategory('All')} className="text-[10px] font-bold text-brand-700 hover:text-brand-800">Show all products</button>}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {filtered.map((p) => {
                        const inCart = cart.cart.find((l) => l.product._id === p._id)?.quantity || 0;
                        const out = p.stock <= 0;
                        return (
                          <div key={p._id} className={`group flex flex-col justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lg ${out ? 'opacity-60' : ''}`}>
                            <div>
                              <div className="relative mb-3 flex h-28 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-50 via-white to-azure-50 text-4xl sm:h-36">
                                {p.image ? <img src={p.image} alt={p.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" loading="lazy" /> : categoryIcon(p.category || '')}
                                {p.compareAtPriceMinor && p.compareAtPriceMinor > p.priceMinor && (
                                  <span className="absolute left-2 top-2 rounded-full bg-rose-600 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white">
                                    Save {Math.round((1 - p.priceMinor / p.compareAtPriceMinor) * 100)}%
                                  </span>
                                )}
                              </div>
                              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{p.category || 'Essentials'}</p>
                              <p className="line-clamp-2 text-xs font-bold leading-snug text-navy-700">{p.name}</p>
                              <div className="mt-1 flex items-baseline gap-1.5">
                                <p className={`text-sm font-black ${p.compareAtPriceMinor && p.compareAtPriceMinor > p.priceMinor ? 'text-rose-700' : 'text-brand-700'}`}>{formatKes(p.priceMinor)}</p>
                                {p.compareAtPriceMinor && p.compareAtPriceMinor > p.priceMinor && <p className="text-[10px] text-slate-400 line-through">{formatKes(p.compareAtPriceMinor)}</p>}
                              </div>
                              {out ? (
                                <p className="text-[10px] font-bold text-rose-600">Out of stock</p>
                              ) : p.stock <= 5 ? (
                                <p className="text-[10px] font-bold text-amber-600">Only {p.stock} left</p>
                              ) : null}
                            </div>
                            <button
                              disabled={out}
                              onClick={() => addProduct(p)}
                              className="w-full rounded-xl bg-navy-800 py-2 text-xs font-bold text-white transition hover:bg-brand-700 disabled:bg-slate-300"
                            >
                              {inCart > 0 ? `Add another (${inCart})` : 'Add'}
                            </button>
                          </div>
                        );
                  })}
                </div>
              </>
            )}
          </div>

          <div>{CartPanel}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 items-start">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Scan className="w-5 h-5 text-brand-600" />
              <span className="font-bold text-sm text-navy-700">Scan items as you shop</span>
            </div>
            <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Use this while you are inside {store.name}. Staff may spot-check your bags at the exit.
            </p>
            {presence.enforced && !presence.session ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3 text-xs text-amber-900">
                <p className="font-bold">{presence.loading ? 'Checking your check-in…' : 'Check in to start Scan & Go'}</p>
                {!presence.loading && (
                  <>
                    <p>Scan the QR poster at the store entrance to start. Shop &amp; Collect needs no check-in.</p>
                    {scanningPoster ? (
                      <div className="space-y-2">
                        <RealCameraScanner onScanSuccess={openCheckIn} isScanningActive />
                        <button type="button" onClick={() => setScanningPoster(false)} className="text-[11px] font-bold text-amber-800 underline">Cancel</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => { setPosterError(''); setScanningPoster(true); }} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 font-bold text-white hover:bg-brand-700">
                        <Scan className="h-4 w-4" /> Scan store QR code
                      </button>
                    )}
                    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); openCheckIn(posterText); }}>
                      <input value={posterText} onChange={(e) => setPosterText(e.target.value)} placeholder="Or paste the poster link or code" aria-label="Poster link or code" className="flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 font-mono text-[11px]" />
                      <button type="submit" disabled={!posterText.trim()} className="rounded-xl border border-amber-300 bg-white px-3 py-2 font-bold text-amber-800 disabled:opacity-40">Go</button>
                    </form>
                    {posterError && <p role="alert" className="font-bold text-rose-700">{posterError}</p>}
                    <button onClick={() => void presence.refresh()} className="rounded-xl bg-amber-600 px-4 py-2 font-bold text-white hover:bg-amber-700">
                      I have checked in — refresh
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                {presence.session && presence.session.trustTier === 2 && (
                  <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                    Basic check-in: up to {presence.session.limits.maxItems || 'any number of'} items
                    {presence.session.limits.maxBasketMinor > 0 ? ` and ${formatKes(presence.session.limits.maxBasketMinor)}` : ''}. Scan the main entrance poster for a larger basket.
                  </p>
                )}
                <RealCameraScanner onScanSuccess={(code: string) => void handleBarcode(code)} isScanningActive={mode === 'SCAN_GO'} />
              </>
            )}
            {scanError && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">{scanError}</p>}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (manualBarcode.trim() && handleBarcode(manualBarcode)) setManualBarcode('');
              }}
            >
              <input
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                placeholder="Type a barcode if the camera can't read it"
                aria-label="Barcode"
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono"
              />
              <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white font-bold px-4 py-2 rounded-xl text-xs">
                Add
              </button>
            </form>

            {IS_DEV && (
              <div className="pt-3 border-t border-dashed border-slate-200">
                <span className="text-[11px] text-slate-400 block mb-2 font-semibold">Developer shortcut (hidden in production)</span>
                <div className="grid grid-cols-2 gap-2">
                  {products.slice(0, 6).map((p) => (
                    <button key={p._id} onClick={() => addProduct(p)} className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-left text-xs truncate">
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {CartPanel}
        </div>
      )}

      {checkoutOpen && (
        <CheckoutModal
          onClose={() => setCheckoutOpen(false)}
          onOrderCreated={onOrderCreated}
          onPaid={(o) => {
            setCheckoutOpen(false);
            onOrderPaid(o);
          }}
          defaultPhone={defaultPhone}
          defaultEmail={defaultEmail}
          totalMinor={cart.totalMinor}
          newOrder={{
            mode,
            storeId: store._id,
            lines: cart.cart,
            pickup:
              mode === 'SHOP' && selectedSlot
                ? { slotId: selectedSlot.slotId, date: pickupDate, timeWindow: `${selectedSlot.startTime} – ${selectedSlot.endTime}` }
                : undefined,
            substitutionsAllowed,
            paymentPlan: mode === 'SHOP' ? paymentPlan : undefined,
            depositPercent,
          }}
        />
      )}
    </div>
  );
};
