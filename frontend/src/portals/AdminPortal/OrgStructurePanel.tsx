import React, { useEffect, useState } from 'react';
import { Building2, GitBranch, Users, Plus, RefreshCw, MapPin } from 'lucide-react';
import { apiRequest } from '../../api.js';
import { can } from '../../permissions.js';
import { User } from '../../types.js';

interface Props {
  currentUser?: User | null;
  stores: any[];
}

/** Regions, departments and custom roles — the optional org-structure layer. */
export const OrgStructurePanel: React.FC<Props> = ({ currentUser, stores }) => {
  const canManage = can(currentUser, 'org:config');
  const [data, setData] = useState<{ regions: any[]; departments: any[]; customRoles: any[]; stores: any[] }>({ regions: [], departments: [], customRoles: [], stores: [] });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [regionForm, setRegionForm] = useState({ name: '', code: '' });
  const [deptForm, setDeptForm] = useState({ name: '', code: '' });
  const [roleForm, setRoleForm] = useState({ name: '', scope: 'BRANCH', permissions: '' });
  const [assignStoreId, setAssignStoreId] = useState('');
  const [assignRegionId, setAssignRegionId] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const res = await apiRequest('/org-structure/overview');
      if (res?.success) setData({ regions: res.regions || [], departments: res.departments || [], customRoles: res.customRoles || [], stores: res.stores || [] });
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const post = async (path: string, body: any, ok: string) => {
    try {
      await apiRequest(path, { method: 'POST', body: JSON.stringify(body) });
      setMsg({ type: 'success', text: ok });
      load();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };

  const assignRegion = async () => {
    if (!assignRegionId || !assignStoreId) return;
    try {
      await apiRequest(`/org-structure/regions/${assignRegionId}/assign-store`, { method: 'POST', body: JSON.stringify({ storeId: assignStoreId }) });
      setMsg({ type: 'success', text: 'Branch assigned to region.' });
      load();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };

  const regionName = (id: any) => data.regions.find((r) => String(r._id) === String(id))?.name;

  return (
    <div className="space-y-6">
      {msg && <div className={`p-3 rounded-xl text-xs font-semibold ${msg.type === 'success' ? 'bg-brand-50 text-brand-800 border border-brand-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{msg.text}</div>}

      {/* Branches grouped by region */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-navy-800 text-sm flex items-center gap-2"><MapPin className="w-4 h-4 text-brand-600" /> Branches & Regions</h3>
        <p className="text-[11px] text-slate-500 mt-1">Regions are optional groupings — they organize branches but do not grant access by themselves.</p>
        <div className="mt-4 space-y-2">
          {data.stores.map((s) => (
            <div key={s._id} className="flex items-center justify-between border border-slate-100 rounded-xl px-3 py-2 text-xs">
              <div>
                <span className="font-bold text-navy-800">{s.name}</span>
                <span className="text-slate-400 ml-2 font-mono">{s.code}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.regionId ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
                {s.regionId ? regionName(s.regionId) || 'Region' : 'No region'}
              </span>
            </div>
          ))}
          {data.stores.length === 0 && <p className="text-xs text-slate-400">No branches found.</p>}
        </div>
        {canManage && data.regions.length > 0 && (
          <div className="mt-4 flex gap-2">
            <select value={assignStoreId} onChange={(e) => setAssignStoreId(e.target.value)} className="flex-1 border border-slate-200 rounded-xl p-2.5 text-xs bg-white">
              <option value="">Select branch…</option>
              {data.stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
            <select value={assignRegionId} onChange={(e) => setAssignRegionId(e.target.value)} className="flex-1 border border-slate-200 rounded-xl p-2.5 text-xs bg-white">
              <option value="">Select region…</option>
              {data.regions.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
            </select>
            <button onClick={assignRegion} className="px-4 py-2 bg-navy-800 text-white rounded-xl text-xs font-bold">Assign</button>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Regions */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-bold text-navy-800 text-sm flex items-center gap-2"><GitBranch className="w-4 h-4 text-brand-600" /> Regions <span className="text-slate-400 font-normal">({data.regions.length})</span></h3>
          <div className="mt-3 space-y-2">
            {data.regions.map((r) => (
              <div key={r._id} className="flex items-center justify-between border border-slate-100 rounded-xl px-3 py-2 text-xs">
                <span className="font-semibold text-navy-800">{r.name}</span>
                <span className="font-mono text-slate-400">{r.code}</span>
              </div>
            ))}
            {data.regions.length === 0 && <p className="text-[11px] text-slate-400">No regions — fine for a single-branch shop.</p>}
          </div>
          {canManage && (
            <form onSubmit={(e) => { e.preventDefault(); post('/org-structure/regions', regionForm, 'Region created.'); setRegionForm({ name: '', code: '' }); }} className="mt-3 space-y-2">
              <input placeholder="Region name" value={regionForm.name} onChange={(e) => setRegionForm({ ...regionForm, name: e.target.value })} className="w-full border border-slate-200 rounded-xl p-2.5 text-xs" required />
              <input placeholder="Code (e.g. CENTRAL)" value={regionForm.code} onChange={(e) => setRegionForm({ ...regionForm, code: e.target.value.toUpperCase() })} className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-mono" required />
              <button className="w-full py-2 bg-brand-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"><Plus className="w-3 h-3" /> Add region</button>
            </form>
          )}
        </div>

        {/* Departments */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-bold text-navy-800 text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-brand-600" /> Departments <span className="text-slate-400 font-normal">({data.departments.length})</span></h3>
          <div className="mt-3 space-y-2">
            {data.departments.map((d) => (
              <div key={d._id} className="flex items-center justify-between border border-slate-100 rounded-xl px-3 py-2 text-xs">
                <span className="font-semibold text-navy-800">{d.name}</span>
                <span className="font-mono text-slate-400">{d.code}</span>
              </div>
            ))}
            {data.departments.length === 0 && <p className="text-[11px] text-slate-400">No departments defined.</p>}
          </div>
          {canManage && (
            <form onSubmit={(e) => { e.preventDefault(); post('/org-structure/departments', deptForm, 'Department created.'); setDeptForm({ name: '', code: '' }); }} className="mt-3 space-y-2">
              <input placeholder="Department name" value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} className="w-full border border-slate-200 rounded-xl p-2.5 text-xs" required />
              <input placeholder="Code (e.g. CHECKOUT)" value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })} className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-mono" required />
              <button className="w-full py-2 bg-brand-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"><Plus className="w-3 h-3" /> Add department</button>
            </form>
          )}
        </div>

        {/* Custom roles */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-bold text-navy-800 text-sm flex items-center gap-2"><Users className="w-4 h-4 text-brand-600" /> Custom Roles <span className="text-slate-400 font-normal">({data.customRoles.length})</span></h3>
          <div className="mt-3 space-y-2">
            {data.customRoles.map((r) => (
              <div key={r._id} className="border border-slate-100 rounded-xl px-3 py-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-navy-800">{r.name}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{r.scope}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">{(r.permissions || []).length} permissions</p>
              </div>
            ))}
            {data.customRoles.length === 0 && <p className="text-[11px] text-slate-400">No custom roles — built-in roles cover standard jobs.</p>}
          </div>
          {can(currentUser, 'org:users:manage') && (
            <form onSubmit={(e) => {
              e.preventDefault();
              const permissions = roleForm.permissions.split(',').map((p) => p.trim()).filter(Boolean);
              post('/org-structure/custom-roles', { name: roleForm.name, scope: roleForm.scope, permissions }, 'Custom role created.');
              setRoleForm({ name: '', scope: 'BRANCH', permissions: '' });
            }} className="mt-3 space-y-2">
              <input placeholder="Role name (e.g. Night Supervisor)" value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} className="w-full border border-slate-200 rounded-xl p-2.5 text-xs" required />
              <select value={roleForm.scope} onChange={(e) => setRoleForm({ ...roleForm, scope: e.target.value })} className="w-full border border-slate-200 rounded-xl p-2.5 text-xs bg-white">
                <option value="BRANCH">Branch scope</option>
                <option value="REGION">Region scope</option>
                <option value="ORG">Organization scope</option>
              </select>
              <input placeholder="Permissions, comma-separated (e.g. inventory:read, reports:read)" value={roleForm.permissions} onChange={(e) => setRoleForm({ ...roleForm, permissions: e.target.value })} className="w-full border border-slate-200 rounded-xl p-2.5 text-xs" />
              <button className="w-full py-2 bg-brand-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1"><Plus className="w-3 h-3" /> Add role</button>
            </form>
          )}
        </div>
      </div>

      <button onClick={load} className="text-xs text-navy-600 font-bold flex items-center gap-1"><RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh structure</button>
    </div>
  );
};
