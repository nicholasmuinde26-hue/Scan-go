import React, { useEffect, useState } from 'react';
import { TrendingUp, PackageSearch, AlertTriangle, RefreshCw, Loader2, LineChart } from 'lucide-react';
import { Store } from '../../types.js';
import { apiRequest, formatKes } from '../../api.js';

interface TopItem {
  productId: string;
  name: string;
  barcode?: string;
  unitsSold: number;
  revenueMinor: number;
  avgDailyUnits: number;
  currentStock: number;
  daysOfStock: number | null;
  stockoutRisk: boolean;
}

interface ForecastDay {
  dateOffset: number;
  predictedQty: number;
  lowerBound: number;
  upperBound: number;
}

interface Forecast {
  method: string;
  dailyForecast: ForecastDay[];
  recommendedOrderQty: number;
  stockoutRiskDays: number | null;
  notes: string[];
}

interface DemandForecastViewProps {
  currentStore: Store;
}

/**
 * Demand & forecast dashboard: top sellers + AI-assisted reorder guidance.
 * Data comes from /analytics/demand/* — sales history stays in Mongo, the
 * Python service only sees daily quantity aggregates.
 */
export const DemandForecastView: React.FC<DemandForecastViewProps> = ({ currentStore }) => {
  const [days, setDays] = useState(30);
  const [items, setItems] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<TopItem | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [forecastMeta, setForecastMeta] = useState<{ source: string; historyDays: number; totalUnitsSold: number } | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  const loadTop = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest(`/analytics/demand/top?storeId=${currentStore._id}&days=${days}&limit=25`);
      setItems(res.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load demand data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStore._id, days]);

  const loadForecast = async (item: TopItem) => {
    setSelected(item);
    setForecast(null);
    setForecastMeta(null);
    try {
      setForecastLoading(true);
      const res = await apiRequest(
        `/analytics/demand/forecast?storeId=${currentStore._id}&productId=${item.productId}&days=90&horizon=7&leadTime=1`
      );
      setForecast(res.forecast);
      setForecastMeta({ source: res.forecastSource, historyDays: res.historyDays, totalUnitsSold: res.totalUnitsSold });
    } catch (err: any) {
      setError(err.message || 'Forecast failed');
    } finally {
      setForecastLoading(false);
    }
  };

  const maxPredicted = forecast ? Math.max(...forecast.dailyForecast.map((d) => d.predictedQty), 1) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-black text-navy-800 text-sm flex items-center space-x-2">
            <LineChart className="w-4 h-4 text-brand-600" />
            <span>Demand & Replenishment Forecast</span>
          </h3>
          <p className="text-[11px] text-slate-500">
            Top sellers and AI-assisted order quantities. Forecasts use the Python analytics service when available.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${
                days === d ? 'bg-navy-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
              }`}
            >
              {d}d
            </button>
          ))}
          <button onClick={loadTop} className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Top sellers table */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
              <tr>
                <th className="text-left px-4 py-2.5 font-black">Product</th>
                <th className="text-right px-3 py-2.5 font-black">Sold ({days}d)</th>
                <th className="text-right px-3 py-2.5 font-black">Avg/day</th>
                <th className="text-right px-3 py-2.5 font-black">Stock</th>
                <th className="text-right px-3 py-2.5 font-black">Cover</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No sales in this window.</td></tr>
              )}
              {items.map((item) => (
                <tr
                  key={item.productId}
                  onClick={() => loadForecast(item)}
                  className={`cursor-pointer hover:bg-brand-50/50 ${selected?.productId === item.productId ? 'bg-brand-50' : ''}`}
                >
                  <td className="px-4 py-2.5">
                    <p className="font-bold text-navy-800">{item.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{item.barcode}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold">{item.unitsSold}</td>
                  <td className="px-3 py-2.5 text-right">{item.avgDailyUnits}</td>
                  <td className="px-3 py-2.5 text-right font-bold">{item.currentStock}</td>
                  <td className="px-3 py-2.5 text-right">
                    {item.daysOfStock === null ? (
                      <span className="text-slate-400">—</span>
                    ) : item.stockoutRisk ? (
                      <span className="inline-flex items-center space-x-1 text-rose-600 font-black">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{item.daysOfStock}d</span>
                      </span>
                    ) : (
                      <span className="text-slate-600">{item.daysOfStock}d</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Forecast detail */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          {!selected ? (
            <div className="text-center py-10 text-slate-400">
              <PackageSearch className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-xs">Select a product to see its demand forecast.</p>
            </div>
          ) : forecastLoading ? (
            <div className="text-center py-10 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
              <p className="text-xs mt-2">Forecasting…</p>
            </div>
          ) : forecast ? (
            <>
              <div>
                <h4 className="font-black text-navy-800 text-sm">{selected.name}</h4>
                <p className="text-[10px] text-slate-400">
                  {forecastMeta?.historyDays ?? 0} days of history · {forecastMeta?.totalUnitsSold ?? 0} units sold
                  {forecastMeta?.source === 'ai-service' ? ' · AI forecast' : ' · local fallback'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-brand-50 rounded-xl p-3">
                  <p className="text-[10px] font-black text-brand-700 uppercase">Order qty (7d)</p>
                  <p className="text-xl font-black text-navy-800">{forecast.recommendedOrderQty}</p>
                </div>
                <div className={`rounded-xl p-3 ${forecast.stockoutRiskDays !== null && forecast.stockoutRiskDays <= 14 ? 'bg-rose-50' : 'bg-slate-50'}`}>
                  <p className="text-[10px] font-black text-slate-500 uppercase">Stockout risk</p>
                  <p className="text-xl font-black text-navy-800">
                    {forecast.stockoutRiskDays === null ? '—' : `${forecast.stockoutRiskDays}d`}
                  </p>
                </div>
              </div>

              {/* 7-day forecast bars */}
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Predicted daily demand</p>
                <div className="flex items-end space-x-1.5 h-20">
                  {forecast.dailyForecast.map((d) => (
                    <div key={d.dateOffset} className="flex-1 flex flex-col items-center space-y-1">
                      <div
                        className="w-full bg-azure-500/80 rounded-t"
                        style={{ height: `${Math.max(4, (d.predictedQty / maxPredicted) * 56)}px` }}
                        title={`Day ${d.dateOffset}: ${d.predictedQty} units`}
                      />
                      <span className="text-[9px] text-slate-400">D{d.dateOffset}</span>
                    </div>
                  ))}
                </div>
              </div>

              {forecast.notes?.length > 0 && (
                <div className="space-y-1">
                  {forecast.notes.map((n, i) => (
                    <p key={i} className="text-[10px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 font-semibold">
                      {n}
                    </p>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-rose-600">Forecast unavailable for this product.</p>
          )}
        </div>
      </div>
    </div>
  );
};
