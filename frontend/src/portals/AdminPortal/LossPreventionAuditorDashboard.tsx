import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  BarChart3,
  TrendingDown,
  Download,
  AlertTriangle,
  Search,
  FileText,
  Lock,
  Eye,
  ShieldCheck,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { Store, User, Product } from '../../types.js';
import { apiRequest, formatKes } from '../../api.js';
import { can } from '../../permissions.js';

interface LossPreventionAuditorDashboardProps {
  currentStore: Store;
  currentUser?: User | null;
  products: Product[];
}

export const LossPreventionAuditorDashboard: React.FC<LossPreventionAuditorDashboardProps> = ({
  currentStore,
  currentUser,
  products,
}) => {
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [fraudCases, setFraudCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCase, setSelectedCase] = useState<any | null>(null);
  const [summary, setSummary] = useState<any | null>(null);

  const loadLpData = async () => {
    try {
      setLoading(true);
      const [auditRes, fraudRes] = await Promise.all([
        apiRequest(`/audits?storeId=${currentStore._id}`),
        apiRequest(`/audits/fraud-summary?storeId=${currentStore._id}`),
      ]);
      if (auditRes?.logs) setAuditLogs(auditRes.logs);
      if (fraudRes?.recentDiscrepancies) setFraudCases(fraudRes.recentDiscrepancies);
      setSummary(fraudRes?.metrics || null);
    } catch (err: any) {
      console.warn('Error loading LP data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLpData();
  }, [currentStore._id]);

  const handleDownloadDossier = (incident: any) => {
    const jsonStr = JSON.stringify(incident, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incident-dossier-${incident._id || 'audit'}.json`;
    a.click();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <span className="bg-navy-100 text-navy-800 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Loss Prevention & Auditor Desk
            </span>
            <span className="text-xs text-slate-400">Read-Only Forensic Audit Oversight</span>
          </div>
          <h1 className="text-2xl font-black text-navy-800 mt-1">Shrinkage, Fraud & Discrepancy Forensic Evidence</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Non-repudiable audit logs, exit discrepancy trends, high-theft registers, and exportable forensic incident evidence dossiers.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 rounded-xl text-xs font-bold text-slate-600 border border-slate-200">
            <Lock className="w-3.5 h-3.5 text-slate-500" />
            <span>Read-Only Compliance Lock</span>
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Discrepancies Recorded</span>
          <p className="text-2xl font-black text-navy-800 mt-1">{summary?.discrepanciesCount ?? 0} Cases</p>
          <span className="text-[11px] text-brand-600 font-bold">{summary?.breakdown?.red ?? 0} high-risk exits</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Shrinkage Loss Recovered</span>
          <p className="text-2xl font-black text-brand-700 mt-1">{formatKes(summary?.totalLossPreventedMinor ?? 0)}</p>
          <span className="text-[11px] text-slate-500">Estimated excess value detected</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">High Theft Items Under Tag</span>
          <p className="text-2xl font-black text-navy-700 mt-1">
            {products.filter((p) => p.highTheft).length} SKUs
          </p>
          <span className="text-[11px] text-slate-500">Store catalogue high-risk products</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Audit Log Integrity</span>
          <p className="text-2xl font-black text-azure-600 mt-1">{auditLogs.length}</p>
          <span className="text-[11px] text-slate-500">Audit records loaded</span>
        </div>
      </div>

      {/* Discrepancy Queue & Incident Dossiers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Discrepancy Incident Registry</h3>
            <span className="text-xs text-slate-400">Click to inspect forensic dossier</span>
          </div>

          <div className="divide-y divide-slate-100">
            {fraudCases.map((inc) => (
              <div
                key={inc._id}
                onClick={() => setSelectedCase(inc)}
                className={`py-3.5 px-3 rounded-2xl cursor-pointer transition ${
                  selectedCase?._id === inc._id ? 'bg-navy-50/60 border border-navy-200' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-navy-800">{inc.orderId?.orderNumber || inc.exitEventId || inc._id.slice(-8)}</span>
                    <span className="text-slate-400">• {inc.itemsDiscrepant?.length || 0} mismatched items</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-navy-100 text-navy-800">
                    {inc.resolution || 'OPEN'}
                  </span>
                </div>
                <div className="text-xs text-slate-600 mt-1 flex justify-between">
                  <span>Customer: {inc.customerId?.name || 'Customer'}</span>
                  <span className="font-bold text-navy-800">Excess: {formatKes(inc.totalExcessValueMinor || 0)}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {inc.notes || new Date(inc.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
            {fraudCases.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No discrepancy cases are recorded for this store.</p>}
          </div>
        </div>

        {/* Selected Dossier Inspector */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider">Forensic Dossier</h3>
            {selectedCase && can(currentUser, 'reports:export') && (
              <button
                onClick={() => handleDownloadDossier(selectedCase)}
                className="text-xs font-bold text-navy-700 hover:underline flex items-center space-x-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>
            )}
          </div>

          {selectedCase ? (
            <div className="space-y-4 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Case Identification</span>
                <p className="font-mono font-bold text-navy-800 text-sm">{selectedCase.orderId?.orderNumber || selectedCase._id}</p>
                <p className="text-slate-500">Resolution: {selectedCase.resolution || 'OPEN'}</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-400">Paid Items Count:</span>
                  <strong className="text-navy-800">{selectedCase.itemsDiscrepant?.reduce((sum: number, item: any) => sum + (item.paidQuantity || 0), 0) || 0}</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-400">Physical Check Count:</span>
                  <strong className="text-rose-600">{selectedCase.itemsDiscrepant?.reduce((sum: number, item: any) => sum + (item.physicalQuantity || 0), 0) || 0}</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-400">Excess Variance Value:</span>
                  <strong className="text-navy-700">{formatKes(selectedCase.totalExcessValueMinor || 0)}</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-400">Exit Officer:</span>
                  <strong className="text-navy-800">{selectedCase.resolvedBy || 'Not recorded'}</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-400">Verified Timestamp:</span>
                  <strong className="text-navy-800">{new Date(selectedCase.createdAt).toLocaleString()}</strong>
                </div>
              </div>

              <div className="bg-brand-50 p-3 rounded-xl border border-brand-200 text-brand-800 text-[11px] font-bold">
                Resolution: {selectedCase.resolution || 'Pending review'}{selectedCase.notes ? ` · ${selectedCase.notes}` : ''}
              </div>
            </div>
          ) : (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <FileText className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs">Select any discrepancy incident on the left to inspect full audit chain of custody.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

