import React, { useState, useEffect } from 'react';
import {
  Boxes,
  Barcode,
  Upload,
  AlertTriangle,
  Tag,
  CheckCircle2,
  Search,
  Plus,
  RefreshCw,
  Edit2,
  Sliders,
  DollarSign,
  Scale,
  ShieldCheck,
  Percent,
  Check,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { Store, User, Product } from '../../types.js';
import { apiRequest, formatKes } from '../../api.js';
import { InventoryWorkflowPanels } from './InventoryWorkflowPanels.js';
import { can } from '../../permissions.js';
import { ProductImagePicker, ProductThumb } from '../../components/ProductImagePicker.js';

interface InventoryControllerDashboardProps {
  currentStore: Store;
  currentUser?: User | null;
  products: Product[];
  onRefreshProducts?: () => void;
}

type InvTab = 'CATALOGUE' | 'BULK_IMPORT' | 'BARCODES' | 'ADJUST_STOCK' | 'LOW_STOCK' | 'PROMOTIONS' | 'CYCLE_COUNT' | 'RECEIVE' | 'UNKNOWN' | 'APPROVALS' | 'LABELS';

function parseCsvRow(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { values.push(value.trim()); value = ''; }
    else value += char;
  }
  values.push(value.trim());
  return values;
}

