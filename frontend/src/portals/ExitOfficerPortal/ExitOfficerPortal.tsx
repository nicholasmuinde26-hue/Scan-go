import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ShoppingBag,
  RotateCcw,
  Check,
  X,
  Plus,
  QrCode,
  Timer,
  Wifi,
  WifiOff,
  UserCheck,
  Receipt,
  ArrowRight,
  PackageCheck,
  HelpCircle,
} from 'lucide-react';
import { Store, Product, User } from '../../types.js';
import { apiRequest, formatKes } from '../../api.js';
import { canAny } from '../../permissions.js';
import { CashierServiceView } from './CashierServiceView.js';
import { HandoverCollectionView } from './HandoverCollectionView.js';
import { StaffExitVerification } from '../../components/StaffExitVerification.js';

interface ExitOfficerPortalProps {
  currentStore: Store;
  products: Product[];
  currentUser?: User | null;
}

type ExitPortalTab = 'EXIT_LANE' | 'CASHIER' | 'HANDOVER';

export const ExitOfficerPortal: React.FC<ExitOfficerPortalProps> = ({
  currentStore,
  products,
  currentUser,
}) => {
  const allTabs: { id: ExitPortalTab; label: string }[] = [
    { id: 'EXIT_LANE', label: 'Exit Lane Gate' },
    { id: 'CASHIER', label: 'Cashier & Helpdesk' },
    { id: 'HANDOVER', label: 'Handover Counter' },
  ];
  const availableTabs = allTabs.filter((tab) => {
    if (tab.id === 'EXIT_LANE') return canAny(currentUser, ['exit:scan', 'exit:verify']);
    if (tab.id === 'CASHIER') return canAny(currentUser, ['orders:refund', 'support:resend_receipt', 'support:reset_password']);
    return canAny(currentUser, ['orders:handover']);
  });
  const preferredTab: ExitPortalTab = currentUser?.role === 'CASHIER_CUSTOMER_SERVICE'
    ? 'CASHIER'
    : currentUser?.role === 'DELIVERY_COLLECTION_HANDOVER'
      ? 'HANDOVER'
      : 'EXIT_LANE';
  const initialTab = availableTabs.some((tab) => tab.id === preferredTab) ? preferredTab : availableTabs[0]?.id || 'EXIT_LANE';

  const [activeTab, setActiveTab] = useState<ExitPortalTab>(initialTab);
  const [exitLane, setExitLane] = useState(currentStore.exitLanes?.[0]?.name || 'Exit Lane #1');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    if (!availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(availableTabs[0]?.id || 'EXIT_LANE');
    }
  }, [activeTab, currentUser?.permissions]);

  // Exit Verification state
  const [receiptToken, setReceiptToken] = useState('TM-TOKEN-84920');
  const [scannedReceipt, setScannedReceipt] = useState(true);
  const [riskBand, setRiskBand] = useState<'GREEN' | 'AMBER' | 'RED'>('AMBER');
  const [paidItemsCount, setPaidItemsCount] = useState(5);
  const [scannedItemsCount, setScannedItemsCount] = useState(2);
  const [showDiscrepancy, setShowDiscrepancy] = useState(false);
  const [resolutionStatus, setResolutionStatus] = useState<string | null>(null);

  // 15-second Amber countdown timer
  const [amberTimer, setAmberTimer] = useState(15);
  const [timerActive, setTimerActive] = useState(false);

  // Monitor online / offline
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Amber inspection countdown
  useEffect(() => {
    let interval: any = null;
    if (timerActive && amberTimer > 0) {
      interval = setInterval(() => {
        setAmberTimer((prev) => prev - 1);
      }, 1000);
    } else if (amberTimer === 0 && timerActive) {
      // Overtime trigger
      apiRequest('/exit/amber-overtime', {
        method: 'POST',
        body: JSON.stringify({
          storeId: currentStore._id,
          laneId: exitLane,
          alertMessage: `AMBER Inspection exceeded 15s limit at ${exitLane}!`,
        }),
      }).catch(() => {});
    }
    return () => clearInterval(interval);
  }, [timerActive, amberTimer]);

  const handleStartInspection = () => {
    setScannedReceipt(true);
    setTimerActive(true);
    setAmberTimer(15);
    setScannedItemsCount(2);
    setShowDiscrepancy(false);
  };

  const handleScanAnotherItem = () => {
    setScannedItemsCount((prev) => prev + 1);
  };

  const handleSimulateDiscrepancy = () => {
    setScannedItemsCount(7);
    setShowDiscrepancy(true);
  };

  const handleResolve = async (action: string) => {
    try {
      await apiRequest('/exit/resolve', {
        method: 'POST',
        body: JSON.stringify({
          storeId: currentStore._id,
          laneId: exitLane,
          action,
          scannedCount: scannedItemsCount,
          paidCount: paidItemsCount,
        }),
      });
      setResolutionStatus(`Resolved: ${action}`);
      setShowDiscrepancy(false);
      setTimerActive(false);
    } catch {
      setResolutionStatus(`Resolved: ${action}`);
      setShowDiscrepancy(false);
      setTimerActive(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto my-6 px-4 font-sans space-y-6">
      {/* Offline Fallback Banner */}
      {!isOnline && (
        <div className="bg-amber-500 text-navy-950 p-4 rounded-2xl shadow-md flex items-center justify-between font-bold text-xs">
          <div className="flex items-center space-x-2">
            <WifiOff className="w-4 h-4" />
            <span>OFFLINE LOCAL MODE ACTIVE — Cryptographic ECDSA receipt tokens verified via local public key.</span>
          </div>
          <span className="text-[10px] bg-navy-800 text-amber-400 px-2.5 py-1 rounded-full uppercase">
            Auto-Sync Ready
          </span>
        </div>
      )}

      {/* Role Navigation Bar */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-azure-50 text-azure-600 flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-navy-700 text-sm sm:text-base">Front-of-Store Operations Terminal</h2>
            <p className="text-xs text-slate-400">{currentStore.name} • Assigned Station: {exitLane}</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex space-x-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === tab.id ? 'bg-azure-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Render Cashier View */}
      {activeTab === 'CASHIER' && canAny(currentUser, ['orders:refund', 'support:resend_receipt', 'support:reset_password']) && <CashierServiceView currentStore={currentStore} currentUser={currentUser} />}

      {/* Render Handover View */}
      {activeTab === 'HANDOVER' && canAny(currentUser, ['orders:handover']) && <HandoverCollectionView currentStore={currentStore} currentUser={currentUser} />}

      {/* Render Exit Lane Verification View */}
      {activeTab === 'EXIT_LANE' && canAny(currentUser, ['exit:scan', 'exit:verify']) && <StaffExitVerification currentStore={currentStore} products={products} />}
      {activeTab === 'EXIT_LANE' && false && (
        <div className="max-w-xl mx-auto space-y-6">
          {resolutionStatus && (
            <div className="bg-brand-50 border border-brand-200 text-brand-800 p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between">
              <span>{resolutionStatus}</span>
              <button onClick={() => setResolutionStatus(null)} className="text-brand-600">×</button>
            </div>
          )}

          {/* Exit Verification Terminal */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6 text-center">
            {/* Status & Risk Badges */}
            <div className="flex items-center justify-center space-x-2">
              <span className="inline-flex items-center space-x-1.5 bg-brand-50 border border-brand-200 text-brand-700 px-3.5 py-1 rounded-full text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-600" />
                <span>Payment Verified (M-Pesa)</span>
              </span>

              <span
                className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                  riskBand === 'GREEN'
                    ? 'bg-brand-100 text-brand-800'
                    : riskBand === 'AMBER'
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                <span>Risk: {riskBand}</span>
              </span>
            </div>

            {/* 15s Timer Warning if Amber */}
            {riskBand === 'AMBER' && timerActive && (
              <div
                className={`inline-flex items-center space-x-2 px-4 py-1.5 rounded-2xl text-xs font-bold transition ${
                  amberTimer <= 5
                    ? 'bg-rose-100 text-rose-900 animate-pulse border border-rose-300'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                <Timer className="w-4 h-4" />
                <span>AMBER Inspection Timer: {amberTimer}s remaining</span>
              </div>
            )}

            {/* Shopping Basket Illustration */}
            <div className="w-32 h-32 bg-slate-50 border border-slate-100 rounded-3xl flex items-center justify-center mx-auto text-azure-600 shadow-inner">
              <ShoppingBag className="w-14 h-14 stroke-1 text-slate-600" />
            </div>

            {/* Prompt */}
            <div className="space-y-1">
              <h3 className="text-base font-bold text-navy-700">Scan Physical Basket Items</h3>
              <p className="text-xs text-slate-500">Scan customer items to match with digital receipt</p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2 max-w-sm mx-auto">
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    scannedItemsCount > paidItemsCount ? 'bg-rose-500' : 'bg-azure-600'
                  }`}
                  style={{ width: `${Math.min((scannedItemsCount / paidItemsCount) * 100, 100)}%` }}
                />
              </div>
              <span className="text-xs font-bold text-slate-700 block">
                {scannedItemsCount}/{paidItemsCount} items scanned
              </span>
            </div>

            {/* Scan Simulators */}
            {import.meta.env.DEV && <div className="pt-2 flex flex-wrap gap-2 justify-center text-xs">
              <button
                onClick={handleScanAnotherItem}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl font-semibold text-slate-700"
              >
                + Scan Physical Item ({scannedItemsCount})
              </button>
              <button
                onClick={handleSimulateDiscrepancy}
                className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl font-bold text-rose-700"
              >
                🚨 Trigger 7 Items Discrepancy (+2 Extra)
              </button>
            </div>}

            {/* Complete Check Actions */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => {
                  setScannedItemsCount(0);
                  setShowDiscrepancy(false);
                  setTimerActive(false);
                }}
                className="py-3 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                Reset / Cancel
              </button>
              <button
                onClick={() => {
                  if (scannedItemsCount !== paidItemsCount) {
                    setShowDiscrepancy(true);
                  } else {
                    setTimerActive(false);
                    alert('Perfect match! Exit gate opened.');
                  }
                }}
                className="py-3 bg-azure-600 hover:bg-azure-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-md shadow-azure-600/20"
              >
                <span>Complete Check & Open Gate</span>
              </button>
            </div>
          </div>

          {/* Discrepancy Resolution Card */}
          {showDiscrepancy && (
            <div className="bg-white border-2 border-rose-300 rounded-3xl p-6 shadow-md space-y-5 animate-fadeIn">
              <div className="flex items-center space-x-2 text-rose-600 font-black text-sm">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <span>Physical Quantity Mismatch Detected</span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-700 flex justify-between">
                <span>Paid Items: <strong className="text-navy-800">{paidItemsCount}</strong></span>
                <span>|</span>
                <span>Scanned: <strong className="text-rose-600 font-bold">{scannedItemsCount}</strong></span>
              </div>

              <div className="text-center py-1">
                <span className="inline-block bg-rose-100 text-rose-800 border border-rose-200 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wide">
                  Extra Items: {scannedItemsCount - paidItemsCount} (Excess: KES 280)
                </span>
              </div>

              {/* 3 Color Resolution Buttons: Pay difference, return items, escalate */}
              <div className="grid grid-cols-3 gap-2.5 text-xs font-bold">
                <button
                  onClick={() => handleResolve('Customer paid difference KES 280 via M-Pesa')}
                  className="py-2.5 px-2 bg-azure-600 hover:bg-azure-700 text-white rounded-xl transition text-center shadow-xs"
                >
                  Pay Difference (KES 280)
                </button>

                <button
                  onClick={() => handleResolve('2 Extra items returned to shelf')}
                  className="py-2.5 px-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition text-center shadow-xs"
                >
                  Return Items
                </button>

                <button
                  onClick={() => handleResolve('Escalated to Store Supervisor Grace')}
                  className="py-2.5 px-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition text-center shadow-xs"
                >
                  Escalate
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
