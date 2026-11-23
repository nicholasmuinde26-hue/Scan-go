import { Router } from 'express';
import { Region, Department, CustomRole } from './structure.model.js';
import Store from '../stores/store.model.js';
import User from '../users/user.model.js';
import AuditLog from '../audits/audit.model.js';
import { authenticate, requirePermission, requireRoleScope, AuthRequest, canAccessOrganization, filterGrantablePermissions, roleScope } from '../../middleware/auth.js';

const router = Router();

// All structure endpoints are org-scoped: org roles see only their own org,
// platform roles may pass ?organizationId= (bounded by managedOrganizationIds).
function orgIdOf(req: AuthRequest): string | undefined {
  if (roleScope(req.user!.role) === 'ORG' || roleScope(req.user!.role) === 'REGION' || roleScope(req.user!.role) === 'BRANCH') {
    return req.user!.organizationId;
  }
  const requested = String(req.query.organizationId || '');
  return requested || undefined;
}

function forbiddenOrg(req: AuthRequest, res: any): boolean {
  const orgId = orgIdOf(req);
  if (!orgId || !canAccessOrganization(req.user!, orgId)) {
    res.status(403).json({ success: false, error: 'Organization scope is required.' });
    return true;
  }
  return false;
}

async function audit(req: AuthRequest, action: string, entityId: string, newValue: any) {
  await AuditLog.create({
    actorId: req.user?.id, actorRole: req.user?.role, actorName: req.user?.name,
    action, entityType: 'ORGANIZATION', entityId,
    newValue: { organizationId: orgIdOf(req), ...newValue },
    reason: `Org structure change by ${req.user?.name}`,
  });
}

// ---------------- Regions ----------------

router.get('/regions', authenticate, requirePermission('org:read'), async (req: AuthRequest, res) => {
  try {
    if (forbiddenOrg(req, res)) return;
    const regions = await Region.find({ organizationId: orgIdOf(req) }).sort({ name: 1 });
    res.json({ success: true, regions });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/regions', authenticate, requirePermission('org:config'), requireRoleScope('ORG'), async (req: AuthRequest, res) => {
  try {
    if (forbiddenOrg(req, res)) return;
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ success: false, error: 'Region name and code are required.' });
    const region = await Region.create({ organizationId: orgIdOf(req), name: String(name).trim(), code: String(code).trim().toUpperCase() });
    await audit(req, 'CREATE_REGION', String(region._id), { name: region.name, code: region.code });
    res.status(201).json({ success: true, region });
  } catch (e: any) {
    if (e.code === 11000) return res.status(409).json({ success: false, error: 'A region with that code already exists.' });
    res.status(500).json({ success: false, error: e.message });
  }
});

