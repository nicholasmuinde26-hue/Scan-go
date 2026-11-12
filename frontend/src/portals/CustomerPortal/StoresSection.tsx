import React, { useMemo } from 'react';
import { Building2, MapPin, Clock, Check } from 'lucide-react';
import { Store } from '../../types.js';

interface Props {
  stores: Store[];
  currentStore: Store;
  onSelectStore?: (store: Store) => void | boolean;
  goShop: () => void;
}

export const StoresSection: React.FC<Props> = ({ stores, currentStore, onSelectStore, goShop }) => {
  const groups = useMemo(() => {
    const grouped = new Map<string, Store[]>();
    stores.forEach((store) => {
      const organization = store.organization?.name || (store.organizationId ? 'Registered supermarket' : 'Independent stores');
      if (!grouped.has(organization)) grouped.set(organization, []);
      grouped.get(organization)!.push(store);
    });
    return [...grouped.entries()]
      .map(([name, branches]) => [name, branches.sort((a, b) => a.name.localeCompare(b.name))] as [string, Store[]])
      .sort(([a], [b]) => a.localeCompare(b));
  }, [stores]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-black text-navy-800">Supermarkets and branches</h2>
        <p className="mt-1 text-xs text-slate-500">Choose a supermarket and its registered location. Prices, stock, and pickup times are branch-specific.</p>
      </div>
      {stores.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-xs text-slate-400">No stores are available right now.</div>
      ) : (
        <div className="space-y-6">
          {groups.map(([organization, branches]) => (
            <section key={organization} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-brand-50 to-white px-5 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-brand-700 shadow-sm"><Building2 className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-black text-navy-800">{organization}</h3>
                  <p className="text-[11px] text-slate-500">{branches.length} registered {branches.length === 1 ? 'branch' : 'branches'}</p>
                </div>
              </header>
              <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                {branches.map((store) => {
                  const current = store._id === currentStore._id;
                  return (
                    <article key={store._id} className={`flex flex-col justify-between gap-4 rounded-2xl border p-4 transition ${current ? 'border-brand-300 bg-brand-50/50 ring-1 ring-brand-100' : 'border-slate-200 hover:border-brand-200 hover:shadow-sm'}`}>
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-bold text-navy-800">{store.name}</h4>
                            <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500">
                              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" /> {store.location}
                            </p>
                          </div>
                          {current && <span className="flex shrink-0 items-center gap-1 rounded-full border border-brand-200 bg-white px-2 py-1 text-[9px] font-bold text-brand-800"><Check className="h-3 w-3" /> Current</span>}
                        </div>
                        {store.openHours && <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-600"><Clock className="h-3.5 w-3.5 text-slate-400" />{store.openHours.daysDescription} · {store.openHours.openingTime}–{store.openHours.closingTime}</p>}
                      </div>
                      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                        <span className="text-[10px] text-slate-400">{(store.pickupSlots || []).filter((slot) => slot.active).length} pickup slots</span>
                        {current ? (
                          <button onClick={goShop} className="rounded-xl bg-navy-800 px-3 py-2 text-[11px] font-bold text-white hover:bg-navy-700">Continue shopping</button>
                        ) : (
                          <button
                            disabled={!onSelectStore}
                            onClick={() => {
                              if (onSelectStore?.(store) === false) return;
                              goShop();
                            }}
                            className="rounded-xl bg-brand-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                          >
                            Shop this branch
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
