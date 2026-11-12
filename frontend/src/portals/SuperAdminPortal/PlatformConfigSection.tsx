import React, { useState } from 'react';
import {
  Sliders,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Bell,
  Percent,
  CheckCircle2,
  X,
  Megaphone,
} from 'lucide-react';
import { apiRequest } from '../../api.js';

interface PlatformConfigSectionProps {
  settings: any;
  onRefresh: () => void;
}

export const PlatformConfigSection: React.FC<PlatformConfigSectionProps> = ({ settings, onRefresh }) => {
  const [form, setForm] = useState({
    platformName: settings?.platformName || 'Scan & Go',
    maintenanceMode: Boolean(settings?.maintenanceMode),
    maintenanceMessage: settings?.maintenanceMessage || 'The system is currently undergoing scheduled maintenance.',
    allowPublicRegistration: settings?.allowPublicRegistration !== false,
    maxStoresPerOrg: settings?.maxStoresPerOrg || 10,
    announcement: {
      active: Boolean(settings?.announcement?.active),
      message: settings?.announcement?.message || 'Scheduled platform maintenance window at midnight Sunday.',
      level: settings?.announcement?.level || 'INFO',
    },
    taxAndFees: {
      vatPercentage: settings?.taxAndFees?.vatPercentage || 16,
      platformFeeType: settings?.taxAndFees?.platformFeeType || 'PERCENT',
      platformFeeValue: settings?.taxAndFees?.platformFeeValue || 1.5,
      bagFeeKes: (settings?.taxAndFees?.bagFeeMinor || 1000) / 100,
    },
    featureFlags: {
      scanAndGoEnabled: settings?.featureFlags?.scanAndGoEnabled !== false,
      clickAndCollectEnabled: settings?.featureFlags?.clickAndCollectEnabled !== false,
      biometricVerification: Boolean(settings?.featureFlags?.biometricVerification),
      autoReconcileSTK: settings?.featureFlags?.autoReconcileSTK !== false,
    },
    notificationTemplates: {
      customerOtp:
        settings?.notificationTemplates?.customerOtp ||
        'Your Scan & Go verification code is {{otp}}. Valid for 5 minutes. Do not share this code.',
      orderReceipt:
        settings?.notificationTemplates?.orderReceipt ||
        'Scan & Go Receipt: Order #{{orderNumber}} of {{amount}} confirmed. Show exit token at gate.',
      pickupReady:
        settings?.notificationTemplates?.pickupReady ||
        'Your Shop & Collect order #{{orderNumber}} is ready at {{storeName}}, slot {{slot}}. PIN: {{pin}}',
    },
  });

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await apiRequest('/platform/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          platformName: form.platformName,
          maintenanceMode: form.maintenanceMode,
          maintenanceMessage: form.maintenanceMessage,
          allowPublicRegistration: form.allowPublicRegistration,
          maxStoresPerOrg: Number(form.maxStoresPerOrg),
          announcement: form.announcement,
          taxAndFees: {
            vatPercentage: Number(form.taxAndFees.vatPercentage),
            platformFeeType: form.taxAndFees.platformFeeType,
            platformFeeValue: Number(form.taxAndFees.platformFeeValue),
            bagFeeMinor: Math.round(Number(form.taxAndFees.bagFeeKes) * 100),
          },
          featureFlags: form.featureFlags,
          notificationTemplates: form.notificationTemplates,
        }),
      });
      setMsg({ type: 'success', text: 'Global platform configuration saved and broadcasted live across all instances!' });
      onRefresh();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to update platform settings' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {msg && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center justify-between ${
            msg.type === 'success'
              ? 'bg-brand-50 text-brand-800 border border-brand-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-navy-800">Platform Global Settings & Feature Flags</h2>
          <p className="text-xs text-slate-500">
            Global operational switches, VAT & platform convenience fees, broadcast banners, and notification templates
          </p>
        </div>

        <button
          onClick={handleSaveAll}
          disabled={saving}
          className="px-4 py-2 bg-navy-600 hover:bg-navy-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 transition"
        >
          {saving ? 'Broadcasting...' : 'Save All Settings'}
        </button>
      </div>

      <form onSubmit={handleSaveAll} className="space-y-6">
        {/* 1. System Master Gate & Announcement Banner */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 text-xs">
          <div className="flex items-center space-x-2">
            <Megaphone className="w-4 h-4 text-navy-600" />
            <h3 className="font-bold text-navy-800 text-sm">Platform Announcements & Emergency Gates</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Maintenance Mode */}
            <div className={`p-4 rounded-xl border space-y-3 ${form.maintenanceMode ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-slate-50 border-slate-200'}`}>
              <label className="flex items-center space-x-2 font-bold cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={form.maintenanceMode}
                  onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <span>Maintenance Mode (Emergency Lockdown)</span>
              </label>
              <p className="text-[11px] text-slate-500">
                When enabled, all non-admin traffic is blocked with the maintenance message below.
              </p>
              <input
                value={form.maintenanceMessage}
                onChange={(e) => setForm({ ...form, maintenanceMessage: e.target.value })}
                placeholder="Lockdown reason message..."
                className="w-full px-3 py-1.5 bg-white border rounded-lg text-xs"
              />
            </div>

            {/* Broadcast Banner */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <label className="flex items-center space-x-2 font-bold cursor-pointer text-sm text-navy-700">
                <input
                  type="checkbox"
                  checked={form.announcement.active}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      announcement: { ...form.announcement, active: e.target.checked },
                    })
                  }
                  className="rounded text-navy-600 w-4 h-4"
                />
                <span>Active Broadcast Announcement Pill</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={form.announcement.level}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      announcement: { ...form.announcement, level: e.target.value as any },
                    })
                  }
                  className="px-2 py-1 bg-white border rounded-lg text-xs"
                >
                  <option value="INFO">INFO (Blue)</option>
                  <option value="WARNING">WARNING (Amber)</option>
                  <option value="CRITICAL">CRITICAL (Red)</option>
                </select>
                <input
                  value={form.announcement.message}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      announcement: { ...form.announcement, message: e.target.value },
                    })
                  }
                  placeholder="Banner message..."
                  className="col-span-2 px-3 py-1 bg-white border rounded-lg text-xs"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 2. Global Feature Flags */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 text-xs">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-brand-600" />
            <h3 className="font-bold text-navy-800 text-sm">Platform Core Feature Flags</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-3.5 bg-slate-50 border rounded-xl space-y-1">
              <label className="flex items-center space-x-2 font-bold text-navy-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.featureFlags.scanAndGoEnabled}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      featureFlags: { ...form.featureFlags, scanAndGoEnabled: e.target.checked },
                    })
                  }
                  className="rounded text-brand-600"
                />
                <span>Scan & Go Checkout</span>
              </label>
              <p className="text-[11px] text-slate-500">Enable in-store barcode scanning for shoppers</p>
            </div>

            <div className="p-3.5 bg-slate-50 border rounded-xl space-y-1">
              <label className="flex items-center space-x-2 font-bold text-navy-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.featureFlags.clickAndCollectEnabled}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      featureFlags: { ...form.featureFlags, clickAndCollectEnabled: e.target.checked },
                    })
                  }
                  className="rounded text-brand-600"
                />
                <span>Shop & Collect Pickup</span>
              </label>
              <p className="text-[11px] text-slate-500">Allow slot booking and store picker workflows</p>
            </div>

            <div className="p-3.5 bg-slate-50 border rounded-xl space-y-1">
              <label className="flex items-center space-x-2 font-bold text-navy-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.featureFlags.autoReconcileSTK}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      featureFlags: { ...form.featureFlags, autoReconcileSTK: e.target.checked },
                    })
                  }
                  className="rounded text-brand-600"
                />
                <span>Auto STK Requery</span>
              </label>
              <p className="text-[11px] text-slate-500">Automated Daraja STK polling on delays</p>
            </div>

            <div className="p-3.5 bg-slate-50 border rounded-xl space-y-1">
              <label className="flex items-center space-x-2 font-bold text-navy-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.allowPublicRegistration}
                  onChange={(e) => setForm({ ...form, allowPublicRegistration: e.target.checked })}
                  className="rounded text-brand-600"
                />
                <span>Public Customer Signups</span>
              </label>
              <p className="text-[11px] text-slate-500">Allow self-registration via OTP verification</p>
            </div>
          </div>
        </div>

        {/* 3. Tax and Fee Rules */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 text-xs">
          <div className="flex items-center space-x-2">
            <Percent className="w-4 h-4 text-navy-600" />
            <h3 className="font-bold text-navy-800 text-sm">Tax & Convenience Platform Fee Rules</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="text-slate-500 block mb-1">Standard VAT Rate (%)</label>
              <input
                type="number"
                value={form.taxAndFees.vatPercentage}
                onChange={(e) =>
                  setForm({
                    ...form,
                    taxAndFees: { ...form.taxAndFees, vatPercentage: Number(e.target.value) },
                  })
                }
                className="w-full px-3 py-1.5 border rounded-xl font-bold"
              />
              <span className="text-[10px] text-slate-400">Default Kenya VAT: 16%</span>
            </div>

            <div>
              <label className="text-slate-500 block mb-1">Platform Fee Type</label>
              <select
                value={form.taxAndFees.platformFeeType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    taxAndFees: { ...form.taxAndFees, platformFeeType: e.target.value as any },
                  })
                }
                className="w-full px-3 py-1.5 border rounded-xl bg-white"
              >
                <option value="PERCENT">Percentage (%)</option>
                <option value="FIXED">Fixed Amount (KES)</option>
              </select>
            </div>

            <div>
              <label className="text-slate-500 block mb-1">Fee Value</label>
              <input
                type="number"
                step="0.1"
                value={form.taxAndFees.platformFeeValue}
                onChange={(e) =>
                  setForm({
                    ...form,
                    taxAndFees: { ...form.taxAndFees, platformFeeValue: Number(e.target.value) },
                  })
                }
                className="w-full px-3 py-1.5 border rounded-xl font-bold"
              />
              <span className="text-[10px] text-slate-400">Convenience charge per cart</span>
            </div>

            <div>
              <label className="text-slate-500 block mb-1">Eco Packaging / Bag Fee (KES)</label>
              <input
                type="number"
                value={form.taxAndFees.bagFeeKes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    taxAndFees: { ...form.taxAndFees, bagFeeKes: Number(e.target.value) },
                  })
                }
                className="w-full px-3 py-1.5 border rounded-xl font-bold"
              />
              <span className="text-[10px] text-slate-400">Per Shop & Collect parcel</span>
            </div>
          </div>
        </div>

        {/* 4. Notification Templates */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 text-xs">
          <div className="flex items-center space-x-2">
            <Bell className="w-4 h-4 text-amber-500" />
            <h3 className="font-bold text-navy-800 text-sm">Customer SMS & Push Notification Templates</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-slate-500 block mb-1 font-semibold">OTP Verification Message</label>
              <textarea
                rows={3}
                value={form.notificationTemplates.customerOtp}
                onChange={(e) =>
                  setForm({
                    ...form,
                    notificationTemplates: { ...form.notificationTemplates, customerOtp: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border rounded-xl text-xs font-mono"
              />
              <span className="text-[10px] text-slate-400">Variables: {'{{otp}}'}</span>
            </div>

            <div>
              <label className="text-slate-500 block mb-1 font-semibold">Receipt Confirmation</label>
              <textarea
                rows={3}
                value={form.notificationTemplates.orderReceipt}
                onChange={(e) =>
                  setForm({
                    ...form,
                    notificationTemplates: { ...form.notificationTemplates, orderReceipt: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border rounded-xl text-xs font-mono"
              />
              <span className="text-[10px] text-slate-400">Variables: {'{{orderNumber}}, {{amount}}'}</span>
            </div>

            <div>
              <label className="text-slate-500 block mb-1 font-semibold">Pickup Slot Ready</label>
              <textarea
                rows={3}
                value={form.notificationTemplates.pickupReady}
                onChange={(e) =>
                  setForm({
                    ...form,
                    notificationTemplates: { ...form.notificationTemplates, pickupReady: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border rounded-xl text-xs font-mono"
              />
              <span className="text-[10px] text-slate-400">Variables: {'{{orderNumber}}, {{storeName}}, {{slot}}, {{pin}}'}</span>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