export const InventoryControllerDashboard: React.FC<InventoryControllerDashboardProps> = ({
  currentStore,
  currentUser,
  products: initialProducts,
  onRefreshProducts,
}) => {
  const [activeTab, setActiveTab] = useState<InvTab>('CATALOGUE');
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New / Edit Product modal
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('Groceries');
  const [formBarcode, setFormBarcode] = useState('');
  const [formAliases, setFormAliases] = useState('');
  const [formVatRate, setFormVatRate] = useState('0');
  const [formPriceMinor, setFormPriceMinor] = useState('15000');
  const [formCompareAtPriceMinor, setFormCompareAtPriceMinor] = useState('');
  const [formStock, setFormStock] = useState('100');
  const [formIsWeighted, setFormIsWeighted] = useState(false);
  const [formPluCode, setFormPluCode] = useState('');
  const [formPricePerKgMinor, setFormPricePerKgMinor] = useState('');
  const [formRequiresSerializedTag, setFormRequiresSerializedTag] = useState(false);
  const [formHighTheft, setFormHighTheft] = useState(false);
  // Existing photo URL, or a freshly taken photo as a data URL (uploaded after the product is saved).
  const [formImage, setFormImage] = useState<string | null>(null);

  // Stock Adjustment modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState('');
  const [adjustQtyChange, setAdjustQtyChange] = useState('-2');
  const [adjustType, setAdjustType] = useState('DAMAGED');
  const [adjustReason, setAdjustReason] = useState('Damaged packaging found on aisle 3 shelf');

  // Bulk Import state
  const [bulkCsvText, setBulkCsvText] = useState(
    'barcode,name,category,price,vatRate,highTheft,compareAtPrice,aliases,pluCode'
  );
  const [importPreview, setImportPreview] = useState<{ items: any[]; errors: any[] } | null>(null);
  const [importing, setImporting] = useState(false);

  // Barcode Check state
  const [barcodeSearch, setBarcodeSearch] = useState('');
  const [foundBarcodeProduct, setFoundBarcodeProduct] = useState<Product | null>(null);

  // Cycle Count State
  const [cycleCounts, setCycleCounts] = useState<{ [productId: string]: number }>({});

  // Org catalogue library (items other branches registered; pull into this branch)
  const [catalogueItems, setCatalogueItems] = useState<any[] | null>(null);
  const [pulling, setPulling] = useState(false);
  const [submittingCycle, setSubmittingCycle] = useState(false);

  // Load products
  const loadProducts = async () => {
    try {
      setLoading(true);
      const res = await apiRequest(`/products?storeId=${currentStore._id}`);
      if (res?.products) {
        setProducts(res.products);
      }
    } catch (err: any) {
      console.warn(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [currentStore._id]);

  const loadCatalogue = async () => {
    try {
      const res = await apiRequest(`/products/catalogue?storeId=${currentStore._id}`);
      if (res?.success) setCatalogueItems(res.items || []);
    } catch { setCatalogueItems([]); }
  };

  useEffect(() => {
    if (activeTab === 'CATALOGUE') loadCatalogue();
  }, [activeTab, currentStore._id]);

  const pullFromCatalogue = async (ids?: string[]) => {
    try {
      setPulling(true);
      const res = await apiRequest('/products/from-catalogue', {
        method: 'POST',
        body: JSON.stringify({ storeId: currentStore._id, catalogueProductIds: ids }),
      });
      const sum = res?.summary || {};
      setStatusMsg({ type: sum.failed ? 'error' : 'success', text: `Catalogue pull complete: ${sum.added || 0} added to this branch, ${sum.skipped || 0} already present, ${sum.failed || 0} failed.` });
      loadCatalogue(); loadProducts();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Catalogue pull failed' });
    } finally { setPulling(false); }
  };

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.includes(searchQuery) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const offerProducts = products.filter((product) => product.compareAtPriceMinor && product.compareAtPriceMinor > product.priceMinor);
  // Stock controllers can add and describe products; only roles with pricing rights set or change prices.
  const canEditCatalogue = can(currentUser, 'inventory:write');
  const canSetPrices = can(currentUser, 'pricing:write');
  const canAdjustStock = can(currentUser, 'inventory:adjust');

  const handleOpenCreate = () => {
    setEditingProduct(null);
    setFormName('');
    setFormCategory('Groceries');
    setFormBarcode('');
    setFormAliases('');
    setFormVatRate('0');
    setFormPriceMinor('12000');
    setFormCompareAtPriceMinor('');
    setFormStock('100');
    setFormIsWeighted(false);
    setFormPluCode('');
    setFormPricePerKgMinor('');
    setFormRequiresSerializedTag(false);
    setFormHighTheft(false);
    setFormImage(null);
    setShowProductModal(true);
  };

  const handleOpenEdit = (prod: Product) => {
    setEditingProduct(prod);
    setFormName(prod.name);
    setFormCategory(prod.category);
    setFormBarcode(prod.barcode);
    setFormAliases((prod.barcodeAliases || []).join(', '));
    setFormVatRate(String((prod.vatRateBps || 0) / 100));
    setFormPriceMinor(prod.priceMinor.toString());
    setFormCompareAtPriceMinor(prod.compareAtPriceMinor ? prod.compareAtPriceMinor.toString() : '');
    setFormStock((prod.stock || 0).toString());
    setFormIsWeighted(prod.soldBy === 'weight' || !!prod.isWeighted);
    setFormPluCode(prod.pluCode || '');
    setFormPricePerKgMinor(prod.pricePerKgMinor === undefined ? '' : String(prod.pricePerKgMinor));
    setFormRequiresSerializedTag(!!prod.requiresSerializedTag);
    setFormHighTheft(!!prod.highTheft);
    setFormImage(prod.image || null);
    setShowProductModal(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let savedProductId: string | undefined = editingProduct?._id;
      if (editingProduct) {
        await apiRequest(`/products/${editingProduct._id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: formName,
            category: formCategory,
            barcode: formBarcode,
            barcodeAliases: (formAliases || '').split(',').map((value) => value.trim()).filter(Boolean),
            isWeighted: formIsWeighted,
            soldBy: formIsWeighted ? 'weight' : 'unit',
            pluCode: formPluCode.trim() || undefined,
            requiresSerializedTag: formRequiresSerializedTag,
            highTheft: formHighTheft,
            reason: 'Catalogue update by inventory manager',
          }),
        });
        const nextPricePerKg = formIsWeighted ? Number(formPricePerKgMinor) : undefined;
        if (canSetPrices && (Number(formPriceMinor) !== editingProduct.priceMinor || Math.round(Number(formVatRate) * 100) !== (editingProduct.vatRateBps || 0) || Number(formCompareAtPriceMinor || 0) !== (editingProduct.compareAtPriceMinor || 0) || (nextPricePerKg !== undefined && nextPricePerKg !== editingProduct.pricePerKgMinor))) {
          await apiRequest(`/products/${editingProduct._id}/price-change`, { method: 'POST', body: JSON.stringify({ priceMinor: Number(formPriceMinor), pricePerKgMinor: nextPricePerKg, compareAtPriceMinor: Number(formCompareAtPriceMinor) > Number(formPriceMinor) ? Number(formCompareAtPriceMinor) : null, vatRateBps: Math.round(Number(formVatRate) * 100), reason: 'Catalogue price and tax update' }) });
          setStatusMsg({ type: 'success', text: `Product details saved. Price and VAT changes are pending branch manager approval.` });
        } else setStatusMsg({ type: 'success', text: `Product "${formName}" updated successfully.` });
      } else {
        const created = await apiRequest('/products', {
          method: 'POST',
          body: JSON.stringify({
            storeId: currentStore._id,
            name: formName,
            category: formCategory,
            barcode: formBarcode,
            sku: `SKU-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
            priceMinor: Number(formPriceMinor),
            compareAtPriceMinor: Number(formCompareAtPriceMinor) > Number(formPriceMinor) ? Number(formCompareAtPriceMinor) : undefined,
            stock: 0,
            isWeighted: formIsWeighted,
            soldBy: formIsWeighted ? 'weight' : 'unit',
            pluCode: formPluCode.trim(),
            pricePerKgMinor: formIsWeighted ? Number(formPricePerKgMinor) : undefined,
            requiresSerializedTag: formRequiresSerializedTag,
            highTheft: formHighTheft,
            vatRateBps: Math.round(Number(formVatRate) * 100),
            barcodeAliases: (formAliases || '').split(',').map((value) => value.trim()).filter(Boolean),
          }),
        });
        savedProductId = created?.product?._id;
        setStatusMsg({
          type: 'success',
          text: created?.pendingApproval
            ? `"${formName}" was submitted for approval. It goes on sale once a catalogue manager approves it. Then add stock with Receive Stock.`
            : `Product "${formName}" created successfully.`,
        });
      }
      if (savedProductId && formImage?.startsWith('data:')) {
        try { await apiRequest(`/products/${savedProductId}/image`, { method: 'POST', body: JSON.stringify({ image: formImage }) }); }
        catch (imageError: any) { setStatusMsg({ type: 'error', text: `Product saved, but the photo could not be uploaded: ${imageError.message}` }); }
      }
      setShowProductModal(false);
      loadProducts();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to save product' });
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await apiRequest(`/products/${adjustProductId}/adjust-stock`, {
        method: 'POST',
        body: JSON.stringify({
          quantityChange: Number(adjustQtyChange),
          adjustmentType: adjustType,
          reason: adjustReason,
        }),
      });
      setStatusMsg({ type: 'success', text: result.pendingApproval ? 'This stock reduction is waiting for branch manager approval.' : `Stock adjusted by ${adjustQtyChange} successfully.` });
      setShowAdjustModal(false);
      loadProducts();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to adjust stock' });
    }
  };

  const handleBulkImport = async () => {
    try {
      setImporting(true);
      if (importPreview) {
        if (importPreview.errors.length) throw new Error('Resolve all preview errors before committing this catalogue import.');
        const result = await apiRequest('/products/bulk-import', { method: 'POST', body: JSON.stringify({ storeId: currentStore._id, products: importPreview.items }) });
        setStatusMsg({ type: result.summary?.failed ? 'error' : 'success', text: `Catalogue import complete: ${result.summary?.inserted || 0} added, ${result.summary?.updated || 0} updated, ${result.summary?.pendingPriceApprovals || 0} price approval(s), ${result.summary?.failed || 0} failed. Branch stock was not changed.` });
        setImportPreview(null); loadProducts(); return;
      }
      const lines = bulkCsvText.trim().split(/\r?\n/);
      if (lines.length < 2) throw new Error('CSV must contain a header and at least one item row');

      const headers = parseCsvRow(lines[0]).map((h) => h.trim().toLowerCase());
      const items = lines.slice(1).filter((line) => line.trim()).map((line) => {
        const cells = parseCsvRow(line);
        const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])) as Record<string, string>;
        return {
          barcode: row.barcode,
          name: row.name,
          category: row.category,
          priceMinor: Math.round(Number(row.price) * 100),
          vatRateBps: Math.round(Number(row.vatrate || 0) * 100),
          highTheft: String(row.hightheft).toLowerCase() === 'true',
          compareAtPriceMinor: row.compareatprice ? Math.round(Number(row.compareatprice) * 100) : undefined,
          barcodeAliases: (row.aliases || '').split('|').map((value) => value.trim()).filter(Boolean),
          pluCode: row.plucode || undefined,
        };
      });

      const res = await apiRequest('/products/bulk-import/preview', {
        method: 'POST',
        body: JSON.stringify({ storeId: currentStore._id, products: items }),
      });

      setImportPreview({ items: res.preview.valid, errors: res.preview.errors });
      setStatusMsg({ type: res.preview.errors.length ? 'error' : 'success', text: `Import preview: ${res.preview.valid.length} valid rows, ${res.preview.errors.length} issues. Review it before committing.` });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Bulk import failed' });
    } finally {
      setImporting(false);
    }
  };

  const handleBarcodeLookup = () => {
    const code = barcodeSearch.trim();
    const found = products.find((p) => p.barcode === code || (p.barcodeAliases || []).includes(code) || p.pluCode === code);
    setFoundBarcodeProduct(found || null);
  };

  const handleSubmitCycleCounts = async () => {
    try {
      setSubmittingCycle(true);
      const countsPayload = Object.entries(cycleCounts).map(([productId, countedStock]) => ({
        productId,
        countedStock,
        notes: 'Physical branch stock count',
      }));

      const result = await apiRequest('/products/stock-count', {
        method: 'POST',
        body: JSON.stringify({ storeId: currentStore._id, counts: countsPayload }),
      });

      const pending = (result.variances || []).filter((v: any) => v.pendingApproval).length;
      setStatusMsg({ type: 'success', text: pending ? `${pending} large stock variance(s) submitted for branch manager approval.` : 'Cycle count variances reconciled and recorded.' });
      loadProducts();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Failed to submit cycle counts' });
    } finally {
      setSubmittingCycle(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Stock Controller & Catalogue
            </span>
            <span className="text-xs text-slate-400">Inventory Desk • {currentStore.name}</span>
          </div>
          <h1 className="text-2xl font-black text-navy-800 mt-1">Catalogue, Barcodes & Stock Auditing</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Bulk CSV product onboarding, real-time inventory adjustments with reason tracking, barcode mapping, and physical cycle stock counts.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {canEditCatalogue && <button
            onClick={() => handleOpenCreate()}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>{canSetPrices ? 'Add New Product' : 'Propose New Product'}</span>
          </button>}
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between ${
            statusMsg.type === 'success'
              ? 'bg-brand-50 text-brand-800 border border-brand-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-slate-700">
            ×
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2 border-b border-slate-200">
        {[
          { id: 'CATALOGUE', label: `Catalogue (${products.length})`, icon: Boxes, permission: 'inventory:read' },
          { id: 'RECEIVE', label: 'Receive Stock', icon: Upload, permission: 'inventory:write' },
          { id: 'UNKNOWN', label: 'Unknown Barcodes', icon: Barcode, permission: 'inventory:read' },
          { id: 'APPROVALS', label: 'Approvals', icon: ShieldCheck, permission: 'inventory:approve' },
          { id: 'LABELS', label: 'Print Labels', icon: CheckCircle2, permission: 'inventory:read' },
          { id: 'BULK_IMPORT', label: 'Bulk CSV Import', icon: Upload, permission: 'pricing:write' },
          { id: 'BARCODES', label: 'Barcode Manager', icon: Barcode, permission: 'inventory:write' },
          { id: 'LOW_STOCK', label: 'Low Stock Alerts', icon: AlertTriangle, permission: 'inventory:read' },
          { id: 'PROMOTIONS', label: 'Offers & Promotions', icon: Tag, permission: 'offers:read' },
          { id: 'CYCLE_COUNT', label: 'Cycle Stock Count', icon: CheckCircle2, permission: 'inventory:adjust' },
        ].filter((tab) => can(currentUser, tab.permission || '')).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as InvTab)}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                isActive
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {(['RECEIVE', 'UNKNOWN', 'APPROVALS', 'LABELS'] as const).includes(activeTab as any) && <InventoryWorkflowPanels tab={activeTab as 'RECEIVE' | 'UNKNOWN' | 'APPROVALS' | 'LABELS'} store={currentStore} products={products} currentUser={currentUser} onRefresh={loadProducts} onMessage={setStatusMsg} />}

      {/* Tab 1: Catalogue CRUD */}
      {activeTab === 'CATALOGUE' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
          {catalogueItems && catalogueItems.length > 0 && (
            <div className="border border-amber-200 bg-amber-50/50 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-navy-800 uppercase tracking-wider">Org catalogue library</h4>
                  <p className="text-[11px] text-slate-500">Products registered by your other branches. Pulling one creates this branch's own price and stock — branches never share stock.</p>
                </div>
                <button onClick={() => pullFromCatalogue()} disabled={pulling} className="px-3 py-1.5 bg-amber-600 text-white rounded-xl text-[11px] font-bold disabled:opacity-50">
                  {pulling ? 'Pulling…' : 'Pull all missing'}
                </button>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto">
                {catalogueItems.filter((i) => !i.inBranch).slice(0, 60).map((item) => (
                  <div key={item._id} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-navy-800 truncate">{item.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{item.barcode} · {formatKes(item.priceMinor)}</p>
                    </div>
                    <button onClick={() => pullFromCatalogue([item._id])} disabled={pulling} className="ml-2 shrink-0 px-2 py-1 bg-navy-800 text-white rounded-lg text-[10px] font-bold">Add</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative max-w-sm w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search by name, barcode, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-amber-500"
              />
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => loadProducts()}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center space-x-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 uppercase font-black text-[10px]">
                  <th className="py-3 px-3">Product Name</th>
                  <th className="py-3 px-3">Barcode</th>
                  <th className="py-3 px-3">Category</th>
                  {can(currentUser, 'pricing:read') && <th className="py-3 px-3">Retail Price</th>}
                  <th className="py-3 px-3">In Stock</th>
                  <th className="py-3 px-3">Attributes</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((p) => (
                  <tr key={p._id} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-3">
                        <ProductThumb src={p.image} name={p.name} className="h-10 w-10" />
                        <div>
                          <span className="font-bold text-navy-800 block">{p.name}</span>
                          <span className="text-[11px] text-slate-400">SKU: {p.sku || 'N/A'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 font-mono text-slate-600 font-semibold">{p.barcode}</td>
                    <td className="py-3.5 px-3 text-slate-700 font-medium">{p.category}</td>
                    {can(currentUser, 'pricing:read') && <td className="py-3.5 px-3">
                      <span className="font-bold text-navy-800">{formatKes(p.priceMinor)}</span>
                      {p.compareAtPriceMinor && p.compareAtPriceMinor > p.priceMinor && (
                        <span className="text-[10px] text-rose-600 block">Offer · was {formatKes(p.compareAtPriceMinor)}</span>
                      )}
                      <span className="text-[10px] text-slate-400 block">v{p.priceVersion || 1}</span>
                    </td>}
                    <td className="py-3.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          (p.stock || 0) <= 15
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-navy-700'
                        }`}
                      >
                        {p.stock} units
                      </span>
                    </td>
                    <td className="py-3.5 px-3 space-x-1">
                      {(p.soldBy === 'weight' || p.isWeighted) && (
                        <span className="px-1.5 py-0.5 rounded bg-azure-100 text-azure-800 text-[10px] font-bold">
                          Scale Weighted
                        </span>
                      )}
                      {p.highTheft && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                          High-Theft
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-right space-x-2">
                      {canAdjustStock && <button
                        onClick={() => {
                          setAdjustProductId(p._id);
                          setShowAdjustModal(true);
                        }}
                        className="text-amber-700 hover:underline font-bold"
                      >
                        Adjust Stock
                      </button>}
                      {canEditCatalogue && <button
                        onClick={() => handleOpenEdit(p)}
                        className="text-azure-600 hover:underline font-bold"
                      >
                        Edit
                      </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Bulk CSV Import */}
      {activeTab === 'BULK_IMPORT' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
          <div>
            <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Bulk CSV Product Onboarding</h3>
            <p className="text-xs text-slate-500">
              Preview and validate catalogue changes before publishing. Stock is managed separately at each branch.
            </p>
          </div>

          <div className="border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">CSV columns: barcode, name, category, price, vatRate, highTheft, compareAtPrice, aliases, pluCode</span>
              <button
                onClick={() =>
                  (setBulkCsvText('barcode,name,category,price,vatRate,highTheft,compareAtPrice,aliases,pluCode'), setImportPreview(null))
                }
                className="text-azure-600 hover:underline font-semibold"
              >
                Clear Import
              </button>
            </div>

            <textarea
              value={bulkCsvText}
              onChange={(e) => setBulkCsvText(e.target.value)}
              className="w-full h-48 border border-slate-200 rounded-xl p-3 font-mono text-xs focus:outline-amber-500 bg-slate-50"
            />

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-navy-700"><Upload className="h-4 w-4"/>Choose catalogue CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setBulkCsvText(await file.text()); setImportPreview(null); event.target.value = ''; }} /></label>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-400">Target Store: {currentStore.name}</span>
              <button
                onClick={handleBulkImport}
                disabled={importing}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-xs"
              >
                {importing ? 'Validating…' : importPreview ? 'Commit Validated Import' : 'Preview Import'}
              </button>
            </div>
            {importPreview && <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs"><div className="flex items-center justify-between"><strong>Preview · {importPreview.items.length} valid rows · {importPreview.errors.length} errors</strong><button className="font-bold text-slate-500" onClick={() => setImportPreview(null)}>Discard preview</button></div>{importPreview.items.slice(0, 8).map((row, index) => <div key={`${row.barcode}-${index}`} className="flex justify-between border-t border-slate-100 py-2"><span className="font-mono">{row.barcode}</span><span>{row.name}</span><span>{row.action}</span><strong>{formatKes(row.priceMinor)}</strong></div>)}{importPreview.errors.map((error, index) => <p key={index} className="text-rose-700">Row {error.row} ({error.barcode || 'no barcode'}): {error.error}</p>)}</div>}
          </div>
        </div>
      )}

      {/* Tab 3: Barcodes */}
      {activeTab === 'BARCODES' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
          <div>
            <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Barcode Lookup & Duplicate Checker</h3>
            <p className="text-xs text-slate-500">Quickly scan or paste a barcode to inspect product mappings and prevent duplicate collisions.</p>
          </div>

          <div className="flex items-center space-x-2 max-w-md">
            <div className="relative flex-1">
              <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Scan or enter barcode (e.g. 616110001234)..."
                value={barcodeSearch}
                onChange={(e) => setBarcodeSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleBarcodeLookup()}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-mono"
              />
            </div>
            <button
              onClick={handleBarcodeLookup}
              className="px-4 py-2 bg-navy-800 hover:bg-navy-700 text-white rounded-xl text-xs font-bold"
            >
              Verify Barcode
            </button>
          </div>

          {foundBarcodeProduct ? (
            <div className="border border-brand-200 bg-brand-50/50 rounded-2xl p-5 space-y-3">
              <div className="flex items-center space-x-2 text-brand-800 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4 text-brand-600" />
                <span>Barcode Match Verified</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block">Product</span>
                  <strong className="text-navy-800">{foundBarcodeProduct.name}</strong>
                </div>
                {can(currentUser, 'pricing:read') && <div>
                  <span className="text-slate-400 block">Retail Price</span>
                  <strong className="text-navy-800">{formatKes(foundBarcodeProduct.priceMinor)}</strong>
                </div>}
                <div>
                  <span className="text-slate-400 block">Stock Level</span>
                  <strong className="text-navy-800">{foundBarcodeProduct.stock} units</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Security Tag</span>
                  <strong className="text-navy-800">
                    {foundBarcodeProduct.highTheft ? 'High Theft Protected' : 'Standard'}
                  </strong>
                </div>
              </div>
            </div>
          ) : barcodeSearch ? (
            <div className="border border-slate-200 rounded-2xl p-5 text-xs text-slate-500 text-center">
              No product currently mapped to barcode <span className="font-mono font-bold">{barcodeSearch}</span> in this branch.
            </div>
          ) : null}
        </div>
      )}

      {/* Tab 4: Low Stock Alerts */}
      {activeTab === 'LOW_STOCK' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Inventory Low-Stock Alerts</h3>
              <p className="text-xs text-slate-500">Products with ≤ 15 units remaining requiring urgent replenishment.</p>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {products
              .filter((p) => (p.stock || 0) <= 15)
              .map((p) => (
                <div key={p._id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <strong className="text-navy-800 block">{p.name}</strong>
                    <span className="text-slate-400 font-mono text-[11px]">{p.barcode}</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">
                      {p.stock} units left
                    </span>
                    <button
                      onClick={() => {
                        setActiveTab('RECEIVE');
                      }}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px]"
                    >
                      Receive Delivery
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Tab 5: Promotions */}
      {activeTab === 'PROMOTIONS' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Live product offers</h3>
              <p className="text-xs text-slate-500">Offer prices appear in the customer shop when a product’s was price is higher than its selling price.</p>
            </div>
            {canEditCatalogue && can(currentUser, 'offers:manage') && <button onClick={handleOpenCreate} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-amber-700">
              <Plus className="h-4 w-4" /> Add an offer product
            </button>}
          </div>

          {offerProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <Tag className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-bold text-navy-800">No live product offers</p>
              <p className="mt-1 text-xs text-slate-500">Add a product or edit one in the catalogue, then enter a was price above its selling price.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {offerProducts.map((product) => (
                <article key={product._id} className="flex items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50/50 p-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white text-2xl">
                    {product.image ? <img src={product.image} alt="" className="h-full w-full object-cover" /> : '🏷️'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-navy-800">{product.name}</p>
                    {can(currentUser, 'pricing:read') && <p className="mt-1 text-[11px] text-rose-700"><strong>{formatKes(product.priceMinor)}</strong> <span className="text-slate-400 line-through">{formatKes(product.compareAtPriceMinor!)}</span></p>}
                    <p className="text-[10px] font-semibold text-slate-500">{product.category} · {product.stock} in stock</p>
                  </div>
                  {canEditCatalogue && can(currentUser, 'offers:manage') && <button onClick={() => handleOpenEdit(product)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-bold text-navy-700 hover:border-brand-300 hover:text-brand-700">Edit</button>}
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 6: Cycle Count */}
      {activeTab === 'CYCLE_COUNT' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Physical Cycle Stock Count</h3>
              <p className="text-xs text-slate-500">Count physical stock on shelves, compare with expected levels, and post variance audit entries.</p>
            </div>
            <button
              onClick={handleSubmitCycleCounts}
              disabled={submittingCycle || Object.keys(cycleCounts).length === 0}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs"
            >
              {submittingCycle ? 'Submitting...' : 'Post Stock Count Reconciliation'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 uppercase font-black text-[10px]">
                  <th className="py-3 px-3">Product Name</th>
                  <th className="py-3 px-3">Barcode</th>
                  <th className="py-3 px-3">System Expected</th>
                  <th className="py-3 px-3">Physical Observed Count</th>
                  <th className="py-3 px-3 text-right">Count Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.slice(0, 8).map((p) => {
                  const counted = cycleCounts[p._id] !== undefined ? cycleCounts[p._id] : p.stock;
                  const variance = counted - (p.stock || 0);
                  return (
                    <tr key={p._id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-3 font-bold text-navy-800">{p.name}</td>
                      <td className="py-3 px-3 font-mono text-slate-500">{p.barcode}</td>
                      <td className="py-3 px-3 font-bold text-slate-700">{p.stock} units</td>
                      <td className="py-3 px-3">
                        <input
                          type="number"
                          defaultValue={p.stock}
                          onChange={(e) =>
                            setCycleCounts((prev) => ({
                              ...prev,
                              [p._id]: Number(e.target.value),
                            }))
                          }
                          className="w-24 border border-slate-200 rounded-lg p-1.5 font-bold text-navy-800 text-xs"
                        />
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`font-bold ${
                            variance === 0
                              ? 'text-slate-400'
                              : variance > 0
                              ? 'text-brand-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {variance > 0 ? `+${variance}` : variance}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Product Create / Edit Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-navy-800/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-navy-800 text-sm">
                {editingProduct ? (canSetPrices ? 'Edit Product & Price' : 'Edit Product Details') : canSetPrices ? 'Add New Product' : 'Propose New Product'}
              </h3>
              <button onClick={() => setShowProductModal(false)} className="text-slate-400 hover:text-slate-700 text-lg">
                ×
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Product Title</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 font-semibold"
                  required
                />
              </div>

              <ProductImagePicker value={formImage} onChange={setFormImage} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Category</label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Barcode</label>
                  <input
                    type="text"
                    value={formBarcode}
                    onChange={(e) => setFormBarcode(e.target.value)}
                    disabled={Boolean(editingProduct) && !canSetPrices}
                    className="w-full border border-slate-200 rounded-xl p-2.5 font-mono disabled:bg-slate-50 disabled:text-slate-400"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">{canSetPrices ? 'Selling price (KES)' : editingProduct ? 'Selling price (KES)' : 'Proposed selling price (KES)'}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={(Number(formPriceMinor) / 100).toFixed(2)}
                    onChange={(e) => setFormPriceMinor(String(Math.round(Number(e.target.value) * 100)))}
                    disabled={Boolean(editingProduct) && !canSetPrices}
                    className="w-full border border-slate-200 rounded-xl p-2.5 font-bold disabled:bg-slate-50 disabled:text-slate-400"
                    required
                  />
                  <span className="text-[10px] text-slate-400">
                    {canSetPrices
                      ? 'This is the price customers pay.'
                      : editingProduct
                        ? 'Prices are changed by a catalogue manager.'
                        : 'A catalogue manager approves the product and its price before it goes on sale.'}
                  </span>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Branch stock</label>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-bold text-slate-600">{editingProduct ? `${editingProduct.stock} units` : '0 · add stock through Receive Stock'}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="font-bold text-slate-700">VAT rate (%)<input type="number" min="0" max="100" step="0.01" value={formVatRate} onChange={(e) => setFormVatRate(e.target.value)} disabled={Boolean(editingProduct) && !canSetPrices} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-normal disabled:bg-slate-50 disabled:text-slate-400" /></label>
                <label className="font-bold text-slate-700">Additional barcodes<input type="text" value={formAliases} onChange={(e) => setFormAliases(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-mono font-normal" placeholder="Comma-separated" /></label>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Was price (KES, optional)</label>
                <input
                  type="number"
                  min={(Number(formPriceMinor) + 1) / 100}
                  step="0.01"
                  value={formCompareAtPriceMinor ? (Number(formCompareAtPriceMinor) / 100).toFixed(2) : ''}
                  onChange={(e) => setFormCompareAtPriceMinor(e.target.value ? String(Math.round(Number(e.target.value) * 100)) : '')}
                  disabled={Boolean(editingProduct) && !canSetPrices}
                  className="w-full border border-slate-200 rounded-xl p-2.5 disabled:bg-slate-50 disabled:text-slate-400"
                  placeholder="Leave blank when not on offer"
                />
                <span className="text-[10px] text-slate-400">Must be higher than the selling price to display an offer.</span>
              </div>

              <div className="pt-1 space-y-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsWeighted}
                    disabled={Boolean(editingProduct) && !canSetPrices}
                    onChange={(e) => setFormIsWeighted(e.target.checked)}
                    className="rounded text-amber-600"
                  />
                  <span className="text-slate-700">Produce item weighed at scale (tomatoes, meat, onions)</span>
                </label>
                {formIsWeighted && (
                  <div className="grid grid-cols-2 gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <label className="font-bold text-slate-700">Scale PLU code
                      <input value={formPluCode} onChange={(e) => setFormPluCode(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-mono font-normal" required />
                    </label>
                    <label className="font-bold text-slate-700">Price per kg (minor units)
                      <input type="number" min="1" step="1" value={formPricePerKgMinor} onChange={(e) => setFormPricePerKgMinor(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-normal" required />
                    </label>
                    <p className="col-span-2 text-[10px] text-slate-500">Enter price in cents/minor units (for example, KES 250/kg = 25000).</p>
                  </div>
                )}
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" checked={formRequiresSerializedTag} onChange={(e) => setFormRequiresSerializedTag(e.target.checked)} className="rounded text-violet-600" />
                  <span className="text-slate-700">Require a unique RFID/tag serial for each item</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formHighTheft}
                    onChange={(e) => setFormHighTheft(e.target.checked)}
                    className="rounded text-rose-600"
                  />
                  <span className="text-slate-700">High-Theft Item (Whiskey, Baby formula, Cosmetics)</span>
                </label>
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 shadow-xs"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-navy-800/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-navy-800 text-sm">Stock Level Adjustment</h3>
              <button onClick={() => setShowAdjustModal(false)} className="text-slate-400 hover:text-slate-700 text-lg">
                ×
              </button>
            </div>

            <form onSubmit={handleAdjustStock} className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Quantity Change (e.g. +20 or -3)</label>
                <input
                  type="text"
                  value={adjustQtyChange}
                  onChange={(e) => setAdjustQtyChange(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 font-bold"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Reason Category</label>
                <select
                  value={adjustType}
                  onChange={(e) => setAdjustType(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-white font-medium"
                >
                  <option value="DAMAGED">Damaged Goods on Shelf</option>
                  <option value="EXPIRED">Expired Shelf Stock</option>
                  <option value="THEFT">Shrinkage / Confirmed Theft</option>
                  <option value="CYCLE_COUNT">Cycle Count Discrepancy</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Mandatory Audit Note</label>
                <textarea
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Provide detailed justification for audit trail..."
                  className="w-full border border-slate-200 rounded-xl p-2.5"
                  rows={2}
                  required
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 shadow-xs"
                >
                  Post Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};



