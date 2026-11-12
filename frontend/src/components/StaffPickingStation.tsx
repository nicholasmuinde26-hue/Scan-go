import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  Scan,
  Scale,
  PackageCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Boxes,
  HandMetal,
  Check,
} from 'lucide-react';
import { PickingTask, Product } from '../types.js';
import { apiRequest, formatKes } from '../api.js';
import { useLiveOrderEvents } from '../hooks/useLiveOrderEvents.js';

interface StaffPickingStationProps {
  products: Product[];
  onRefreshData?: () => void;
}

export const StaffPickingStation: React.FC<StaffPickingStationProps> = ({ products, onRefreshData }) => {
  const [tasks, setTasks] = useState<PickingTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<PickingTask | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scaleWeight, setScaleWeight] = useState('');
  const [selectedProduceItem, setSelectedProduceItem] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(
    null
  );

  // Dual Packing inputs
  const [sealNumber, setSealNumber] = useState(`SEAL-${Math.floor(1000 + Math.random() * 9000)}`);
  const [bagCount, setBagCount] = useState(1);
  const [packingNotes, setPackingNotes] = useState('All shelf goods counted and sealed');

  // Customer Pickup Handover input
  const [handoverOtp, setHandoverOtp] = useState('');

  // Fetch Picking Tasks
  const loadTasks = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/picking/tasks');
      if (res?.tasks) {
        setTasks(res.tasks);
        if (selectedTask) {
          const updated = res.tasks.find((t: any) => t._id === selectedTask._id);
          if (updated) setSelectedTask(updated);
        } else if (res.tasks.length > 0) {
          setSelectedTask(res.tasks[0]);
        }
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  // Real-time live picking queue updates
  useLiveOrderEvents((event) => {
    if (
      event.type === 'order.paid' ||
      event.type === 'order.created' ||
      event.type === 'substitution.responded'
    ) {
      loadTasks();
      if (event.type === 'substitution.responded') {
        setStatusMessage({
          type: 'success',
          text: `Customer ${event.payload?.decision} substitution for ${event.payload?.itemName || 'item'}. Queue updated!`,
        });
      }
    }
  });

  // Scan product barcode on shelf
  const handleScanShelfItem = async (barcode: string) => {
    if (!selectedTask) return;
    try {
      setStatusMessage(null);
      setLoading(true);
      const res = await apiRequest(`/picking/tasks/${selectedTask.orderId?._id || selectedTask.orderId}/scan-item`, {
        method: 'POST',
        body: JSON.stringify({ barcode }),
      });

      setStatusMessage({
        type: 'success',
        text: `Picked item: ${res.scannedItem.name} (${res.scannedItem.scannedQuantity}/${res.scannedItem.requiredQuantity})`,
      });
      setBarcodeInput('');
      await loadTasks();
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  // Record Produce Scale Weight
  const handleWeighProduce = async () => {
    if (!selectedTask || !selectedProduceItem || !scaleWeight) return;
    try {
      setLoading(true);
      const grams = parseInt(scaleWeight, 10);
      await apiRequest(`/picking/tasks/${selectedTask.orderId?._id || selectedTask.orderId}/weigh-item`, {
        method: 'POST',
        body: JSON.stringify({ productId: selectedProduceItem.productId, actualWeightGrams: grams }),
      });

      setStatusMessage({
        type: 'success',
        text: `Produce scale recorded: ${selectedProduceItem.name} = ${grams}g`,
      });
      setSelectedProduceItem(null);
      setScaleWeight('');
      await loadTasks();
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Dual Verification & Seal Packing
  const handleVerifyAndPack = async () => {
    if (!selectedTask) return;
    try {
      setLoading(true);
      await apiRequest(`/picking/tasks/${selectedTask.orderId?._id || selectedTask.orderId}/verify-pack`, {
        method: 'POST',
        body: JSON.stringify({
          packageSealNumber: sealNumber,
          totalBagsOrContainers: bagCount,
          notes: packingNotes,
        }),
      });

      setStatusMessage({
        type: 'success',
        text: `Order verified, packed into ${bagCount} bag(s) with ${sealNumber}. Ready for pickup!`,
      });
      await loadTasks();
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Customer Pickup Handover
  const handleAuthorizeHandover = async () => {
    if (!selectedTask) return;
    try {
      setLoading(true);
      await apiRequest(`/picking/tasks/${selectedTask.orderId?._id || selectedTask.orderId}/handover`, {
        method: 'POST',
        body: JSON.stringify({ collectionCode: handoverOtp }),
      });

      setStatusMessage({
        type: 'success',
        text: `Handover authorized! Order marked as COLLECTED.`,
      });
      setHandoverOtp('');
      await loadTasks();
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const currentOrder = selectedTask?.orderId;
  const allPicked = selectedTask?.items?.every(
    (i) => i.isVerified || i.status === 'SUBSTITUTED' || i.status === 'OUT_OF_STOCK'
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-950/60 to-navy-700 border border-amber-500/30 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
                <ClipboardList className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-white">Staff Fulfillment & Physical Picking Dashboard</h2>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Fulfill customer pre-orders. Scan shelf barcodes to verify items, record produce weights, and complete dual-employee packing.
            </p>
          </div>

          <button
            onClick={loadTasks}
            className="bg-navy-700 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-semibold"
          >
            Refresh Queue
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium ${
            statusMessage.type === 'success'
              ? 'bg-brand-950/40 border-brand-500/40 text-brand-300'
              : statusMessage.type === 'warning'
              ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {statusMessage.type === 'error' ? (
              <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-brand-400 flex-shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white">
            ×
          </button>
        </div>
      )}

      {/* Main Grid: Queue (4 cols) & Active Picking Task (8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Orders Queue (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-navy-700/80 border border-slate-700/80 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex justify-between items-center border-b border-slate-700/80 pb-2">
              <h3 className="font-bold text-sm text-white">Picking & Packing Queue</h3>
              <span className="bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full font-bold">
                {tasks.length} active
              </span>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {tasks.map((task) => {
                const isSelected = selectedTask?._id === task._id;
                const order = task.orderId;
                return (
                  <button
                    key={task._id}
                    onClick={() => setSelectedTask(task)}
                    className={`w-full text-left p-3 rounded-xl border transition space-y-1.5 ${
                      isSelected
                        ? 'bg-amber-950/30 border-amber-500/50 ring-1 ring-amber-500/40'
                        : 'bg-navy-800/60 border-slate-700/70 hover:bg-slate-700/40'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs text-white">{order?.orderNumber || 'Order'}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-navy-700 text-slate-300 border border-slate-700">
                        {task.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 flex justify-between">
                      <span>{task.items?.length || 0} items to pick</span>
                      <span className="text-brand-400 font-bold">{formatKes(order?.totalMinor || 0)}</span>
                    </div>

                    <div className="text-[10px] text-slate-400">
                      Slot: {order?.pickupSlot?.timeWindow || 'Express'}
                    </div>
                  </button>
                );
              })}

              {tasks.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-6">No picking tasks pending.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Active Task Details & Scanning View (8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {selectedTask && currentOrder ? (
            <div className="bg-navy-700/80 border border-slate-700/80 rounded-2xl p-5 shadow-sm space-y-5">
              {/* Task Header Details */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-700/80 pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-lg font-bold text-white">{currentOrder.orderNumber}</span>
                    <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs px-2 py-0.5 rounded font-semibold uppercase">
                      {selectedTask.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Slot: {currentOrder.pickupSlot?.date} ({currentOrder.pickupSlot?.timeWindow}) • {selectedTask.items.length} unique products
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Total Value</span>
                  <span className="text-base font-bold text-brand-400">{formatKes(currentOrder.totalMinor)}</span>
                </div>
              </div>

              {/* Barcode Scanner Tool for Pickers */}
              <div className="bg-navy-800/80 border border-slate-700 rounded-xl p-4 space-y-3">
                <h4 className="font-semibold text-xs text-slate-300 flex items-center space-x-2">
                  <Scan className="w-4 h-4 text-amber-400" />
                  <span>Shelf Barcode Scanner (Verification required for each unit)</span>
                </h4>

                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="Scan shelf product barcode..."
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && barcodeInput) {
                        handleScanShelfItem(barcodeInput);
                      }
                    }}
                    className="flex-1 bg-navy-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                  <button
                    disabled={!barcodeInput || loading}
                    onClick={() => handleScanShelfItem(barcodeInput)}
                    className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition"
                  >
                    Scan Item
                  </button>
                </div>

                {/* Development-only scan helpers */}
                {import.meta.env.DEV && <>
                <div className="pt-2 border-t border-navy-700">
                  <span className="text-[11px] text-slate-400 block mb-2">Simulate Physical Shelf Scans:</span>
                  <div className="flex flex-wrap gap-2">
                    {selectedTask.items.map((item) => (
                      <button
                        key={item.productId}
                        onClick={() => handleScanShelfItem(item.barcode)}
                        className={`text-[11px] px-2.5 py-1.5 rounded-lg border font-medium transition ${
                          item.isVerified
                            ? 'bg-brand-950/40 border-brand-500/40 text-brand-300'
                            : 'bg-navy-700 hover:bg-slate-700 border-slate-700 text-slate-200'
                        }`}
                      >
                        {item.name.split(' ')[0]} ({item.scannedQuantity}/{item.requiredQuantity})
                      </button>
                    ))}

                    {/* Mismatch Barcode Simulator */}
                    <button
                      onClick={() => handleScanShelfItem('616110008901')}
                      className="text-[11px] px-2.5 py-1.5 rounded-lg border border-rose-500/40 bg-rose-950/30 text-rose-300 font-medium hover:bg-rose-900/40"
                    >
                      ⚠️ Test Wrong Barcode Alert
                    </button>
                  </div>
                </div>
                </>}
              </div>

              {/* Items Verification Checklist */}
              <div className="space-y-3">
                <h4 className="font-semibold text-xs text-slate-300 uppercase tracking-wider">
                  Shelf Items to Pick & Verify:
                </h4>

                <div className="space-y-2">
                  {selectedTask.items.map((item) => (
                    <div
                      key={item.productId}
                      className={`p-3.5 rounded-xl border flex flex-col sm:flex-row justify-between sm:items-center gap-3 transition ${
                        item.isVerified
                          ? 'bg-brand-950/20 border-brand-500/40'
                          : 'bg-navy-800/60 border-slate-700'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          {item.isVerified ? (
                            <CheckCircle2 className="w-4 h-4 text-brand-400 flex-shrink-0" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-slate-500 flex-shrink-0" />
                          )}
                          <span className="font-semibold text-sm text-white">{item.name}</span>
                          {item.isWeighted && (
                            <span className="bg-azure-500/20 text-azure-400 text-[10px] px-1.5 rounded">Produce (Scale)</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 font-mono">Barcode: {item.barcode}</p>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="text-right">
                          <span className="text-xs text-slate-400 block">Picked Quantity</span>
                          <span
                            className={`font-mono font-bold text-sm ${
                              item.isVerified ? 'text-brand-400' : 'text-amber-400'
                            }`}
                          >
                            {item.scannedQuantity} / {item.requiredQuantity} units
                          </span>
                        </div>

                        {item.isWeighted && !item.isVerified && (
                          <button
                            onClick={() => setSelectedProduceItem(item)}
                            className="bg-azure-600 hover:bg-azure-500 text-white px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1"
                          >
                            <Scale className="w-3.5 h-3.5" />
                            <span>Weigh</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stage 5: Dual Verification & Packing Station */}
              {allPicked && selectedTask.status !== 'PACKED' && currentOrder.status !== 'COLLECTED' && (
                <div className="p-4 bg-brand-950/30 border border-brand-500/40 rounded-xl space-y-4">
                  <div className="flex items-center space-x-2">
                    <PackageCheck className="w-5 h-5 text-brand-400" />
                    <div>
                      <h4 className="font-bold text-sm text-white">Dual Verification & Packing Station</h4>
                      <p className="text-xs text-brand-300">
                        All items picked. Second employee verifies and seals package before customer collection.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">
                        Package Security Seal #
                      </label>
                      <input
                        type="text"
                        value={sealNumber}
                        onChange={(e) => setSealNumber(e.target.value)}
                        className="w-full bg-navy-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Total Sealed Bags</label>
                      <input
                        type="number"
                        min="1"
                        value={bagCount}
                        onChange={(e) => setBagCount(parseInt(e.target.value, 10) || 1)}
                        className="w-full bg-navy-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  <button
                    disabled={loading}
                    onClick={handleVerifyAndPack}
                    className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center space-x-2 shadow-lg shadow-brand-600/30"
                  >
                    <Check className="w-4 h-4" />
                    <span>Sign Off Dual Verification & Seal Package</span>
                  </button>
                </div>
              )}

              {/* Stage 6: Pickup Counter Handover Verification */}
              {currentOrder.status === 'READY_FOR_PICKUP' && (
                <div className="p-4 bg-azure-950/30 border border-azure-500/40 rounded-xl space-y-3">
                  <div className="flex items-center space-x-2">
                    <HandMetal className="w-5 h-5 text-azure-400" />
                    <div>
                      <h4 className="font-bold text-sm text-white">Pickup Counter Handover Clearance</h4>
                      <p className="text-xs text-azure-200">
                        Customer has arrived. Ask for their 6-digit Collection OTP or scan their QR pass.
                      </p>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <input
                      type="text"
                      placeholder="Enter Customer 6-digit OTP (e.g. 482910)..."
                      value={handoverOtp}
                      onChange={(e) => setHandoverOtp(e.target.value)}
                      className="flex-1 bg-navy-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                    <button
                      disabled={loading}
                      onClick={handleAuthorizeHandover}
                      className="bg-azure-600 hover:bg-azure-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1"
                    >
                      <span>Authorize Handover</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-navy-700/80 border border-slate-700/80 rounded-2xl p-12 text-center text-slate-500 space-y-2">
              <Boxes className="w-12 h-12 mx-auto stroke-1 text-slate-600" />
              <p className="text-sm">Select an order from the queue on the left to begin fulfillment.</p>
            </div>
          )}
        </div>
      </div>

      {/* Produce Weighing Modal */}
      {selectedProduceItem && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-navy-700 border border-slate-700 rounded-2xl max-w-sm w-full p-5 shadow-2xl relative space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-azure-500/20 border border-azure-500/30 flex items-center justify-center">
                <Scale className="w-5 h-5 text-azure-400" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">Registered Produce Scale</h3>
                <p className="text-xs text-slate-400">{selectedProduceItem.name}</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-300 block">Actual Scale Weight (Grams)</label>
              <div className="relative">
                <input
                  type="number"
                  placeholder="e.g. 1080"
                  value={scaleWeight}
                  onChange={(e) => setScaleWeight(e.target.value)}
                  className="w-full bg-navy-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-azure-500 font-mono"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400">grams</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Server calculates accurate line item price adjustment based on scale weight.
              </p>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => setSelectedProduceItem(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-2 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={!scaleWeight || loading}
                onClick={handleWeighProduce}
                className="flex-1 bg-azure-600 hover:bg-azure-500 text-white py-2 rounded-xl text-xs font-bold"
              >
                Record Weight
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
