import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  Shield,
  ShieldCheck,
  Power,
  RotateCcw,
  Sliders,
  CheckCircle2,
  X,
  Plus,
  Key,
  Lock,
  Unlock,
  Check,
  AlertCircle,
} from 'lucide-react';
import { apiRequest } from '../../api.js';
import { can, canAny } from '../../permissions.js';
import { User } from '../../types.js';

interface UsersRolesSectionProps {
  organizations: any[];
  stores: any[];
  currentUser: User | null;
}

export const UsersRolesSection: React.FC<UsersRolesSectionProps> = ({ organizations, stores, currentUser }) => {
  const [activeTab, setActiveTab] = useState<'DIRECTORY' | 'MATRIX'>('DIRECTORY');

  // Directory State
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Permission Override Modal
  const [overrideUser, setOverrideUser] = useState<any | null>(null);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [grantedInput, setGrantedInput] = useState('');
  const [revokedInput, setRevokedInput] = useState('');

  // Who can do what matrix
  const [roleMatrix, setRoleMatrix] = useState<Record<string, string[]>>({});

  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (roleFilter) params.set('role', roleFilter);
      if (orgFilter) params.set('organizationId', orgFilter);
      if (statusFilter) params.set('status', statusFilter);

      const res = await apiRequest(`/platform/users?${params.toString()}`);
      if (res?.users) {
        setUsers(res.users);
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to fetch users' });
    } finally {
      setLoading(false);
    }
  };

  const loadMatrix = async () => {
    try {
      const res = await apiRequest('/platform/permissions/matrix');
      if (res?.rolePermissions) {
        setRoleMatrix(res.rolePermissions);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [roleFilter, orgFilter, statusFilter]);

  useEffect(() => {
    loadMatrix();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadUsers();
  };

  const handleToggleStatus = async (user: any) => {
    const nextStatus = user.status === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE';
    if (!window.confirm(`Set status of ${user.name} to ${nextStatus}?`)) return;

    try {
      await apiRequest(`/platform/users/${user._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, active: nextStatus === 'ACTIVE' }),
      });
      setMsg({ type: 'success', text: `User status changed to ${nextStatus}.` });
      loadUsers();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to update user status' });
    }
  };

  const handleRevokeSessions = async (user: any) => {
    if (!window.confirm(`Revoke all active sessions and tokens for ${user.name}? They will be forced to log in again.`)) {
      return;
    }
    try {
      await apiRequest(`/platform/users/${user._id}/revoke-sessions`, {
        method: 'POST',
      });
      setMsg({ type: 'success', text: `All active sessions revoked for ${user.name}.` });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to revoke sessions' });
    }
  };

  const handleOpenOverrides = (user: any) => {
    setOverrideUser(user);
    setGrantedInput((user.permissionOverrides?.granted || []).join(', '));
    setRevokedInput((user.permissionOverrides?.revoked || []).join(', '));
  };

  const handleSaveOverrides = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const granted = grantedInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const revoked = revokedInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      await apiRequest(`/users/${overrideUser._id}/permissions`, {
        method: 'POST',
        body: JSON.stringify({ granted, revoked, reason: 'Super Admin manual override' }),
      });

      setMsg({ type: 'success', text: `Permission overrides applied for ${overrideUser.name}.` });
      setOverrideUser(null);
      loadUsers();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to save overrides' });
    }
  };

  const handleResetOverrides = async () => {
    if (!window.confirm(`Reset custom permission overrides back to role default?`)) return;
    try {
      await apiRequest(`/users/${overrideUser._id}/permissions`, {
        method: 'DELETE',
      });
      setMsg({ type: 'success', text: `Overrides cleared. User reverted to standard role permissions.` });
      setOverrideUser(null);
      loadUsers();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to clear overrides' });
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

      {/* Top Bar with View Switcher */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-navy-800">Users, Roles & Access Control</h2>
          <p className="text-xs text-slate-500">
            Global user directory, session revocation, permission overrides, and role matrix
          </p>
        </div>

        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          <button
            onClick={() => setActiveTab('DIRECTORY')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'DIRECTORY' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
            }`}
          >
            User Directory
          </button>
          <button
            onClick={() => setActiveTab('MATRIX')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'MATRIX' ? 'bg-navy-600 text-white shadow-xs' : 'text-slate-600 hover:text-navy-800'
            }`}
          >
            Role & Permissions Matrix
          </button>
        </div>
      </div>

      {activeTab === 'DIRECTORY' ? (
        <div className="space-y-4">
          {/* Filters Bar */}
          <form
            onSubmit={handleSearchSubmit}
            className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-2xl p-3 shadow-xs"
          >
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                placeholder="Search name, phone (07...), email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-500"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 bg-white"
            >
              <option value="">All Roles</option>
              <option value="PLATFORM_OWNER">Platform Owner</option>
              <option value="PLATFORM_ADMIN">Platform Admin</option>
              <option value="FINANCE_ADMIN">Finance Admin</option>
              <option value="FINANCE_APPROVER">Finance Approver</option>
              <option value="ORG_OWNER">Org Owner</option>
              <option value="ORG_ADMIN">Org Admin</option>
              <option value="BRANCH_MANAGER">Branch Manager</option>
              <option value="STORE_MANAGER">Store Manager</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="PICKER">Store Picker</option>
              <option value="EXIT_STAFF">Exit Officer</option>
              <option value="CUSTOMER">Customer</option>
            </select>

            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 bg-white"
            >
              <option value="">All Supermarkets</option>
              {organizations.map((o) => (
                <option key={o._id} value={o._id}>
                  {o.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 bg-white"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="DEACTIVATED">Deactivated</option>
              <option value="SUSPENDED">Suspended</option>
            </select>

            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-xl bg-navy-600 text-white font-semibold text-xs hover:bg-navy-700 transition"
            >
              Filter
            </button>
          </form>

          {/* Users Table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">User</th>
                    <th>Phone / Login ID</th>
                    <th>Role</th>
                    <th>Supermarket Workspace</th>
                    <th>Assigned Branch</th>
                    <th>Status</th>
                    <th className="text-right px-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {users.map((user) => {
                    const self = user._id === currentUser?.id;
                    const targetIsOwner = ['PLATFORM_OWNER', 'SYSTEM_ADMIN'].includes(user.role);
                    const platformAdmin = currentUser?.role === 'PLATFORM_ADMIN';
                    const mayManage = canAny(currentUser, ['org:users:manage', 'platform:admins:create', 'system:admin']) && !self && !(platformAdmin && targetIsOwner);
                    return (
                    <tr key={user._id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-navy-800">{user.name}</div>
                        {user.email && <div className="text-[11px] text-slate-400">{user.email}</div>}
                      </td>
                      <td className="font-mono text-slate-600">{user.phone}</td>
                      <td>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-navy-50 text-navy-700 border border-navy-200">
                          {user.role}
                        </span>
                      </td>
                      <td>
                        {user.organizationId ? (
                          <span className="font-semibold text-navy-700">{user.organizationId.name}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td>
                        {user.storeId ? (
                          <span className="font-mono text-slate-700">{user.storeId.name || user.storeId.code}</span>
                        ) : (
                          <span className="text-slate-400">All Branches</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            user.status === 'ACTIVE'
                              ? 'bg-brand-100 text-brand-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {user.status || 'ACTIVE'}
                        </span>
                      </td>
                      <td className="text-right px-4">
                        <div className="flex items-center justify-end space-x-1.5">
                          {mayManage && <button
                            onClick={() => handleOpenOverrides(user)}
                            title="Permission Overrides"
                            className="p-1.5 text-slate-500 hover:text-navy-600 hover:bg-navy-50 rounded-lg transition"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                          </button>}
                          {mayManage && <button
                            onClick={() => handleRevokeSessions(user)}
                            title="Revoke All Active Sessions (Emergency Kill Switch)"
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>}
                          {mayManage && <button
                            onClick={() => handleToggleStatus(user)}
                            title={user.status === 'ACTIVE' ? 'Deactivate Account' : 'Activate Account'}
                            className={`p-1.5 rounded-lg transition ${
                              user.status === 'ACTIVE'
                                ? 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                                : 'text-slate-500 hover:text-brand-600 hover:bg-brand-50'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>}
                        </div>
                      </td>
                    </tr>
                  );})}

                  {users.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        {loading ? 'Searching user directory...' : 'No users found matching query.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Who Can Do What Matrix */
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-navy-800">Role Capabilities Matrix</h3>
              <p className="text-xs text-slate-500">
                Architectural mapping of system roles to authoritative permissions
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(roleMatrix).map(([role, perms]) => (
              <div
                key={role}
                className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-navy-900 bg-navy-100 px-2 py-0.5 rounded-full text-[10px]">
                    {role}
                  </span>
                  <span className="text-[11px] text-slate-500">{perms.length} capabilities</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {perms.map((p) => (
                    <div key={p} className="flex items-center space-x-1.5 text-[11px] text-slate-700">
                      <Check className="w-3 h-3 text-brand-600 shrink-0" />
                      <span className="font-mono">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Permission Overrides Modal */}
      {overrideUser && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-base text-navy-800">Permission Overrides</h3>
                <p className="text-[11px] text-slate-500">
                  User: <span className="font-bold">{overrideUser.name}</span> ({overrideUser.role})
                </p>
              </div>
              <button onClick={() => setOverrideUser(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>

            <form onSubmit={handleSaveOverrides} className="space-y-4">
              <div>
                <label className="text-slate-600 font-semibold block mb-1">
                  Granted Overrides (comma-separated permissions)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. orders:cancel, reports:export, fraud:review"
                  value={grantedInput}
                  onChange={(e) => setGrantedInput(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl font-mono text-[11px]"
                />
                <span className="text-[10px] text-slate-400">Explicitly grants permissions in addition to role defaults.</span>
              </div>

              <div>
                <label className="text-slate-600 font-semibold block mb-1">
                  Revoked Overrides (comma-separated permissions)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. exit:override, payouts:approve"
                  value={revokedInput}
                  onChange={(e) => setRevokedInput(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl font-mono text-[11px]"
                />
                <span className="text-[10px] text-slate-400">Explicitly revokes permissions even if granted by role.</span>
              </div>

              <div className="pt-3 border-t flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleResetOverrides}
                  className="text-rose-600 hover:underline font-semibold"
                >
                  Clear Overrides (Revert to Role)
                </button>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setOverrideUser(null)}
                    className="px-3 py-1.5 rounded-xl text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-navy-600 text-white font-semibold hover:bg-navy-700"
                  >
                    Save Overrides
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
