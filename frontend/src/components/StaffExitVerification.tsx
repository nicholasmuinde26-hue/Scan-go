import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Scan,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Lock,
  ArrowRight,
  ShieldAlert,
  RotateCcw,
  KeyRound,
  FileCheck,
  Timer,
  Clock,
  WifiOff,
  Sparkles,
} from 'lucide-react';
import { Store, Product } from '../types.js';
import { apiRequest, formatKes } from '../api.js';
import { cacheReceiptLocally, findReceiptLocally } from '../offline/offlineStorage.js';
import { useLiveOrderEvents } from '../hooks/useLiveOrderEvents.js';

interface StaffExitVerificationProps {
  currentStore: Store;
  products: Product[];
}

export const StaffExitVerification: React.FC<StaffExitVerificationProps> = ({ currentStore, products }) => {
  const [receiptTokenInput, setReceiptTokenInput] = useState('');
  const [selectedLane, setSelectedLane] = useState(currentStore.exitLanes?.[0]?.laneId || 'LANE-01');
  const [loading, setLoading] = useState(false);
  const [exitVerificationResult, setExitVerificationResult] = useState<any | null>(null);
  const [scanLatencyMs, setScanLatencyMs] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(
    null
  );

  // AMBER 15-second Countdown Timer
  const [amberTimer, setAmberTimer] = useState<number | null>(null);
  const [amberOvertimeTriggered, setAmberOvertimeTriggered] = useState(false);
  const timerRef = useRef<any>(null);

  // Independent Physical Cart Scanning
  const [physicalCartScans, setPhysicalCartScans] = useState<{ barcode: string; name: string; quantity: number }[]>([]);
  const [physicalBarcode, setPhysicalBarcode] = useState('');
  const [comparisonResult, setComparisonResult] = useState<any | null>(null);
  const [observedWeightGrams, setObservedWeightGrams] = useState('');
  const [tagSerialInput, setTagSerialInput] = useState('');
  const [scannedTagSerials, setScannedTagSerials] = useState<string[]>([]);
  const [tagCheckResult, setTagCheckResult] = useState<any | null>(null);

  // Discrepancy resolution modal
  const [isResolvingDiscrepancy, setIsResolvingDiscrepancy] = useState(false);
  const [resolutionChoice, setResolutionChoice] = useState<'PAID_DIFFERENCE' | 'ITEM_RETURNED' | 'OVERRIDDEN_BY_SUPERVISOR'>('PAID_DIFFERENCE');
  const [supervisorPin, setSupervisorPin] = useState('1234');
  const [resolutionNotes, setResolutionNotes] = useState('Customer paid the difference via M-Pesa top-up');

  // Real-Time Event Stream Listener
  useLiveOrderEvents((event) => {
    if (event.type === 'order.paid') {
      setStatusMessage({
        type: 'success',
        text: `Live Notice: Order ${event.payload?.orderNumber} just paid via M-Pesa! Ready for exit.`,
      });
    }
  });

  // AMBER timer countdown effect
  useEffect(() => {
    if (amberTimer !== null && amberTimer > 0) {
      timerRef.current = setTimeout(() => {
        setAmberTimer((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else if (amberTimer === 0 && !amberOvertimeTriggered) {
      setAmberOvertimeTriggered(true);
      // Notify backend that AMBER check ran over 15 seconds
      if (exitVerificationResult?.exitEventId) {
        apiRequest(`/exit/${exitVerificationResult.exitEventId}/amber-timeout`, {
          method: 'POST',
          body: JSON.stringify({ elapsedSeconds: 15 }),
        }).catch((err) => console.warn('Timeout report error:', err));
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [amberTimer, amberOvertimeTriggered, exitVerificationResult]);

  // 1. Staff scans QR receipt token (Instant GREEN < 5s path with Auto-Clear)
  const handleVerifyReceipt = async (tokenToVerify?: string) => {
    const token = tokenToVerify || receiptTokenInput;
    if (!token) return;

    const startTime = Date.now();
    try {
      setStatusMessage(null);
      setComparisonResult(null);
      setPhysicalCartScans([]);
      setObservedWeightGrams('');
      setScannedTagSerials([]);
      setTagCheckResult(null);
      setAmberTimer(null);
      setAmberOvertimeTriggered(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      setLoading(true);

      let res: any = null;

      // Check if online or offline fallback
      if (!navigator.onLine) {
        const cached = await findReceiptLocally(token);
        if (cached) {
          res = {
            success: true,
            decision: 'GREEN',
            decisionDisplay: 'GREEN — PASS (GATE OPEN)',
            autoCleared: true,
            gateOpened: true,
            offline: true,
            latencyMs: Date.now() - startTime,
            order: {
              orderNumber: cached.orderNumber,
              customerName: cached.customerName || 'Offline Verified Customer',
              totalItems: cached.totalItems,
              totalMinor: cached.totalMinor,
            },
          };
        } else {
          throw new Error('Offline mode: Receipt not found in local cache. Connect to verify.');
        }
      } else {
        res = await apiRequest('/exit/verify-receipt', {
          method: 'POST',
          body: JSON.stringify({
            receiptToken: token,
            exitLaneId: selectedLane,
          }),
        });
      }

      const totalLatency = Date.now() - startTime;
      setScanLatencyMs(totalLatency);
      setExitVerificationResult(res);

      if (res.decision === 'GREEN' || res.autoCleared) {
        setStatusMessage({
          type: 'success',
          text: `⚡ INSTANT GREEN PASS: Gate opened in ${(totalLatency / 1000).toFixed(2)}s! Zero anomalies. Departure authorized.`,
        });

        // Cache receipt for offline mode
        if (res.order) {
          cacheReceiptLocally({
            receiptToken: token,
            orderNumber: res.order.orderNumber,
            totalMinor: res.order.totalMinor,
            totalItems: res.order.totalItems,
            customerName: res.order.customerName,
            clearedOffline: false,
          });
        }

        // Auto-reset terminal for next customer after 4.5s
        setTimeout(() => {
          setExitVerificationResult(null);
          setReceiptTokenInput('');
          setScanLatencyMs(null);
        }, 4500);
      } else if (res.decision === 'AMBER' || res.decision === 'AMBER_FULL') {
        setStatusMessage({
          type: 'warning',
          text: `${res.decisionDisplay || res.decision}: Physical inspection started. 15-second time limit active.`,
        });

        // Start 15-second countdown timer for AMBER inspection
        const limitSeconds = res.amberTimeoutSeconds || 15;
        setAmberTimer(limitSeconds);
        setAmberOvertimeTriggered(false);
      } else {
        setStatusMessage({
          type: 'error',
          text: 'RED STOP: Gate Locked! Security risk or counterfeit/expired receipt.',
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
      setExitVerificationResult(null);
    } finally {
      setLoading(false);
    }
  };

  // 2. Add physical item scanned in cart
  const handleAddPhysicalScan = (barcode: string) => {
    const foundProd = products.find((p) => p.barcode === barcode);
    const name = foundProd ? foundProd.name : 'Unknown Product';

    setPhysicalCartScans((prev) => {
      const idx = prev.findIndex((i) => i.barcode === barcode);
      if (idx > -1) {
        return prev.map((item, i) => (i === idx ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...prev, { barcode, name, quantity: 1 }];
    });
    setPhysicalBarcode('');
  };

  // 3. Submit Physical Scans to Backend for Comparison
  const handleSubmitPhysicalCheck = async () => {
    if (!exitVerificationResult?.exitEventId) return;
    try {
      setLoading(true);
      const res = await apiRequest(`/exit/${exitVerificationResult.exitEventId}/physical-check`, {
        method: 'POST',
        body: JSON.stringify({ physicalItems: physicalCartScans, ...(observedWeightGrams ? { observedWeightGrams: Number(observedWeightGrams) } : {}) }),
      });

      setComparisonResult(res);

      if (res.hasDiscrepancy) {
        setStatusMessage({
          type: 'error',
          text: `DISCREPANCY DETECTED: +${res.totalExcessItems} extra unrecorded items found in physical cart! Exit blocked.`,
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: 'PERFECT MATCH: Physical cart exactly matches paid receipt! Order cleared.',
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySerializedTags = async () => {
    if (!exitVerificationResult?.exitEventId) return;
    try {
      setLoading(true);
      const result = await apiRequest(`/exit/${exitVerificationResult.exitEventId}/verify-tags`, {
        method: 'POST',
        body: JSON.stringify({ tagSerials: scannedTagSerials }),
      });
      setTagCheckResult(result);
      if (result.decision === 'RED') {
        setExitVerificationResult((current: any) => ({ ...current, decision: 'RED', riskBand: 'RED', reasons: [...(current?.reasons || []), 'RFID_MISMATCH: Unpaid, unknown, or expected tag missing at exit.'] }));
        setStatusMessage({ type: 'error', text: 'RFID mismatch: unpaid, unknown, or missing tag. Exit blocked and supervisor escalated.' });
      } else {
        setStatusMessage({ type: 'success', text: 'All read serialized tags are paid and match this order.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'RFID verification failed.' });
    } finally {
      setLoading(false);
    }
  };

  // 4. Resolve Discrepancy
  const handleResolveDiscrepancy = async () => {
    if (!exitVerificationResult?.exitEventId) return;
    try {
      setLoading(true);
      await apiRequest(`/exit/${exitVerificationResult.exitEventId}/resolve-discrepancy`, {
        method: 'POST',
        body: JSON.stringify({
          resolution: resolutionChoice,
          supervisorPin,
          notes: resolutionNotes,
        }),
      });

      setStatusMessage({
        type: 'success',
        text: `Discrepancy resolved via ${resolutionChoice}. Exit authorized.`,
      });
      setIsResolvingDiscrepancy(false);
      setComparisonResult((prev: any) => ({ ...prev, clearanceDecision: 'CLEARED' }));
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // 5. Clear Exit (for GREEN results)
  const handleClearGreenExit = async () => {
    if (!exitVerificationResult?.exitEventId) return;
    try {
      setLoading(true);
      await apiRequest(`/exit/${exitVerificationResult.exitEventId}/clear`, {
        method: 'POST',
      });
      setStatusMessage({
        type: 'success',
        text: 'EXIT CLEARED: Single-use receipt consumed and departure authorized!',
      });
      setExitVerificationResult(null);
      setReceiptTokenInput('');
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const riskBand = exitVerificationResult?.decision;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-azure-950/70 to-navy-700 border border-azure-500/30 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-azure-500/20 text-azure-400 rounded-lg">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-white">Exit Verification & Anti-Fraud Terminal</h2>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              Independent physical cart comparison at supermarket exit lane. Detects barcode swaps, unrecorded goods, and fake receipts.
            </p>
          </div>

          <div className="flex items-center space-x-2 bg-navy-800/80 px-3 py-1.5 rounded-xl border border-slate-700 text-xs">
            <span className="text-slate-400">Lane:</span>
            <select
              value={selectedLane}
              onChange={(e) => setSelectedLane(e.target.value)}
              className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
            >
              {currentStore.exitLanes?.map((lane) => (
                <option key={lane.laneId} value={lane.laneId} className="bg-navy-700 text-white">
                  {lane.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium animate-fadeIn ${
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
            ) : statusMessage.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
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

      {/* Main Grid: Scan Receipt (5 cols) & Physical Cart Check (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: QR Receipt Input & Risk Banner (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-navy-700/80 border border-slate-700/80 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-white flex items-center space-x-2">
              <Scan className="w-4 h-4 text-azure-400" />
              <span>Exit Lane Scanner (Customer QR Receipt)</span>
            </h3>

            <div className="space-y-2">
              <label className="text-xs text-slate-300 block">Signed Receipt Token / QR Payload</label>
              <textarea
                rows={3}
                placeholder="Scan or paste customer's QR receipt token..."
                value={receiptTokenInput}
                onChange={(e) => setReceiptTokenInput(e.target.value)}
                className="w-full bg-navy-800 border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-azure-500 font-mono"
              />
              <button
                disabled={!receiptTokenInput || loading}
                onClick={() => handleVerifyReceipt()}
                className="w-full bg-azure-600 hover:bg-azure-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center space-x-2 shadow-lg shadow-azure-600/30"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Verify Receipt & Run Fraud Engine</span>
              </button>
            </div>
          </div>

          {/* Risk Engine Results Banner */}
          {exitVerificationResult && (
            <div
              className={`rounded-2xl p-5 border shadow-lg space-y-4 ${
                riskBand === 'GREEN'
                  ? 'bg-brand-950/40 border-brand-500/50'
                  : riskBand === 'AMBER'
                  ? 'bg-amber-950/40 border-amber-500/50'
                  : riskBand === 'AMBER_FULL'
                  ? 'bg-orange-950/40 border-orange-500/50'
                  : 'bg-rose-950/40 border-rose-500/50'
              }`}
            >
              {/* Decision Badge */}
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2.5">
                  {riskBand === 'GREEN' ? (
                    <div className="p-2 rounded-xl bg-brand-500/20 text-brand-400">
                      <CheckCircle2 className="w-6 h-6 animate-pulse" />
                    </div>
                  ) : riskBand === 'RED' ? (
                    <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400">
                      <XCircle className="w-6 h-6" />
                    </div>
                  ) : (
                    <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                  )}
                  <div>
                    <span className="text-xl font-black text-white tracking-wider block">
                      {exitVerificationResult.decisionDisplay ||
                        (riskBand === 'GREEN' ? 'GREEN — PASS (GATE OPEN)' : `${riskBand} — CHECK`)}
                    </span>
                    <p className="text-xs text-slate-300">
                      Customer: {exitVerificationResult.order?.customerName} • {exitVerificationResult.order?.totalItems} Paid Items
                    </p>
                    {exitVerificationResult.presence?.trustTier && (
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                        Entry: tier {exitVerificationResult.presence.trustTier}
                        {exitVerificationResult.presence.trustTier === 2 ? ' (reduced trust, higher spot-check rate)' : ''}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase block font-semibold">Risk Score</span>
                  <span className="text-xl font-black text-white">{exitVerificationResult.riskScore}/100</span>
                </div>
              </div>

              {/* Instant GREEN Auto-Clear Banner */}
              {riskBand === 'GREEN' && (
                <div className="bg-brand-900/40 border border-brand-500/50 rounded-xl p-3 text-center space-y-1">
                  <div className="flex items-center justify-center space-x-2 text-brand-300 font-bold text-sm">
                    <Sparkles className="w-4 h-4 text-brand-400" />
                    <span>GATE OPENED AUTOMATICALLY</span>
                  </div>
                  <p className="text-xs text-brand-200">
                    Verified & cleared in {scanLatencyMs ? (scanLatencyMs / 1000).toFixed(2) : '<1'}s (Path target: &lt;5s). Zero second action required.
                  </p>
                  <span className="text-[10px] text-brand-400/80 block">Lane resetting automatically for next customer...</span>
                </div>
              )}

              {/* AMBER 15-Second Time Limit Bar */}
              {(riskBand === 'AMBER' || riskBand === 'AMBER_FULL') && amberTimer !== null && (
                <div
                  className={`p-3 rounded-xl border space-y-2 ${
                    amberTimer === 0
                      ? 'bg-rose-950/60 border-rose-500 text-rose-300 animate-pulse'
                      : amberTimer <= 5
                      ? 'bg-amber-950/50 border-amber-500 text-amber-200'
                      : 'bg-navy-800/80 border-slate-700 text-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="flex items-center space-x-1.5">
                      <Timer className="w-4 h-4 text-amber-400" />
                      <span>AMBER Staff Inspection Timer:</span>
                    </span>
                    <span className={`text-sm font-mono ${amberTimer === 0 ? 'text-rose-400 font-black' : 'text-amber-400'}`}>
                      {amberTimer}s / 15s
                    </span>
                  </div>

                  <div className="w-full bg-navy-700 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-1000 ${
                        amberTimer <= 5 ? 'bg-rose-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${(amberTimer / 15) * 100}%` }}
                    />
                  </div>

                  {amberTimer === 0 && (
                    <div className="flex items-center space-x-1.5 text-xs text-rose-300 font-semibold pt-1">
                      <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
                      <span>TIME LIMIT EXCEEDED (&gt;15s): Supervisor notified for assistance!</span>
                    </div>
                  )}
                </div>
              )}

              {exitVerificationResult.weighedItems?.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-slate-700/60 text-xs">
                  <span className="text-[11px] text-amber-300 font-bold uppercase tracking-wider block">Weighed produce — spot-check the labelled bags</span>
                  {exitVerificationResult.weighedItems.map((item: any) => <div key={item.labelBarcode} className="flex justify-between rounded-lg bg-navy-800 p-2 text-white"><span>{item.productName} · {item.labelBarcode} · scale {item.scaleId}</span><strong>{item.weightGrams}g</strong></div>)}
                  <label className="block text-left text-slate-300">Optional combined exit-scale weight (grams)
                    <input type="number" min="0" value={observedWeightGrams} onChange={(e) => setObservedWeightGrams(e.target.value)} className="mt-1 w-full rounded-lg bg-white p-2 text-navy-900" placeholder={`Expected ${exitVerificationResult.expectedWeighedWeightGrams}g`} />
                  </label>
                </div>
              )}
              {exitVerificationResult.taggedItems?.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-slate-700/60 text-xs">
                  <span className="text-[11px] text-rose-300 font-bold uppercase tracking-wider block">Serialized item test reader</span>
                  {exitVerificationResult.taggedItems.map((item: any) => <div key={item.tagSerial} className="flex justify-between rounded-lg bg-navy-800 p-2 text-white"><span>{item.productName}</span><strong>{item.tagSerial}</strong></div>)}
                  <div className="flex gap-2"><input value={tagSerialInput} onChange={(e) => setTagSerialInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && tagSerialInput.trim()) { setScannedTagSerials((prev) => [...prev, tagSerialInput.trim()]); setTagSerialInput(''); } }} className="min-w-0 flex-1 rounded-lg bg-white p-2 text-navy-900" placeholder="Simulated reader serial" /><button onClick={() => { if (tagSerialInput.trim()) { setScannedTagSerials((prev) => [...prev, tagSerialInput.trim()]); setTagSerialInput(''); } }} className="rounded-lg bg-azure-600 px-3 py-2 font-bold text-white">Add</button></div>
                  <div className="text-left text-slate-300">Read: {scannedTagSerials.join(', ') || 'none'}</div>
                  <button disabled={loading} onClick={handleVerifySerializedTags} className="w-full rounded-lg bg-rose-600 px-3 py-2 font-bold text-white disabled:opacity-50">Verify RFID tags</button>
                  {tagCheckResult?.decision === 'RED' && <div className="rounded-lg border border-rose-400 bg-rose-950 p-2 text-left text-rose-100">Unpaid/unknown: {tagCheckResult.unpaidOrUnknown?.map((x: any) => x.tagSerial).join(', ') || 'none'} · Missing expected: {tagCheckResult.missingExpected?.map((x: any) => x.tagSerial).join(', ') || 'none'}</div>}
                </div>
              )}

              {/* Highlighted 3 Sample Items to Check */}
              {exitVerificationResult.sampleItemsToCheck?.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-700/60 text-xs">
                  <span className="text-[11px] text-amber-400 font-bold uppercase tracking-wider block">
                    Fast Spot-Check (Check these {exitVerificationResult.sampleItemsToCheck.length} items):
                  </span>
                  <div className="space-y-1">
                    {exitVerificationResult.sampleItemsToCheck.map((item: any, idx: number) => (
                      <div
                        key={idx}
                        className="bg-navy-800/80 p-2 rounded-lg border border-slate-700 flex justify-between items-center"
                      >
                        <div>
                          <span className="font-semibold text-white block">{item.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{item.barcode}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs bg-navy-700 px-2 py-0.5 rounded text-amber-300 font-bold">
                            Qty: {item.quantity}
                          </span>
                          <button
                            onClick={() => handleAddPhysicalScan(item.barcode)}
                            className="text-[10px] bg-azure-600/80 hover:bg-azure-600 text-white px-2 py-0.5 rounded font-semibold"
                          >
                            + Confirm
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reasons & Signals */}
              {exitVerificationResult.reasons?.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-slate-700/60 text-xs">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase block">Risk Signals:</span>
                  <ul className="space-y-1">
                    {exitVerificationResult.reasons.map((r: string, idx: number) => (
                      <li key={idx} className="text-slate-300 flex items-start space-x-1.5">
                        <span className="text-amber-400">•</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Mandatory Staff Tasks */}
              {exitVerificationResult.mandatoryTasks?.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-slate-700/60 text-xs">
                  <span className="text-[10px] text-amber-400 font-semibold uppercase block">
                    Mandatory Officer Verification Tasks:
                  </span>
                  <ul className="space-y-1">
                    {exitVerificationResult.mandatoryTasks.map((t: string, idx: number) => (
                      <li key={idx} className="bg-navy-800/60 p-2 rounded-lg border border-slate-700 text-white flex items-center space-x-2">
                        <FileCheck className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Instant Clear Button for GREEN results */}
              {riskBand === 'GREEN' && (
                <button
                  onClick={handleClearGreenExit}
                  className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center space-x-2 shadow-lg shadow-brand-600/30"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Authorize Departure & Open Gate</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Independent Physical Cart Scanning & Difference Engine (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-navy-700/80 border border-slate-700/80 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-700/80 pb-3">
              <div>
                <h3 className="font-bold text-sm text-white">Independent Physical Cart Verification</h3>
                <p className="text-xs text-slate-400">
                  Exit officer independently scans or records products found physically in trolley/cart.
                </p>
              </div>
              <span className="text-xs bg-navy-800 px-2.5 py-1 rounded-full border border-slate-700 text-slate-300 font-mono">
                {physicalCartScans.reduce((s, i) => s + i.quantity, 0)} physical items
              </span>
            </div>

            {/* Scan Physical Barcode Input */}
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="Scan physical product in trolley..."
                value={physicalBarcode}
                onChange={(e) => setPhysicalBarcode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && physicalBarcode) {
                    handleAddPhysicalScan(physicalBarcode);
                  }
                }}
                className="flex-1 bg-navy-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-azure-500"
              />
              <button
                disabled={!physicalBarcode}
                onClick={() => handleAddPhysicalScan(physicalBarcode)}
                className="bg-azure-600 hover:bg-azure-500 text-white px-3 py-2 rounded-xl text-xs font-semibold"
              >
                Add Scan
              </button>
            </div>

            {/* Quick Shelf Simulator Buttons are development-only test helpers. */}
            {import.meta.env.DEV && <>
            <div className="pt-2 border-t border-navy-700 space-y-1.5">
              <span className="text-[11px] text-slate-400 block font-semibold">
                Simulate Physical Trolley Contents (Test Cases):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {/* 1. Exactly Match Scenario */}
                <button
                  onClick={() => {
                    // Populate exactly the items from the paid order
                    if (exitVerificationResult?.order?.items) {
                      setPhysicalCartScans(
                        exitVerificationResult.order.items.map((i: any) => ({
                          barcode: i.barcode,
                          name: i.productName,
                          quantity: i.quantity,
                        }))
                      );
                    }
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-brand-950/40 border border-brand-500/40 text-brand-300 font-semibold"
                >
                  ✅ Simulate Exact Match (Clean Trip)
                </button>

                {/* 2. Fraud Scenario: +2 Unrecorded Cooking Oil */}
                <button
                  onClick={() => {
                    if (exitVerificationResult?.order?.items) {
                      const base = exitVerificationResult.order.items.map((i: any) => ({
                        barcode: i.barcode,
                        name: i.productName,
                        quantity: i.quantity,
                      }));
                      // Add 2 extra bottles of cooking oil
                      base.push({
                        barcode: '616110002345',
                        name: 'Rina Pure Vegetable Oil 1 Litre',
                        quantity: 2,
                      });
                      setPhysicalCartScans(base);
                    }
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 font-semibold"
                >
                  🚨 Simulate +2 Unrecorded Oil (+KES 620 Theft)
                </button>

                {/* 3. Fraud Scenario: Barcode Swap / Expensive Whiskey in Cart */}
                <button
                  onClick={() => {
                    if (exitVerificationResult?.order?.items) {
                      const base = exitVerificationResult.order.items.map((i: any) => ({
                        barcode: i.barcode,
                        name: i.productName,
                        quantity: i.quantity,
                      }));
                      // Add Johnny Walker whiskey!
                      base.push({
                        barcode: '616110008901',
                        name: 'Johnnie Walker Black Label Whisky 750ml',
                        quantity: 1,
                      });
                      setPhysicalCartScans(base);
                    }
                  }}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-navy-950/40 border border-navy-500/40 text-navy-300 font-semibold"
                >
                  🚨 Simulate Barcode Swap (+KES 3,850 Whiskey)
                </button>
              </div>
            </div>
            </>}

            {/* Scanned Physical Items List */}
            {physicalCartScans.length > 0 && (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {physicalCartScans.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center p-2.5 bg-navy-800/60 rounded-xl border border-slate-700 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-white block">{item.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{item.barcode}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white bg-navy-700 px-2 py-0.5 rounded border border-slate-700">
                        {item.quantity} in cart
                      </span>
                      <button
                        onClick={() => setPhysicalCartScans((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-rose-400 text-xs"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Compare Button */}
            {exitVerificationResult && physicalCartScans.length > 0 && (
              <button
                disabled={loading}
                onClick={handleSubmitPhysicalCheck}
                className="w-full bg-azure-600 hover:bg-azure-500 text-white font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center space-x-2 shadow-lg shadow-azure-600/30"
              >
                <span>Run Digital vs Physical Comparison</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Comparison Difference Result Table */}
            {comparisonResult && (
              <div className="pt-3 border-t border-slate-700 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-xs text-white uppercase tracking-wider">
                    Digital Receipt vs Physical Cart Comparison:
                  </h4>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      comparisonResult.hasDiscrepancy
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        : 'bg-brand-500/20 text-brand-400 border border-brand-500/40'
                    }`}
                  >
                    {comparisonResult.hasDiscrepancy ? 'MISMATCH DETECTED' : '100% MATCH'}
                  </span>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {comparisonResult.differences?.map((diff: any, idx: number) => {
                    const isExcess = diff.difference > 0;
                    const isMissing = diff.difference < 0;
                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border flex justify-between items-center text-xs ${
                          isExcess
                            ? 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                            : isMissing
                            ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                            : 'bg-navy-800/60 border-slate-700 text-slate-300'
                        }`}
                      >
                        <div>
                          <span className="font-semibold block">{diff.name}</span>
                          <div className="flex items-center space-x-2 text-[10px] opacity-80">
                            <span>Paid: {diff.paidQuantity}</span>
                            <span>•</span>
                            <span>Physical: {diff.physicalQuantity}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span
                            className={`font-bold font-mono px-2 py-0.5 rounded ${
                              isExcess
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : isMissing
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'text-brand-400'
                            }`}
                          >
                            {diff.difference > 0 ? `+${diff.difference} Extra` : diff.difference < 0 ? `${diff.difference} Missing` : 'Match'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Discrepancy Actions */}
                {comparisonResult.hasDiscrepancy && (
                  <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl space-y-2 text-xs">
                    <div className="flex justify-between font-bold text-rose-300">
                      <span>Total Unrecorded Value:</span>
                      <span className="text-sm">{formatKes(comparisonResult.totalExcessValueMinor)}</span>
                    </div>

                    <button
                      onClick={() => setIsResolvingDiscrepancy(true)}
                      className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 rounded-xl text-xs transition flex items-center justify-center space-x-1 shadow-lg shadow-rose-600/30"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Resolve Discrepancy (Pay Difference / Return / Supervisor)</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Discrepancy Resolution Modal */}
      {isResolvingDiscrepancy && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-navy-700 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              <span>Resolve Physical Cart Discrepancy</span>
            </h3>

            <p className="text-xs text-slate-300">
              Select an authorized supermarket resolution workflow to reconcile unrecorded physical goods:
            </p>

            <div className="space-y-2">
              <label
                className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer text-xs transition ${
                  resolutionChoice === 'PAID_DIFFERENCE'
                    ? 'bg-brand-950/40 border-brand-500/60 text-white'
                    : 'bg-navy-800 border-slate-700 text-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="resolution"
                  checked={resolutionChoice === 'PAID_DIFFERENCE'}
                  onChange={() => setResolutionChoice('PAID_DIFFERENCE')}
                  className="text-brand-500 focus:ring-brand-500"
                />
                <div>
                  <span className="font-bold block">Option 1: Customer Pays Difference (M-Pesa Top-Up)</span>
                  <span className="text-[10px] text-slate-400">
                    System creates linked top-up order for {formatKes(comparisonResult?.totalExcessValueMinor || 0)}.
                  </span>
                </div>
              </label>

              <label
                className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer text-xs transition ${
                  resolutionChoice === 'ITEM_RETURNED'
                    ? 'bg-amber-950/40 border-amber-500/60 text-white'
                    : 'bg-navy-800 border-slate-700 text-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="resolution"
                  checked={resolutionChoice === 'ITEM_RETURNED'}
                  onChange={() => setResolutionChoice('ITEM_RETURNED')}
                  className="text-amber-500 focus:ring-amber-500"
                />
                <div>
                  <span className="font-bold block">Option 2: Extra Goods Returned to Shelf</span>
                  <span className="text-[10px] text-slate-400">
                    Staff takes back excess unrecorded items and leaves only paid goods.
                  </span>
                </div>
              </label>

              <label
                className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer text-xs transition ${
                  resolutionChoice === 'OVERRIDDEN_BY_SUPERVISOR'
                    ? 'bg-navy-950/40 border-navy-500/60 text-white'
                    : 'bg-navy-800 border-slate-700 text-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="resolution"
                  checked={resolutionChoice === 'OVERRIDDEN_BY_SUPERVISOR'}
                  onChange={() => setResolutionChoice('OVERRIDDEN_BY_SUPERVISOR')}
                  className="text-navy-500 focus:ring-navy-500"
                />
                <div>
                  <span className="font-bold block">Option 3: Supervisor PIN Override</span>
                  <span className="text-[10px] text-slate-400">
                    Authorized supervisor override for verified packaging/barcode replacement error.
                  </span>
                </div>
              </label>
            </div>

            {/* Supervisor PIN input */}
            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1">
                <KeyRound className="w-3.5 h-3.5 text-navy-400" />
                <span>Supervisor Authorization PIN</span>
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={supervisorPin}
                onChange={(e) => setSupervisorPin(e.target.value)}
                placeholder="1234"
                className="w-full bg-navy-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => setIsResolvingDiscrepancy(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 py-2.5 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={loading}
                onClick={handleResolveDiscrepancy}
                className="flex-1 bg-brand-600 hover:bg-brand-500 text-white py-2.5 rounded-xl text-xs font-bold"
              >
                Authorize & Clear Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
