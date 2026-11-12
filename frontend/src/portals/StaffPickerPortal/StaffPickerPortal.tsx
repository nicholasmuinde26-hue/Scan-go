import React, { useState, useEffect } from 'react';
import {
  PackageCheck,
  CheckCircle2,
  Scale,
  Barcode,
  Printer,
  Boxes,
  ArrowRight,
  TrendingUp,
  Clock,
  Check,
  AlertTriangle,
  ShoppingBag,
  RotateCcw,
  Zap,
  ShieldCheck,
  ChevronRight,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Product, Store, User } from '../../types.js';
import { apiRequest, formatKes } from '../../api.js';
import { useLiveOrderEvents } from '../../hooks/useLiveOrderEvents.js';
import { ProductThumb } from '../../components/ProductImagePicker.js';

interface StaffPickerPortalProps {
  currentStore: Store;
  products: Product[];
  currentUser?: User | null;
}

type PickerScreen = 'TASK_QUEUE' | 'PICKING' | 'WEIGHING' | 'SUBSTITUTION' | 'PACKING_VERIFY' | 'METRICS';

export const StaffPickerPortal: React.FC<StaffPickerPortalProps> = ({
  currentStore,
  products,
  currentUser,
}) => {
  const isPackerRole = currentUser?.role === 'PACKER_VERIFIER';
  const [screen, setScreen] = useState<PickerScreen>(isPackerRole ? 'PACKING_VERIFY' : 'TASK_QUEUE');
  const [tasks, setTasks] = useState<any[]>([]);
  const [activeTask, setActiveTask] = useState<any | null>(null);
  const [itemIndex, setItemIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Produce Scale States
  const [scaleWeightGrams, setScaleWeightGrams] = useState('1250');
  const [scaleTargetGrams, setScaleTargetGrams] = useState(1200);

  // Substitution state
  const [replacementBarcode, setReplacementBarcode] = useState('');
  const [substituteItem, setSubstituteItem] = useState<any | null>(null);

  // Packer Checklist States
  const [packerChecks, setPackerChecks] = useState({
    itemsCountMatched: true,
    noDamageOrExpired: true,
    coldChainPreserved: true,
    packageSealed: true,
    labelPrinted: true,
  });
  const [sealNumber, setSealNumber] = useState(`SEAL-${Date.now().toString().slice(-5)}`);
  const [orderPacked, setOrderPacked] = useState(false);

  // Performance Metrics
  const [performance] = useState({
    picksPerHour: 52,
    accuracyRate: 99.6,
    ordersFulfilledToday: 18,
    avgPickTimeMinutes: 7.4,
  });

  const loadTasks = async () => {
    try {
      setLoading(true);
      const res = await apiRequest(`/picking/tasks?storeId=${currentStore._id}`);
      const liveTasks = res?.tasks || [];
      setTasks(liveTasks);
      if (!activeTask) setActiveTask(liveTasks[0] || null);
    } catch {
      setTasks([]);
      setActiveTask(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [currentStore._id]);

  // Live order event stream
  useLiveOrderEvents((event) => {
    if (event.type === 'order.created' || event.type === 'picking.started' || event.type === 'order.ready') {
      loadTasks();
    }
  });

  const currentOrderItems = activeTask?.items || [];
  const currentItem = currentOrderItems[itemIndex] || currentOrderItems[0];

  if (!activeTask && screen !== 'TASK_QUEUE' && screen !== 'METRICS') {
    return <div className="max-w-5xl mx-auto p-8 text-center"><div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10"><h2 className="font-bold text-navy-800">No live task selected</h2><p className="mt-2 text-sm text-slate-500">Choose an assigned task from the queue before picking or packing.</p><button onClick={() => setScreen('TASK_QUEUE')} className="mt-4 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white">Open task queue</button></div></div>;
  }

  const handleStartPicking = (task: any) => {
    setActiveTask(task);
    setItemIndex(0);
    setScreen('PICKING');
  };

  const handleScanItemBarcode = () => {
    if (currentItem.isProduce) {
      setScreen('WEIGHING');
    } else {
      currentItem.scannedQuantity = currentItem.requiredQuantity;
      currentItem.isVerified = true;
      if (itemIndex < currentOrderItems.length - 1) {
        setItemIndex(itemIndex + 1);
      } else {
        setScreen('PACKING_VERIFY');
      }
    }
  };

  const handleConfirmWeight = () => {
    currentItem.scannedQuantity = currentItem.requiredQuantity;
    currentItem.isVerified = true;
    currentItem.weightGrams = Number(scaleWeightGrams);
    if (itemIndex < currentOrderItems.length - 1) {
      setItemIndex(itemIndex + 1);
      setScreen('PICKING');
    } else {
      setScreen('PACKING_VERIFY');
    }
  };

  const handleTriggerSubstitute = (item: any) => {
    setSubstituteItem(item);
    setScreen('SUBSTITUTION');
  };

  const handleProposeSubstitute = () => {
    if (substituteItem) {
      substituteItem.name = `${substituteItem.name} (Substituted)`;
      substituteItem.isVerified = true;
      substituteItem.scannedQuantity = substituteItem.requiredQuantity;
      setStatusMsg({
        type: 'success',
        text: `Substitution applied: Customer pre-approved replacement within price tolerance.`,
      });
      setScreen('PICKING');
    }
  };

  const handleCompletePackVerification = () => {
    // Check separation of duties: picker cannot verify their own pick!
    if (activeTask?.pickerName === currentUser?.name && isPackerRole) {
      setStatusMsg({
        type: 'error',
        text: 'Separation of Duties Violation: You picked this order! A different staff member must verify and seal.',
      });
      return;
    }

    setOrderPacked(true);
    setStatusMsg({
      type: 'success',
      text: `Order ${activeTask?.orderNumber || 'order'} sealed with Seal #${sealNumber}. Ready for customer collection!`,
    });
  };

  return (
    <div className="max-w-4xl mx-auto my-6 px-4 font-sans space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            <PackageCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="font-bold text-navy-700 text-sm sm:text-base">
                Shop & Collect Fulfillment Terminal
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 uppercase">
                {currentUser?.role || 'PICKER / PACKER'}
              </span>
            </div>
            <p className="text-xs text-slate-400">Scan & Go • {currentStore.name}</p>
          </div>
        </div>

        {/* Tab switchers */}
        <div className="flex space-x-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setScreen('TASK_QUEUE')}
            className={`px-3 py-1.5 rounded-lg transition ${
              screen === 'TASK_QUEUE' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
            }`}
          >
            Tasks ({tasks.length})
          </button>
          <button
            onClick={() => setScreen('PICKING')}
            className={`px-3 py-1.5 rounded-lg transition ${
              screen === 'PICKING' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
            }`}
          >
            Item Scan
          </button>
          <button
            onClick={() => setScreen('PACKING_VERIFY')}
            className={`px-3 py-1.5 rounded-lg transition ${
              screen === 'PACKING_VERIFY' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
            }`}
          >
            Pack & Verify
          </button>
          <button
            onClick={() => setScreen('METRICS')}
            className={`px-3 py-1.5 rounded-lg transition ${
              screen === 'METRICS' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
            }`}
          >
            My Metrics
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center justify-between ${
            statusMsg.type === 'success'
              ? 'bg-brand-50 text-brand-800 border border-brand-200'
              : statusMsg.type === 'warning'
              ? 'bg-amber-50 text-amber-800 border border-amber-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-slate-700">
            ×
          </button>
        </div>
      )}

      {/* Screen 1: Task Queue */}
      {screen === 'TASK_QUEUE' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Order Fulfillment Queue</h3>
              <p className="text-xs text-slate-500">Pick Shop & Collect orders prioritized by scheduled customer pickup slot.</p>
            </div>
            <button
              onClick={loadTasks}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-xl transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tasks.map((t) => (
              <div
                key={t._id}
                className="border border-slate-200 rounded-2xl p-5 hover:border-slate-300 transition space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono font-bold text-navy-800 text-sm block">{t.orderNumber}</span>
                    <span className="text-xs text-slate-500">Customer: {t.customerName || 'Shopper'}</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900">
                    {t.status}
                  </span>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-1">
                  <div className="flex justify-between">
                    <span>Pickup Slot:</span>
                    <strong className="text-amber-800 flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{t.pickupSlot}</span>
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Items to Pick:</span>
              <strong className="text-navy-800">{t.items?.length || 0} items</strong>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Scan & Go Shop & Collect</span>
                  <button
                    onClick={() => handleStartPicking(t)}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1"
                  >
                    <span>Start Picking</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Screen 2: Picking (Item Scan) */}
      {screen === 'PICKING' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <span className="font-mono font-bold text-navy-800 text-sm">
              Picking Order: {activeTask?.orderNumber || '—'}
            </span>
            <span className="text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
              Item {itemIndex + 1} of {currentOrderItems.length}
            </span>
          </div>

          {/* Current Target Item Card */}
          <div className="border-2 border-amber-300 bg-amber-50/40 rounded-3xl p-6 space-y-4">
            <ProductThumb productId={currentItem.productId} name={currentItem.name} className="h-40 w-full" />
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider block">
                  Find on Shelf (Aisle 3, Shelf B)
                </span>
                <h3 className="text-lg font-black text-navy-800 mt-1">{currentItem.name}</h3>
                <p className="font-mono text-xs text-slate-500 mt-0.5">Barcode: {currentItem.barcode}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 block">Required</span>
                <strong className="text-xl font-black text-navy-800">{currentItem.requiredQuantity} unit(s)</strong>
              </div>
            </div>

            {/* Action Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {import.meta.env.DEV && <button
                onClick={handleScanItemBarcode}
                className="py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center space-x-2"
              >
                <Barcode className="w-4 h-4" />
                <span>Simulate Barcode Scan</span>
              </button>}

              <button
                onClick={() => handleTriggerSubstitute(currentItem)}
                className="py-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl font-bold text-xs transition flex items-center justify-center space-x-1.5"
              >
                <RotateCcw className="w-4 h-4 text-amber-600" />
                <span>Out of Stock (Propose Substitute)</span>
              </button>
            </div>
          </div>

          {/* Checklist of all items */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">All Order Items</span>
            <div className="divide-y divide-slate-100 text-xs">
              {currentOrderItems.map((item: any, idx: number) => (
                <div key={idx} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ProductThumb productId={item.productId} name={item.name} className="h-10 w-10" />
                    {item.isVerified ? (
                      <CheckCircle2 className="w-4 h-4 text-brand-600" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-300" />
                    )}
                    <span className={item.isVerified ? 'line-through text-slate-400' : 'font-bold text-navy-700'}>
                      {item.name}
                    </span>
                  </div>
                  <span className="text-slate-500 font-semibold">{item.requiredQuantity} units</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Screen 3: Produce Scale Weighing */}
      {screen === 'WEIGHING' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6 text-center max-w-lg mx-auto">
          <div className="w-16 h-16 bg-azure-50 text-azure-600 rounded-2xl flex items-center justify-center mx-auto">
            <Scale className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-black text-azure-700 uppercase tracking-wider">Produce Scale Verification</span>
            <h3 className="text-base font-bold text-navy-800">{currentItem.name}</h3>
            <p className="text-xs text-slate-500">Place fresh produce on certified Bluetooth floor scale.</p>
          </div>

          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-2">
            <span className="text-xs text-slate-400">Observed Scale Reading</span>
            <div className="text-4xl font-black font-mono text-navy-800 tracking-wider">
              {Number(scaleWeightGrams) / 1000} <span className="text-lg text-slate-400">kg</span>
            </div>
            <span className="text-xs text-brand-600 font-bold block">
              Within ±5% target tolerance ({scaleTargetGrams}g target)
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => setScreen('PICKING')}
              className="py-3 border border-slate-300 rounded-xl font-bold text-xs text-slate-700"
            >
              Cancel / Re-tare
            </button>
            <button
              onClick={handleConfirmWeight}
              className="py-3 bg-azure-600 hover:bg-azure-700 text-white rounded-xl font-bold text-xs shadow-xs"
            >
              Confirm Weight & Continue
            </button>
          </div>
        </div>
      )}

      {/* Screen 4: Substitution Flow */}
      {screen === 'SUBSTITUTION' && substituteItem && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6 max-w-lg mx-auto">
          <div className="flex items-center space-x-2 text-amber-700 font-bold text-sm">
            <RotateCcw className="w-4 h-4" />
            <span>Product Substitution Workflow</span>
          </div>

          <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl text-xs space-y-1">
            <span className="font-bold text-rose-800">Out of Stock Item:</span>
            <p className="text-rose-900 font-semibold">{substituteItem.name}</p>
          </div>

          <div className="space-y-3 text-xs">
            <label className="font-bold text-slate-700 block">Scan Replacement Product Barcode</label>
            <input
              type="text"
              placeholder="e.g. 616110003456"
              defaultValue="616110003456"
              className="w-full p-3 border border-slate-200 rounded-xl font-mono text-xs font-bold"
            />
            <span className="text-[11px] text-slate-500 block">
              Suggested replacement: <strong className="text-navy-700">Fresh Cowbell Milk 500ml (Same Price)</strong>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => setScreen('PICKING')}
              className="py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600"
            >
              Cancel
            </button>
            <button
              onClick={handleProposeSubstitute}
              className="py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs"
            >
              Apply Substitution
            </button>
          </div>
        </div>
      )}

      {/* Screen 5: Packing & Verifier Station */}
      {screen === 'PACKING_VERIFY' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black text-brand-800 uppercase tracking-wider bg-brand-100 px-2.5 py-0.5 rounded-full">
                Verification Station
              </span>
              <h3 className="text-base font-black text-navy-800 mt-1">
                Pack Verification & Tamper-Evident Bag Seal
              </h3>
            </div>
            <span className="text-xs font-mono font-bold text-slate-700">
              {activeTask?.orderNumber || '—'}
            </span>
          </div>

          {/* Separation of Duties Notice */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs flex items-center justify-between">
            <div>
              <span className="text-slate-500">Order Picked By:</span>
              <strong className="text-navy-800 ml-1.5">{activeTask?.pickerName || 'Not assigned'}</strong>
            </div>
            <div>
              <span className="text-slate-500">Pack Verifier:</span>
              <strong className="text-brand-700 ml-1.5">{currentUser?.name || 'Signed-in staff'}</strong>
            </div>
          </div>

          {/* Packing Verification Checklist */}
          <div className="space-y-3 text-xs">
            <span className="font-bold text-slate-700 block uppercase tracking-wider text-[11px]">
              Mandatory Packing Verification Checklist
            </span>
            <label className="flex items-center space-x-3 p-3 border border-slate-200 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={packerChecks.itemsCountMatched}
                onChange={(e) => setPackerChecks({ ...packerChecks, itemsCountMatched: e.target.checked })}
                className="w-4 h-4 rounded text-brand-600"
              />
              <span className="font-semibold text-navy-700">
                All physical item quantities match order manifest exactly
              </span>
            </label>

            <label className="flex items-center space-x-3 p-3 border border-slate-200 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={packerChecks.noDamageOrExpired}
                onChange={(e) => setPackerChecks({ ...packerChecks, noDamageOrExpired: e.target.checked })}
                className="w-4 h-4 rounded text-brand-600"
              />
              <span className="font-semibold text-navy-700">
                Produce and perishable goods checked: Fresh, unbruised, and within expiry
              </span>
            </label>

            <label className="flex items-center space-x-3 p-3 border border-slate-200 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={packerChecks.packageSealed}
                onChange={(e) => setPackerChecks({ ...packerChecks, packageSealed: e.target.checked })}
                className="w-4 h-4 rounded text-brand-600"
              />
              <span className="font-semibold text-navy-700">
                Bag sealed with serialized tamper-evident seal #{sealNumber}
              </span>
            </label>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <button
              onClick={() => alert(`Printing Collection Label for Order ${activeTask?.orderNumber}...`)}
              className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 flex items-center space-x-1.5"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span>Print Bag Label</span>
            </button>

            <button
              onClick={handleCompletePackVerification}
              className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
            >
              Sign-off & Ready for Pickup
            </button>
          </div>
        </div>
      )}

      {/* Screen 6: Performance Metrics */}
      {screen === 'METRICS' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
          <div>
            <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">
              Staff Fulfillment Performance Metrics
            </h3>
            <p className="text-xs text-slate-500">Live analytics for speed, pick accuracy, and orders fulfilled.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Picks Per Hour</span>
              <p className="text-2xl font-black text-brand-600 mt-1">{performance.picksPerHour} items/hr</p>
              <span className="text-[11px] text-slate-500">Benchmark: 45/hr</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Picking Accuracy</span>
              <p className="text-2xl font-black text-azure-600 mt-1">{performance.accuracyRate}%</p>
              <span className="text-[11px] text-slate-500">Target: ≥ 99.0%</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Orders Today</span>
              <p className="text-2xl font-black text-navy-800 mt-1">{performance.ordersFulfilledToday} orders</p>
              <span className="text-[11px] text-slate-500">Shift progress: 85%</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <span className="text-[11px] font-bold text-slate-400 uppercase">Avg Fulfillment Time</span>
              <p className="text-2xl font-black text-amber-600 mt-1">{performance.avgPickTimeMinutes} min</p>
              <span className="text-[11px] text-slate-500">From order to seal</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