router.patch('/regions/:id', authenticate, requirePermission('org:config'), requireRoleScope('ORG'), async (req: AuthRequest, res) => {
  try {
    if (forbiddenOrg(req, res)) return;
    const region = await Region.findOne({ _id: req.params.id, organizationId: orgIdOf(req) });
    if (!region) return res.status(404).json({ success: false, error: 'Region not found.' });
    if (req.body.name) region.name = String(req.body.name).trim();
    if (req.body.code) region.code = String(req.body.code).trim().toUpperCase();
    if (req.body.active !== undefined) region.active = !!req.body.active;
    await region.save();
    await audit(req, 'UPDATE_REGION', String(region._id), region.toObject());
    res.json({ success: true, region });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// Assign a branch to a region (or clear it). Validates the store belongs to the org.
router.post('/regions/:id/assign-store', authenticate, requirePermission('org:config'), requireRoleScope('ORG'), async (req: AuthRequest, res) => {
  try {
    if (forbiddenOrg(req, res)) return;
    const region = await Region.findOne({ _id: req.params.id, organizationId: orgIdOf(req) });
    if (!region) return res.status(404).json({ success: false, error: 'Region not found.' });
    const storeId = String(req.body.storeId || '');
    const store = await Store.findOne({ _id: storeId, organizationId: orgIdOf(req) });
    if (!store) return res.status(404).json({ success: false, error: 'Branch not found in this organization.' });
    store.regionId = region._id as any;
    await store.save();
    await audit(req, 'ASSIGN_STORE_TO_REGION', String(store._id), { storeId: store._id, regionId: region._id, region: region.name });
    res.json({ success: true, storeId: store._id, regionId: region._id });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ---------------- Departments ----------------

router.get('/departments', authenticate, requirePermission('org:read'), async (req: AuthRequest, res) => {
  try {
    if (forbiddenOrg(req, res)) return;
    const departments = await Department.find({ organizationId: orgIdOf(req) }).sort({ name: 1 });
    res.json({ success: true, departments });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/departments', authenticate, requirePermission('org:config'), requireRoleScope('ORG'), async (req: AuthRequest, res) => {
  try {
    if (forbiddenOrg(req, res)) return;
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ success: false, error: 'Department name and code are required.' });
    const department = await Department.create({ organizationId: orgIdOf(req), name: String(name).trim(), code: String(code).trim().toUpperCase() });
    await audit(req, 'CREATE_DEPARTMENT', String(department._id), { name: department.name, code: department.code });
    res.status(201).json({ success: true, department });
  } catch (e: any) {
    if (e.code === 11000) return res.status(409).json({ success: false, error: 'A department with that code already exists.' });
    res.status(500).json({ success: false, error: e.message });
  }
});

router.patch('/departments/:id', authenticate, requirePermission('org:config'), requireRoleScope('ORG'), async (req: AuthRequest, res) => {
  try {
    if (forbiddenOrg(req, res)) return;
    const department = await Department.findOne({ _id: req.params.id, organizationId: orgIdOf(req) });
    if (!department) return res.status(404).json({ success: false, error: 'Department not found.' });
    if (req.body.name) department.name = String(req.body.name).trim();
    if (req.body.code) department.code = String(req.body.code).trim().toUpperCase();
    if (req.body.active !== undefined) department.active = !!req.body.active;
    await department.save();
    await audit(req, 'UPDATE_DEPARTMENT', String(department._id), department.toObject());
    res.json({ success: true, department });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ---------------- Custom roles ----------------

router.get('/custom-roles', authenticate, requirePermission('org:read'), async (req: AuthRequest, res) => {
  try {
    if (forbiddenOrg(req, res)) return;
    const roles = await CustomRole.find({ organizationId: orgIdOf(req) }).sort({ name: 1 });
    res.json({ success: true, roles });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/custom-roles', authenticate, requirePermission('org:users:manage'), requireRoleScope('ORG'), async (req: AuthRequest, res) => {
  try {
    if (forbiddenOrg(req, res)) return;
    const { name, description, scope, permissions } = req.body;
    if (!name || !scope || !Array.isArray(permissions)) {
      return res.status(400).json({ success: false, error: 'name, scope (ORG|BRANCH|REGION) and permissions[] are required.' });
    }
    const ceilingRole = scope === 'ORG' ? 'ORG_ADMIN' : scope === 'REGION' ? 'REGION_MANAGER' : 'BRANCH_MANAGER';
    const allowed = new Set(filterGrantablePermissions(ceilingRole as any, permissions as any));
    const granted = permissions.filter((p: string) => allowed.has(p as any));
    const dropped = permissions.filter((p: string) => !allowed.has(p as any));
    const role = await CustomRole.create({
      organizationId: orgIdOf(req), name: String(name).trim(), description, scope,
      permissions: granted, createdBy: req.user!.id,
    });
    await audit(req, 'CREATE_CUSTOM_ROLE', String(role._id), { name: role.name, scope: role.scope, permissions: granted, dropped });
    res.status(201).json({ success: true, role, droppedPermissions: dropped });
  } catch (e: any) {
    if (e.code === 11000) return res.status(409).json({ success: false, error: 'A role with that name already exists.' });
    res.status(500).json({ success: false, error: e.message });
  }
});

router.patch('/custom-roles/:id', authenticate, requirePermission('org:users:manage'), requireRoleScope('ORG'), async (req: AuthRequest, res) => {
  try {
    if (forbiddenOrg(req, res)) return;
    const role = await CustomRole.findOne({ _id: req.params.id, organizationId: orgIdOf(req) });
    if (!role) return res.status(404).json({ success: false, error: 'Role not found.' });
    if (req.body.name) role.name = String(req.body.name).trim();
    if (req.body.description !== undefined) role.description = req.body.description;
    if (req.body.active !== undefined) role.active = !!req.body.active;
    if (Array.isArray(req.body.permissions)) {
      const ceilingRole = role.scope === 'ORG' ? 'ORG_ADMIN' : role.scope === 'REGION' ? 'REGION_MANAGER' : 'BRANCH_MANAGER';
      const allowed = new Set(filterGrantablePermissions(ceilingRole as any, req.body.permissions as any));
      role.permissions = req.body.permissions.filter((p: string) => allowed.has(p as any));
    }
    await role.save();
    await audit(req, 'UPDATE_CUSTOM_ROLE', String(role._id), role.toObject());
    res.json({ success: true, role });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// Org structure overview: regions with their branches, departments, custom roles.
router.get('/overview', authenticate, requirePermission('org:read'), async (req: AuthRequest, res) => {
  try {
    if (forbiddenOrg(req, res)) return;
    const orgId = orgIdOf(req);
    const [regions, departments, customRoles, stores] = await Promise.all([
      Region.find({ organizationId: orgId }),
      Department.find({ organizationId: orgId }),
      CustomRole.find({ organizationId: orgId }),
      Store.find({ organizationId: orgId }).select('name code location active regionId managerId').populate('managerId', 'name role'),
    ]);
    res.json({ success: true, regions, departments, customRoles, stores });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

export default router;
