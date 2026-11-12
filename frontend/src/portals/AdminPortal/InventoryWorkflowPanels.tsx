import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, PackagePlus, Printer, RefreshCw, Truck, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { apiRequest, formatKes } from '../../api.js';
import { Store, Product } from '../../types.js';
import { User } from '../../types.js';
import { can } from '../../permissions.js';
import { RealCameraScanner } from '../../components/RealCameraScanner.js';
import { ProductImagePicker, ProductThumb } from '../../components/ProductImagePicker.js';

type WorkflowTab = 'RECEIVE' | 'UNKNOWN' | 'APPROVALS' | 'LABELS';
interface Props { tab: WorkflowTab; store: Store; products: Product[]; currentUser?: User | null; onRefresh: () => void; onMessage: (message: { type: 'success' | 'error'; text: string }) => void; }

const inputCls = 'w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm';
const chipCls = (on: boolean) => `rounded-full border px-2.5 py-1 text-[11px] font-semibold ${on ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`;
const toMinor = (kes: string) => Math.round(Number(kes) * 100);

/** One product waiting to go on sale: the manager checks the photo and name, types the price, and approves in one click. */
const RegistrationCard: React.FC<{ approval: any; categories: string[]; onDecide: (approval: any, decision: 'APPROVED' | 'REJECTED', changes?: Record<string, any>) => Promise<void> }> = ({ approval, categories, onDecide }) => {
  const draft = approval.product || {};
  const weighed = draft.soldBy === 'weight';
  const [name, setName] = useState(draft.name || approval.requestData?.name || '');
  const [category, setCategory] = useState(draft.category || 'General');
  const [price, setPrice] = useState(weighed ? (draft.pricePerKgMinor ? String(draft.pricePerKgMinor / 100) : '') : (draft.priceMinor ? String(draft.priceMinor / 100) : ''));
  const [vat, setVat] = useState(String((draft.vatRateBps || 0) / 100));
  const [busy, setBusy] = useState(false);
  const priced = Number(price) > 0;

  const approve = async () => {
    if (!priced || busy) return;
    setBusy(true);
    await onDecide(approval, 'APPROVED', { name, category, vatRateBps: toMinor(vat), ...(weighed ? { pricePerKgMinor: toMinor(price) } : { priceMinor: toMinor(price) }) });
    setBusy(false);
  };

  return <article className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
    <div className="flex flex-wrap items-start gap-4">
      <ProductThumb src={draft.image} name={name} className="h-20 w-20" />
      <div className="min-w-[200px] flex-1 space-y-2">
        <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">New product · {approval.receivedQuantity || 0} unit(s) received</p>
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} font-bold`} aria-label="Product name" />
        <div className="flex flex-wrap items-center gap-2">
          <input list={`cats-${approval._id}`} value={category} onChange={(e) => setCategory(e.target.value)} className="w-40 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" aria-label="Category" />
          <datalist id={`cats-${approval._id}`}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
          <span className="font-mono text-[11px] text-slate-500">{draft.barcode || approval.requestData?.barcode}</span>
        </div>
        <p className="text-[11px] text-slate-500">Requested by {approval.requestedBy?.name || approval.requestedByName} · {new Date(approval.createdAt).toLocaleString()}{approval.supplier ? ` · ${approval.supplier}` : ''}{approval.deliveryReference ? ` · ${approval.deliveryReference}` : ''}</p>
      </div>
      <div className="w-full space-y-2 sm:w-56">
        <label className="block text-[11px] font-bold text-slate-600">{weighed ? 'Price per kg (KES)' : 'Selling price (KES)'}
          <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); approve(); } }} className={`${inputCls} mt-1 font-bold`} placeholder="e.g. 120" />
        </label>
        <div className="flex items-center gap-1.5"><span className="text-[11px] font-bold text-slate-600">VAT</span>{['0', '16'].map((v) => <button type="button" key={v} onClick={() => setVat(v)} className={chipCls(vat === v)}>{v}%</button>)}</div>
        <div className="flex gap-2">
          <button onClick={approve} disabled={!priced || busy} title={priced ? '' : 'Enter the selling price first'} className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-brand-600 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-40"><Check className="h-3.5 w-3.5" />{busy ? 'Saving…' : 'Approve & sell'}</button>
          <button onClick={() => onDecide(approval, 'REJECTED')} disabled={busy} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-xs font-bold text-rose-700"><X className="h-3.5 w-3.5" />Reject</button>
        </div>
      </div>
    </div>
  </article>;
};

export const InventoryWorkflowPanels: React.FC<Props> = ({ tab, store, products, currentUser, onRefresh, onMessage }) => {
  const [barcode, setBarcode] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [supplier, setSupplier] = useState('');
  const [deliveryReference, setDeliveryReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [session, setSession] = useState<Array<{ key: number; name: string; quantity: number; pending: boolean }>>([]);
  // A scanned barcode the catalogue does not know yet: the stock controller names it and (optionally) photographs it.
  const [newItem, setNewItem] = useState<{ barcode: string; quantity: number } | null>(null);
  const [newForm, setNewForm] = useState({ name: '', category: '', price: '', vat: '0', image: null as string | null });
  const [selectedUnknown, setSelectedUnknown] = useState<any | null>(null);
  const [registration, setRegistration] = useState({ name: '', category: '', price: '', pricePerKg: '', vat: '0', pluCode: '', isWeighted: false, image: null as string | null });
  const [selectedProduct, setSelectedProduct] = useState(products[0]?._id || '');
  const quantityInput = useRef<HTMLInputElement | null>(null);
  const barcodeInput = useRef<HTMLInputElement | null>(null);
  const advanceRef = useRef(false);
  const sessionKey = useRef(0);
  const canSetPrices = can(currentUser, 'pricing:write');

  const loadQueue = useCallback(async () => {
    try { const res = await apiRequest(`/products/inventory/unknown-barcodes?storeId=${store._id}`); const list = res.unknownBarcodes || []; setUnknown(list); return list; }
    catch { setUnknown([]); return []; }
  }, [store._id]);
  const loadApprovals = useCallback(async () => {
    try { const res = await apiRequest(`/products/inventory/approvals?storeId=${store._id}`); setApprovals(res.approvals || []); }
    catch { setApprovals([]); }
  }, [store._id]);
  const loadReceipts = useCallback(async () => {
    try { const res = await apiRequest(`/products/inventory/receipts?storeId=${store._id}`); setReceipts(res.receipts || []); }
    catch { setReceipts([]); }
  }, [store._id]);

  useEffect(() => { loadQueue(); loadApprovals(); loadReceipts(); }, [loadQueue, loadApprovals, loadReceipts]);
  useEffect(() => { if (!products.some((p) => p._id === selectedProduct)) setSelectedProduct(products[0]?._id || ''); }, [products, selectedProduct]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((p: any) => { const c = String(p.category || '').trim(); if (c) counts.set(c, (counts.get(c) || 0) + 1); });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
  }, [products]);

  const backToScanning = () => { setBarcode(''); setQuantity('1'); setTimeout(() => barcodeInput.current?.focus(), 0); };
  const logSession = (name: string, qty: number, pending: boolean) => setSession((prev) => [{ key: ++sessionKey.current, name, quantity: qty, pending }, ...prev].slice(0, 30));

  // 1) Scan + quantity. Known products add stock straight away; unknown ones open the quick "new product" form.
  const submitReceipt = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = barcode.trim(); const qty = Number(quantity);
    if (!code || !Number.isInteger(qty) || qty < 1) return;
    setBusy(true);
    try {
      const result = await apiRequest('/products/inventory/receive', { method: 'POST', body: JSON.stringify({ storeId: store._id, barcode: code, quantity: qty, supplier: supplier.trim(), deliveryReference: deliveryReference.trim() }) });
      onMessage({ type: 'success', text: `Received ${qty} × ${result.product.name}. Stock is now ${result.product.stock}.` });
      logSession(result.product.name, qty, false);
      backToScanning(); loadReceipts(); onRefresh();
    } catch (error: any) {
      if (error?.data?.unknownBarcode) {
        setNewItem({ barcode: code, quantity: qty });
        setNewForm((previous) => ({ name: '', category: previous.category, price: '', vat: previous.vat, image: null }));
      } else onMessage({ type: 'error', text: error.message || 'Could not receive stock.' });
    } finally { setBusy(false); }
  };

  // 2) Unregistered goods: save them as received, pending the catalogue manager's price + approval.
  const submitNewItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newItem) return;
    setBusy(true);
    try {
      const result = await apiRequest('/products/inventory/receive-new', { method: 'POST', body: JSON.stringify({
        storeId: store._id, barcode: newItem.barcode, quantity: newItem.quantity, supplier: supplier.trim(), deliveryReference: deliveryReference.trim(),
        name: newForm.name.trim(), category: newForm.category.trim() || 'General', image: newForm.image || undefined,
        priceMinor: canSetPrices && Number(newForm.price) > 0 ? toMinor(newForm.price) : undefined, vatRateBps: toMinor(newForm.vat),
      }) });
      onMessage({ type: 'success', text: result.message });
      logSession(newForm.name.trim(), newItem.quantity, !result.autoApproved);
      setNewItem(null); backToScanning();
      await Promise.all([loadQueue(), loadApprovals(), loadReceipts()]); onRefresh();
    } catch (error: any) { onMessage({ type: 'error', text: error.message || 'Could not save this delivery.' }); }
    finally { setBusy(false); }
  };

  const registerUnknown = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selectedUnknown) return;
    const advance = advanceRef.current; advanceRef.current = false;
    setBusy(true);
    try {
      const result = await apiRequest(`/products/inventory/unknown-barcodes/${selectedUnknown._id}/register`, { method: 'POST', body: JSON.stringify({
        name: registration.name.trim(), category: registration.category.trim() || 'General', image: registration.image || undefined,
        priceMinor: canSetPrices && registration.price ? toMinor(registration.price) : undefined,
        pricePerKgMinor: registration.isWeighted ? toMinor(registration.pricePerKg) : undefined,
        soldBy: registration.isWeighted ? 'weight' : 'unit', vatRateBps: toMinor(registration.vat), pluCode: registration.pluCode.trim() || undefined, isWeighted: registration.isWeighted,
      }) });
      onMessage({ type: 'success', text: result.autoApproved ? `${registration.name.trim()} is now on sale and its delivery is in stock.` : 'Product saved. It goes on sale once a catalogue manager prices and approves it.' });
      const [list] = await Promise.all([loadQueue(), loadApprovals()]);
      setRegistration((previous) => ({ name: '', category: previous.category, price: '', pricePerKg: '', vat: previous.vat, pluCode: '', isWeighted: false, image: null }));
      const next = advance ? list.find((r: any) => !r.productId && r._id !== selectedUnknown._id) : null;
      if (next) { setRegistration((previous) => ({ ...previous, pluCode: /^\d{4,5}$/.test(next.barcode) ? next.barcode : '' })); setSelectedUnknown(next); }
      else setSelectedUnknown(null);
      onRefresh();
    } catch (error: any) { onMessage({ type: 'error', text: error.message || 'Could not register this product.' }); }
    finally { setBusy(false); }
  };

  const decide = async (approval: any, decision: 'APPROVED' | 'REJECTED', changes?: Record<string, any>) => {
    let reason = '';
    if (decision === 'REJECTED') { reason = window.prompt('Why are you rejecting this? (required)')?.trim() || ''; if (!reason) return; }
    try {
      await apiRequest(`/products/inventory/approvals/${approval._id}/decision`, { method: 'POST', body: JSON.stringify({ decision, reason, changes }) });
      onMessage({ type: 'success', text: decision === 'APPROVED' ? (approval.requestData?.kind === 'PRODUCT_REGISTRATION' ? 'Product approved. It is on sale and its delivery is in stock.' : 'Change approved.') : 'Change rejected.' });
      await Promise.all([loadApprovals(), loadQueue(), loadReceipts()]); onRefresh();
    } catch (error: any) { onMessage({ type: 'error', text: error.message || 'Could not record the decision.' }); }
  };

  const dismissUnknown = async (record: any) => {
    const reason = window.prompt('Reason for dismissing this barcode:')?.trim(); if (!reason) return;
    try { await apiRequest(`/products/inventory/unknown-barcodes/${record._id}/dismiss`, { method: 'POST', body: JSON.stringify({ reason }) }); await loadQueue(); }
    catch (error: any) { onMessage({ type: 'error', text: error.message || 'Could not dismiss barcode.' }); }
  };

  const labelProduct = useMemo(() => products.find((p) => p._id === selectedProduct), [products, selectedProduct]);
  const waitingCount = unknown.filter((r) => !r.productId && r._id !== selectedUnknown?._id).length;
  const registrations = approvals.filter((a) => a.requestData?.kind === 'PRODUCT_REGISTRATION');
  const otherApprovals = approvals.filter((a) => a.requestData?.kind !== 'PRODUCT_REGISTRATION');
  const title = { RECEIVE: 'Receive stock', UNKNOWN: 'Unknown barcode queue', APPROVALS: 'Inventory approvals', LABELS: 'Print product labels' }[tab];

  return <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-black uppercase tracking-wide text-navy-800">{title}</h2><p className="mt-1 text-xs text-slate-500">{store.name} · Branch inventory workspace</p></div><button onClick={() => Promise.all([loadQueue(), loadApprovals(), loadReceipts()])} className="rounded-xl border border-slate-200 p-2 text-slate-500" title="Refresh"><RefreshCw className="h-4 w-4" /></button></div>

    {tab === 'RECEIVE' && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
      <div className="space-y-4">
        <form onSubmit={submitReceipt} className="space-y-4 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-navy-800"><Truck className="h-4 w-4 text-brand-600" />Scan each item, type how many, press Enter</div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
            <div><label className="mb-1 block text-xs font-semibold text-slate-600">Barcode / PLU</label><input ref={barcodeInput} autoFocus value={barcode} onChange={(e) => { setBarcode(e.target.value); if (newItem && e.target.value.trim() !== newItem.barcode) setNewItem(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); quantityInput.current?.focus(); quantityInput.current?.select(); } }} className={`${inputCls} py-3 font-mono`} placeholder="Handheld scanner or phone camera" required /></div>
            <div><label className="mb-1 block text-xs font-semibold text-slate-600">Quantity</label><input ref={quantityInput} type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={`${inputCls} py-3`} required /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2"><input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputCls} placeholder="Supplier (kept for the whole delivery)" /><input value={deliveryReference} onChange={(e) => setDeliveryReference(e.target.value)} className={inputCls} placeholder="Delivery note / invoice no." /></div>
          <button disabled={busy || !!newItem} className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy && !newItem ? 'Recording…' : 'Record goods received'}</button>
          <p className="text-[11px] text-slate-500">Not in the catalogue yet? You will be asked for just a name and a photo. A catalogue manager then sets the price and approves it, and it appears in the shop.</p>
        </form>

        {newItem && <form onSubmit={submitNewItem} className="space-y-3 rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-4">
          <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2 text-xs font-black text-amber-900"><PackagePlus className="h-4 w-4" />New product · <span className="font-mono">{newItem.barcode}</span> · {newItem.quantity} unit(s)</div><button type="button" onClick={() => { setNewItem(null); barcodeInput.current?.focus(); }} className="rounded-lg p-1 text-slate-500" title="Cancel"><X className="h-4 w-4" /></button></div>
          <input autoFocus required value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} className={`${inputCls} font-bold`} placeholder="Product name (e.g. A4 Exercise Book 96 pages)" />
          <div>
            <input list="receive-categories" value={newForm.category} onChange={(e) => setNewForm({ ...newForm, category: e.target.value })} className={inputCls} placeholder="Category (pick one or type a new one)" />
            <datalist id="receive-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            {categories.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{categories.slice(0, 6).map((c) => <button type="button" key={c} onClick={() => setNewForm({ ...newForm, category: c })} className={chipCls(newForm.category === c)}>{c}</button>)}</div>}
          </div>
          <ProductImagePicker value={newForm.image} onChange={(image) => setNewForm({ ...newForm, image })} />
          {canSetPrices && <label className="block text-xs font-semibold text-slate-600">Selling price (KES) — add it to put this on sale right now<input type="number" min="0" step="0.01" value={newForm.price} onChange={(e) => setNewForm({ ...newForm, price: e.target.value })} className={`${inputCls} mt-1`} /></label>}
          <button disabled={busy} className="w-full rounded-xl bg-amber-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : canSetPrices && Number(newForm.price) > 0 ? 'Receive & put on sale' : 'Receive & send for approval'}</button>
        </form>}
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-700">Phone camera scanner</h3>
        <RealCameraScanner onScanSuccess={(value) => { setBarcode(value); setTimeout(() => { quantityInput.current?.focus(); quantityInput.current?.select(); }, 0); }} />
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-bold text-navy-800">{session.length ? 'This delivery' : 'Recent goods received'}</h3>{session.length > 0 && <button onClick={() => { setSession([]); setSupplier(''); setDeliveryReference(''); }} className="text-[11px] font-bold text-brand-700">Start new delivery</button>}</div>
          {session.length > 0 ? session.map((entry) => <div key={entry.key} className="flex items-center justify-between gap-3 border-t border-slate-100 py-2 text-xs"><span className="truncate">{entry.name}{entry.pending && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">awaiting approval</span>}</span><strong>+{entry.quantity}</strong></div>)
            : <>{receipts.slice(0, 6).map((receipt) => <div key={receipt._id} className="flex justify-between gap-3 border-t border-slate-100 py-2 text-xs"><span className="truncate">{receipt.productId?.name || receipt.barcode}</span><strong>+{receipt.quantity}</strong></div>)}{receipts.length === 0 && <p className="text-xs text-slate-500">No deliveries recorded yet.</p>}</>}
        </div>
      </div>
    </div>}

    {tab === 'UNKNOWN' && <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead><tr className="border-b text-[10px] uppercase text-slate-400"><th className="p-3">Barcode</th><th className="p-3">Seen</th><th className="p-3">Delivery qty pending</th><th className="p-3">First reported</th><th className="p-3">Source</th>{can(currentUser, 'inventory:write') && <th className="p-3 text-right">Actions</th>}</tr></thead><tbody>{unknown.map((record) => <tr key={record._id} className="border-b border-slate-100"><td className="p-3 font-mono font-bold">{record.barcode}</td><td className="p-3">{record.seenCount}</td><td className="p-3">{record.pendingReceiveQuantity || 0}</td><td className="p-3">{new Date(record.firstSeenAt).toLocaleString()}</td><td className="p-3">{record.source}</td>{can(currentUser, 'inventory:write') && <td className="space-x-2 p-3 text-right">{record.productId ? <span className="rounded-lg bg-amber-50 px-3 py-1.5 font-bold text-amber-700">Awaiting approval</span> : <><button onClick={() => { setSelectedUnknown(record); setRegistration((previous) => ({ ...previous, pluCode: /^\d{4,5}$/.test(record.barcode) ? record.barcode : '' })); }} className="rounded-lg bg-brand-600 px-3 py-1.5 font-bold text-white">Register product</button><button onClick={() => dismissUnknown(record)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600">Dismiss</button></>}</td>}</tr>)}</tbody></table>{unknown.length === 0 && <div className="py-12 text-center text-sm text-slate-500">No unknown barcodes are waiting for this branch.</div>}</div>}

    {tab === 'APPROVALS' && <div className="space-y-3">
      {registrations.map((approval) => <RegistrationCard key={approval._id} approval={approval} categories={categories} onDecide={decide} />)}
      {otherApprovals.map((approval) => <article key={approval._id} className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black text-navy-800">{approval.requestData?.kind?.replaceAll('_', ' ') || 'Inventory change'}</p><p className="mt-1 text-xs text-slate-600">{approval.requestData?.name || approval.requestData?.barcode || `Product ${String(approval.targetId).slice(-7)}`}</p><p className="mt-1 text-[11px] text-slate-500">Requested by {approval.requestedBy?.name || approval.requestedByName} · {new Date(approval.createdAt).toLocaleString()}</p>{approval.requestData?.priceMinor !== undefined && can(currentUser, 'pricing:read') && <p className="mt-2 text-xs">New price: <strong>{formatKes(approval.requestData.priceMinor)}</strong></p>}{approval.requestData?.quantityChange !== undefined && <p className="mt-2 text-xs">Stock change: <strong>{approval.requestData.quantityChange > 0 ? '+' : ''}{approval.requestData.quantityChange}</strong> · {approval.requestData.reason}</p>}</div><div className="flex gap-2">{(approval.requestData?.kind === 'PRICE_CHANGE' ? can(currentUser, 'pricing:approve') : can(currentUser, 'inventory:approve')) && <><button onClick={() => decide(approval, 'APPROVED')} className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white"><Check className="h-3.5 w-3.5" />Approve</button><button onClick={() => decide(approval, 'REJECTED')} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700"><X className="h-3.5 w-3.5" />Reject</button></>}</div></div></article>)}
      {approvals.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">Nothing is waiting for approval.</div>}
    </div>}

    {tab === 'LABELS' && <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_320px]"><div><label className="mb-2 block text-xs font-bold text-slate-700">Choose a registered product</label><select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)} className="w-full rounded-xl border border-slate-200 p-3 text-sm"><option value="">Select a product</option>{products.map((product) => <option key={product._id} value={product._id}>{product.name} · {product.barcode}</option>)}</select><p className="mt-3 text-xs text-slate-500">Print a separate scan label for the primary barcode, each pack-size barcode, and any PLU. Scans resolve the live branch price and stock from the server.</p><button onClick={() => window.print()} disabled={!labelProduct} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-navy-800 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><Printer className="h-4 w-4" />Print labels</button></div>{labelProduct ? (Array.from(new Set([labelProduct.barcode, ...(labelProduct.barcodeAliases || []), ...(labelProduct.pluCode ? [labelProduct.pluCode] : [])])).map((code) => <article key={code} className="inventory-print-label rounded-2xl border-2 border-slate-800 p-4 text-center"><p className="text-sm font-black">{store.name}</p><p className="mt-1 text-xs font-bold">{labelProduct.name}</p><QRCodeSVG value={code} size={160} className="mx-auto my-3" /><p className="font-mono text-sm tracking-widest">{code}</p>{can(currentUser, 'pricing:read') && <p className="mt-2 text-xs font-bold">{formatKes(labelProduct.priceMinor)}</p>}</article>)) : <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">Select a product to preview its label.</div>}</div>}

    {selectedUnknown && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={registerUnknown} className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
      <div className="flex items-start justify-between"><div><h3 className="text-base font-black text-navy-800">Register unknown product</h3><p className="mt-1 text-xs text-slate-500">Barcode: <span className="font-mono font-bold">{selectedUnknown.barcode}</span> · {selectedUnknown.pendingReceiveQuantity || 0} delivery units will be added once it is approved.</p></div><button type="button" onClick={() => setSelectedUnknown(null)} className="rounded-lg p-1 text-slate-500"><X className="h-5 w-5" /></button></div>
      <input autoFocus required value={registration.name} onChange={(e) => setRegistration({ ...registration, name: e.target.value })} className="w-full rounded-xl border border-slate-200 p-3 text-sm" placeholder="Product name" />
      <div>
        <input list="product-categories" value={registration.category} onChange={(e) => setRegistration({ ...registration, category: e.target.value })} className="w-full rounded-xl border border-slate-200 p-3 text-sm" placeholder="Category (pick one or type a new one)" />
        <datalist id="product-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        {categories.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{categories.slice(0, 6).map((c) => <button type="button" key={c} onClick={() => setRegistration({ ...registration, category: c })} className={chipCls(registration.category === c)}>{c}</button>)}</div>}
      </div>
      <ProductImagePicker value={registration.image} onChange={(image) => setRegistration({ ...registration, image })} />
      {canSetPrices && <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-slate-600">Price (KES)<input type="number" min="0" step="0.01" value={registration.price} onChange={(e) => setRegistration({ ...registration, price: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label>
        <div className="text-xs font-semibold text-slate-600"><label>VAT rate (%)<input type="number" min="0" max="100" step="0.01" value={registration.vat} onChange={(e) => setRegistration({ ...registration, vat: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label><div className="mt-1.5 flex gap-1.5">{['0', '16'].map((v) => <button type="button" key={v} onClick={() => setRegistration({ ...registration, vat: v })} className={chipCls(registration.vat === v)}>{v}%</button>)}</div></div>
      </div>}
      <div className="grid grid-cols-2 items-center gap-3"><input value={registration.pluCode} onChange={(e) => setRegistration({ ...registration, pluCode: e.target.value })} className="rounded-xl border border-slate-200 p-3 text-sm" placeholder={registration.isWeighted ? 'PLU code (required)' : 'PLU code (optional)'} required={registration.isWeighted} /><label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={registration.isWeighted} onChange={(e) => setRegistration({ ...registration, isWeighted: e.target.checked })} />Weighed item / produce</label></div>
      {registration.isWeighted && <label className="block text-xs font-semibold text-slate-600">Price per kg (KES)<input type="number" min="0.01" step="0.01" required value={registration.pricePerKg} onChange={(e) => setRegistration({ ...registration, pricePerKg: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label>}
      <p className="text-[11px] text-slate-500">{canSetPrices ? 'Enter a price to put it on sale immediately; leave it blank to review it later in Approvals.' : 'A catalogue manager sets the price and approves it before it goes on sale.'} Approved details and the photo are shared to every branch; the received quantity is posted only at this branch.</p>
      <div className="flex gap-2"><button disabled={busy} onClick={() => { advanceRef.current = false; }} className="flex-1 rounded-xl bg-brand-600 p-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : canSetPrices && registration.price ? 'Save & put on sale' : 'Save for approval'}</button>{waitingCount > 0 && <button disabled={busy} onClick={() => { advanceRef.current = true; }} className="flex-1 rounded-xl border border-brand-600 p-3 text-sm font-bold text-brand-700 disabled:opacity-50">Save &amp; next ({waitingCount} left)</button>}</div>
    </form></div>}
  </section>;
};
