import React, { useEffect, useState } from 'react';
import { UserPlus, Shield, RefreshCw, Building2 } from 'lucide-react';
import { apiRequest } from '../../api.js';
import { can } from '../../permissions.js';
import { User } from '../../types.js';

interface Props {
  currentUser?: User | null;
  organizations: any[];
}

/**
 * Platform sub-admin management: appoint staff with a hand-picked permission set,
 * optionally restricted to selected supermarket organizations.
 */
export const SubAdminsSection: React.FC<Props> = ({ currentUser, organizations }) => {
  const canManage = can(currentUser, 'platform:admins:create');
  const [staff, setStaff] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<{ group: string; permissions: string[] }[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', jobTitle: '' });
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [selectedOrgs, setSelectedOrgs] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set());
  const [editOrgs, setEditOrgs] = useState<Set<string>>(new Set());

  const load = async () => {
    try {
      setLoading(true);
      const [staffRes, catRes] = await Promise.all([
        apiRequest('/platform/users/subadmins'),
        apiRequest('/platform/permissions/subadmin-catalog'),
      ]);
      if (staffRes?.success) setStaff(staffRes.staff || []);
      if (catRes?.success) setCatalog(catRes.catalog || []);
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, value: string) => {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    setter(next);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/platform/users/subadmins', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          permissions: [...selectedPerms],
          managedOrganizationIds: [...selectedOrgs],
        }),
      });
      if (res?.temporaryPassword) {
        setMsg({ type: 'success', text: `Sub-admin created. Temporary password: ${res.temporaryPassword} — share it securely; they must change it on first login.` });
      } else {
        setMsg({ type: 'success', text: 'Sub-admin created.' });
      }
      setShowForm(false);
      setForm({ name: '', phone: '', email: '', jobTitle: '' });
      setSelectedPerms(new Set()); setSelectedOrgs(new Set());
      load();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    try {
      await apiRequest(`/platform/users/${editTarget.id}/subadmin`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions: [...editPerms], managedOrganizationIds: [...editOrgs] }),
      });
      setMsg({ type: 'success', text: 'Sub-admin permissions updated.' });
      setEditTarget(null);
      load();
    } catch (e: any) { setMsg({ type: 'error', text: e.message }); }
  };

  const openEdit = (member: any) => {
    setEditTarget(member);
    setEditPerms(new Set(member.permissionOverrides?.granted || []));
    setEditOrgs(new Set((member.managedOrganizationIds || []).map(String)));
  };

  const orgName = (id: string) => organizations.find((o) => String(o._id) === String(id))?.name || id;
  const subAdmins = staff.filter((s) => s.role === 'PLATFORM_SUBADMIN');
  const builtIn = staff.filter((s) => s.role !== 'PLATFORM_SUBADMIN');

  const permPicker = (perms: Set<string>, setter: (s: Set<string>) => void) => (
    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
      {catalog.map((group) => (
        <div key={group.group}>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{group.group}</p>
          <div className="space-y-1">
            {group.permissions.map((p) => (
              <label key={p} className="flex items-center gap-2 text-xs text-navy-800">
                <input type="checkbox" checked={perms.has(p)} onChange={() => toggle(perms, setter, p)} />
                <span className="font-mono text-[11px]">{p}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const orgPicker = (orgs: Set<string>, setter: (s: Set<string>) => void) => (
    <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1 bg-slate-50">
      {organizations.map((o) => (
        <label key={o._id} className="flex items-center gap-2 text-xs text-navy-800">
          <input type="checkbox" checked={orgs.has(String(o._id))} onChange={() => toggle(orgs, setter, String(o._id))} />
          {o.name}
        </label>
      ))}
      {organizations.length === 0 && <p className="text-[11px] text-slate-400">No organizations yet.</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      {msg && <div className={`p-3 rounded-xl text-xs font-semibold ${msg.type === 'success' ? 'bg-brand-50 text-brand-800 border border-brand-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>{msg.text}</div>}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Sub-admins get exactly the permissions you select — nothing more. Leave organizations empty for platform-wide access.</p>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border border-slate-200 rounded-xl text-slate-500"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          {canManage && (
            <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-navy-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5" /> Appoint sub-admin
            </button>
          )}
        </div>
      </div>

      {/* Create form */}
      {showForm && canManage && (
        <form onSubmit={create} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border border-slate-200 rounded-xl p-2.5 text-xs" required />
            <input placeholder="Phone (login)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="border border-slate-200 rounded-xl p-2.5 text-xs" required />
            <input placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="border border-slate-200 rounded-xl p-2.5 text-xs" />
            <input placeholder="Title (e.g. Finance Sub-admin)" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} className="border border-slate-200 rounded-xl p-2.5 text-xs" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1"><Shield className="w-3 h-3" /> Permissions</p>
            {permPicker(selectedPerms, setSelectedPerms)}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1"><Building2 className="w-3 h-3" /> Restrict to supermarkets (optional)</p>
            {orgPicker(selectedOrgs, setSelectedOrgs)}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold">Create sub-admin</button>
          </div>
        </form>
      )}

      {/* Sub-admins list */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-navy-800 text-sm mb-3">Permission-built sub-admins ({subAdmins.length})</h3>
        <div className="space-y-2">
          {subAdmins.map((s) => (
            <div key={s.id} className="border border-slate-100 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-navy-800">{s.name} {s.jobTitle && <span className="text-slate-400 font-normal">· {s.jobTitle}</span>}</p>
                  <p className="text-[10px] text-slate-400">{s.phone} {s.email ? `· ${s.email}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.status === 'ACTIVE' && s.active ? 'bg-brand-50 text-brand-700' : 'bg-rose-50 text-rose-600'}`}>{s.status}</span>
                  {canManage && <button onClick={() => openEdit(s)} className="text-[10px] font-bold text-navy-600 border border-slate-200 rounded-lg px-2 py-1">Edit access</button>}
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                {(s.permissionOverrides?.granted || []).length} granted permissions ·{' '}
                {s.managedOrganizationIds?.length ? `Scoped to ${s.managedOrganizationIds.map(orgName).join(', ')}` : 'Platform-wide'}
              </p>
            </div>
          ))}
          {subAdmins.length === 0 && <p className="text-xs text-slate-400">No sub-admins appointed yet.</p>}
        </div>
      </div>

      {/* Built-in platform roles */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-navy-800 text-sm mb-3">Built-in platform staff ({builtIn.length})</h3>
        <div className="space-y-1.5">
          {builtIn.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-xs border border-slate-100 rounded-xl px-3 py-2">
              <span className="font-semibold text-navy-800">{s.name}</span>
              <span className="font-mono text-[10px] text-slate-400">{s.role}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Edit modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-navy-800/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-2xl w-full border border-slate-200 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-navy-800">Edit access — {editTarget.name}</h3>
              <button onClick={() => setEditTarget(null)} className="text-slate-400 hover:text-slate-700 text-lg">×</button>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Permissions</p>
              {permPicker(editPerms, setEditPerms)}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Organization scope</p>
              {orgPicker(editOrgs, setEditOrgs)}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditTarget(null)} className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600">Cancel</button>
              <button onClick={saveEdit} className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold">Save access</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
