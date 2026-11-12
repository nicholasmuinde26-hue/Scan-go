import React, { useCallback, useEffect, useState } from 'react';
import { Users, RefreshCw, ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react';
import { apiRequest } from '../../api.js';

interface DirectoryStaff {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: string;
  status: string;
  lastLoginAt?: string;
  mfaEnabled: boolean;
  extraPermissions: string[];
  removedPermissions: string[];
  joinedAt?: string;
}

interface DirectoryBranch {
  storeId: string;
  name: string;
  code: string;
  location?: string;
  active: boolean;
  roleCounts: Record<string, number>;
  staff: DirectoryStaff[];
}

interface RoleGuideEntry {
  role: string;
  label: string;
  portals: string[];
  permissions: string[];
}

interface DirectoryResponse {
  totals: { branches: number; staff: number };
  branches: DirectoryBranch[];
  roleGuide: RoleGuideEntry[];
}

const ROLE_LABELS: Record<string, string> = {
  BRANCH_MANAGER: 'Branch Manager',
  STORE_MANAGER: 'Store Manager',
  SUPERVISOR: 'Supervisor',
  STOCK_CONTROLLER: 'Stock Controller',
  PICKER: 'Picker',
  PACKER_VERIFIER: 'Packer / Verifier',
  EXIT_OFFICER: 'Exit Officer',
  EXIT_STAFF: 'Exit Staff',
  CASHIER_CUSTOMER_SERVICE: 'Cashier / Customer Service',
  DELIVERY_COLLECTION_HANDOVER: 'Collection Handover',
};

const roleLabel = (role: string) => ROLE_LABELS[role] || role;
const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never');

/**
 * Every branch with its staff and their roles, for organization and platform admins.
 * The role filter defaults to all roles; "Stock controllers" is one tap away.
 */
export const BranchRoleDirectory: React.FC = () => {
  const [role, setRole] = useState('');
  const [data, setData] = useState<DirectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [showGuide, setShowGuide] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest(`/stores/staff-directory${role ? `?role=${encodeURIComponent(role)}` : ''}`);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Could not load the staff directory.');
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    void load();
  }, [load]);

  const guide = data?.roleGuide || [];
  const focused = guide.find((g) => g.role === role);

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-navy-800 uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-600" /> Staff and roles by branch
          </h3>
          <p className="text-xs text-slate-500">
            {data ? `${data.totals.staff} staff across ${data.totals.branches} branches` : 'Every branch, its staff and their roles.'}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            aria-label="Filter by role"
            className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 bg-white"
          >
            <option value="">All roles</option>
            {Object.keys(ROLE_LABELS).map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
          <button onClick={() => setRole(role === 'STOCK_CONTROLLER' ? '' : 'STOCK_CONTROLLER')} className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${role === 'STOCK_CONTROLLER' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            Stock controllers
          </button>
          <button onClick={() => void load()} aria-label="Refresh" className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>}

      {focused && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-1.5">
          <p className="font-bold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> What a {focused.label} can do</p>
          <p>Workspace: {focused.portals.join(', ') || 'none'}</p>
          <p className="font-mono text-[11px] leading-relaxed">{focused.permissions.join(' · ')}</p>
        </div>
      )}

      {!loading && data && data.branches.length === 0 && <p className="text-xs text-slate-500">No branches found.</p>}

      <div className="space-y-3">
        {(data?.branches || []).map((branch) => {
          const isOpen = open[branch.storeId] ?? Boolean(role);
          return (
            <div key={branch.storeId} className="border border-slate-200 rounded-2xl overflow-hidden">
              <button
                onClick={() => setOpen((prev) => ({ ...prev, [branch.storeId]: !isOpen }))}
                className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-50"
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-navy-800 truncate">{branch.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{branch.code}{branch.location ? ` · ${branch.location}` : ''}{branch.active ? '' : ' · inactive'}</p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {Object.entries(branch.roleCounts).length === 0 && <span className="text-[11px] text-slate-400">No staff</span>}
                  {Object.entries(branch.roleCounts).map(([r, count]) => (
                    <span key={r} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                      {roleLabel(r)} × {count}
                    </span>
                  ))}
                </div>
              </button>

              {isOpen && branch.staff.length > 0 && (
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="py-2.5 px-4">Name</th>
                        <th className="py-2.5 px-3">Role</th>
                        <th className="py-2.5 px-3">Phone</th>
                        <th className="py-2.5 px-3">Email</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Last sign-in</th>
                        <th className="py-2.5 px-3">Extra access</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {branch.staff.map((member) => (
                        <tr key={member.id}>
                          <td className="py-2.5 px-4 font-bold text-navy-800">{member.name}</td>
                          <td className="py-2.5 px-3">{roleLabel(member.role)}</td>
                          <td className="py-2.5 px-3 font-mono">{member.phone}</td>
                          <td className="py-2.5 px-3">{member.email || '—'}</td>
                          <td className="py-2.5 px-3">{member.status}</td>
                          <td className="py-2.5 px-3">{formatDate(member.lastLoginAt)}</td>
                          <td className="py-2.5 px-3 text-[11px] text-slate-500">
                            {member.extraPermissions.length === 0 && member.removedPermissions.length === 0
                              ? 'Standard role'
                              : [member.extraPermissions.length ? `+${member.extraPermissions.length} added` : '', member.removedPermissions.length ? `−${member.removedPermissions.length} removed` : ''].filter(Boolean).join(', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {isOpen && branch.staff.length === 0 && <p className="border-t border-slate-100 p-4 text-xs text-slate-500">No staff with this role in this branch yet.</p>}
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-100 pt-4">
        <button onClick={() => setShowGuide((v) => !v)} className="text-xs font-bold text-brand-700 hover:text-brand-800 flex items-center gap-1.5">
          {showGuide ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Role guide: what each branch role can access
        </button>
        {showGuide && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Workspace</th>
                  <th className="py-2.5 px-3">Permissions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {guide.map((g) => (
                  <tr key={g.role}>
                    <td className="py-2.5 px-3 font-bold text-navy-800 whitespace-nowrap">{g.label}</td>
                    <td className="py-2.5 px-3">{g.portals.join(', ') || '—'}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">{g.permissions.join(' · ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default BranchRoleDirectory;
