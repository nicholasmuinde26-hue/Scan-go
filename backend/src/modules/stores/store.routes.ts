import { Router } from 'express';
import bcrypt from 'bcryptjs';
import Store from './store.model.js';
import User from '../users/user.model.js';
import Product from '../products/product.model.js';
import Order from '../orders/order.model.js';
import { authenticate, authorize, requirePermission, requireRoleScope, roleScope, ROLE_PERMISSIONS, getRolePortalConfig, AuthRequest } from '../../middleware/auth.js';
import { requireStoreAccess } from '../../middleware/access.js';
import AuditLog from '../audits/audit.model.js';
import { ENV } from '../../config/environment.js';
import { checkSubscriptionGate, getOrganizationFeatureAvailability } from '../subscriptions/subscription.service.js';

const router = Router();

// Get all active stores (public/general list)
router.get('/', async (_req, res) => {
  try {
    // Security fix: Don't expose manager phone/email publicly
    const stores = await Store.find({ active: true })
      .populate('managerId', 'name role')
      .populate('organizationId', 'name slug branding.logoUrl branding.primaryColor');
    // Tell the app up front whether a branch offers Shop & Collect on its current plan, so customers are not
    // taken all the way to payment before finding out. One check per organization.
    const collectByOrg = new Map<string, { allowed: boolean; reason?: string }>();
    for (const store of stores as any[]) {
      const orgId = store.organizationId?._id?.toString?.() || store.organizationId?.toString?.();
      if (!orgId || collectByOrg.has(orgId)) continue;
      try {
        collectByOrg.set(orgId, await getOrganizationFeatureAvailability(orgId, 'click_and_collect'));
      } catch {
        collectByOrg.set(orgId, { allowed: false, reason: 'Shop & Collect availability could not be checked.' });
      }
    }
    const customerStores = stores.map((store: any) => {
      const value = store.toObject();
      const organization = value.organizationId;
      const orgKey = organization?._id?.toString?.() || organization?.toString?.();
      return {
        ...value,
        shopAndCollectAvailable: orgKey ? collectByOrg.get(orgKey)?.allowed === true : false,
        shopAndCollectUnavailableReason: orgKey ? collectByOrg.get(orgKey)?.reason : 'This branch is not assigned to a supermarket.',
        collectDepositPercent: ENV.CC_DEPOSIT_PERCENT,
        organizationId: organization?._id?.toString?.() || organization?.toString?.(),
        organization: organization && typeof organization === 'object'
          ? { name: organization.name, slug: organization.slug, branding: organization.branding }
          : undefined,
      };
    });
    res.json({ success: true, stores: customerStores });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /workspaces/all - Super Admin view of all supermarket workspaces with KPIs and assigned admins
router.get('/workspaces/all', authenticate, authorize('SYSTEM_ADMIN'), async (_req: AuthRequest, res) => {
  try {
    const stores = await Store.find().sort({ createdAt: -1 });

    const workspaces = await Promise.all(
      stores.map(async (store) => {
        // Find assigned manager
        let manager: any = null;
        if (store.managerId) {
          manager = await User.findById(store.managerId).select('name phone email role');
        }
        if (!manager) {
          // Fallback: check if any user has role STORE_MANAGER for this store
          manager = await User.findOne({ storeId: store._id, role: 'STORE_MANAGER' }).select('name phone email role');
        }

        const [productCount, orderCount, staffCount] = await Promise.all([
          Product.countDocuments({ storeId: store._id }),
          Order.countDocuments({ storeId: store._id }),
          User.countDocuments({
            storeId: store._id,
            role: { $in: ['STORE_MANAGER', 'SUPERVISOR', 'EXIT_STAFF', 'PICKER'] },
          }),
        ]);

        return {
          ...store.toObject(),
          manager,
          productCount,
          orderCount,
          staffCount,
        };
      })
    );

    res.json({ success: true, workspaces });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Branch roles that appear in the staff directory, with plain-language labels for the role guide.
const DIRECTORY_ROLES: Array<{ role: string; label: string }> = [
  { role: 'BRANCH_MANAGER', label: 'Branch Manager' },
  { role: 'STORE_MANAGER', label: 'Store Manager (legacy)' },
  { role: 'SUPERVISOR', label: 'Supervisor' },
  { role: 'STOCK_CONTROLLER', label: 'Stock Controller' },
  { role: 'PICKER', label: 'Picker' },
  { role: 'PACKER_VERIFIER', label: 'Packer / Verifier' },
  { role: 'EXIT_OFFICER', label: 'Exit Officer' },
  { role: 'EXIT_STAFF', label: 'Exit Staff (legacy)' },
  { role: 'CASHIER_CUSTOMER_SERVICE', label: 'Cashier / Customer Service' },
  { role: 'DELIVERY_COLLECTION_HANDOVER', label: 'Collection Handover' },
];

// GET /staff-directory - every branch with its staff and their roles, for organization and platform admins.
// Optional ?role=STOCK_CONTROLLER narrows it to one role. Also returns a role guide (portal and permissions per role).
router.get('/staff-directory', authenticate, requirePermission('staff:read'), requireRoleScope('ORG', 'PLATFORM'), async (req: AuthRequest, res) => {
  try {
    const roleFilter = typeof req.query.role === 'string' ? req.query.role : undefined;
    if (roleFilter && !DIRECTORY_ROLES.some((r) => r.role === roleFilter)) {
      res.status(400).json({ success: false, error: 'Unknown branch role.' });
      return;
    }

    // Organization roles only ever see their own organization's branches; platform roles may narrow by organization.
    const storeQuery: Record<string, any> = {};
    if (roleScope(req.user!.role) === 'ORG') {
      if (!req.user!.organizationId) {
        res.status(403).json({ success: false, error: 'Your account is not linked to an organization.' });
        return;
      }
      storeQuery.organizationId = req.user!.organizationId;
    } else if (typeof req.query.organizationId === 'string' && /^[a-f\d]{24}$/i.test(req.query.organizationId)) {
      storeQuery.organizationId = req.query.organizationId;
    }

    const stores = await Store.find(storeQuery).select('name code location active').sort({ name: 1 });
    const staff = await User.find({
      storeId: { $in: stores.map((s) => s._id) },
      role: roleFilter ? roleFilter : { $in: DIRECTORY_ROLES.map((r) => r.role) },
    }).select('name phone email role storeId status lastLoginAt mfaEnabled permissionOverrides createdAt').sort({ name: 1 });

    const byStore = new Map<string, any[]>();
    for (const member of staff as any[]) {
      const key = String(member.storeId);
      if (!byStore.has(key)) byStore.set(key, []);
      byStore.get(key)!.push({
        id: member._id,
        name: member.name,
        phone: member.phone,
        email: member.email,
        role: member.role,
        status: member.status || 'ACTIVE',
        lastLoginAt: member.lastLoginAt,
        mfaEnabled: !!member.mfaEnabled,
        extraPermissions: member.permissionOverrides?.granted || [],
        removedPermissions: member.permissionOverrides?.revoked || [],
        joinedAt: member.createdAt,
      });
    }

    const branches = stores.map((store: any) => {
      const members = byStore.get(String(store._id)) || [];
      const roleCounts: Record<string, number> = {};
      for (const m of members) roleCounts[m.role] = (roleCounts[m.role] || 0) + 1;
      return { storeId: store._id, name: store.name, code: store.code, location: store.location, active: store.active, roleCounts, staff: members };
    });

    const roleGuide = DIRECTORY_ROLES.map(({ role, label }) => ({
      role,
      label,
      portals: getRolePortalConfig(role as any).allowedPortals,
      permissions: ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] || [],
    }));

    res.json({
      success: true,
      filter: { role: roleFilter || null },
      totals: { branches: branches.length, staff: staff.length },
      branches,
      roleGuide,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get store by ID
router.get('/:id', async (req, res) => {
  try {
    // Security fix: Don't expose manager phone/email publicly
    const store = await Store.findById(req.params.id).populate('managerId', 'name role');
    if (!store) {
      res.status(404).json({ success: false, error: 'Store branch not found.' });
      return;
    }
    res.json({ success: true, store });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a branch for the caller's own supermarket. Staff assignment is handled by invites.
router.post('/', authenticate, requirePermission('stores:create'), requireRoleScope('ORG'), async (req: AuthRequest, res) => {
  try {
    const {
      name,
      code,
      location,
      pickupSlots,
      exitLanes,
      fraudConfig,
    } = req.body;
    const organizationId = req.user!.organizationId;

    if (!name || !code || !location) {
      res.status(400).json({ success: false, error: 'Store name, code, and location are required.' });
      return;
    }
    if (!organizationId) {
      res.status(400).json({ success: false, error: 'organizationId is required. Create workspace branches through /platform/organizations/:id/stores.' });
      return;
    }
    const gate = await checkSubscriptionGate(String(organizationId), 'create_store');
    if (!gate.allowed) {
      res.status(gate.status).json({ success: false, error: gate.reason, code: gate.code });
      return;
    }

    const existingCode = await Store.findOne({ code: code.trim().toUpperCase() });
    if (existingCode) {
      res.status(400).json({ success: false, error: `Store with code ${code} already exists.` });
      return;
    }

    // Default exit lanes if not supplied
    const defaultExitLanes = exitLanes && exitLanes.length > 0
      ? exitLanes
      : [
          { laneId: 'LANE-01', name: 'Exit Express Lane 1 (Self Checkout)', active: true },
          { laneId: 'LANE-02', name: 'Exit Lane 2 (Trolleys & Bags)', active: true },
        ];

    // Default pickup slots if not supplied
    const defaultPickupSlots = pickupSlots && pickupSlots.length > 0
      ? pickupSlots
      : [
          { slotId: 'SLOT-01', startTime: '09:00', endTime: '12:00', capacity: 25, active: true },
          { slotId: 'SLOT-02', startTime: '13:00', endTime: '16:00', capacity: 25, active: true },
          { slotId: 'SLOT-03', startTime: '17:00', endTime: '20:00', capacity: 25, active: true },
        ];

    // Default fraud config if not supplied
    const defaultFraudConfig = {
      largeBasketMinor: 1000000,
      mediumBasketMinor: 500000,
      fullCheckBasketMinor: 1500000,
      maxItemsWithoutFullCheck: 25,
      manualEntryAmberThreshold: 4,
      randomAuditPercentage: 5,
      amberScoreThreshold: 30,
      amberFullScoreThreshold: 60,
      amberTimeoutSeconds: 15,
      ...fraudConfig,
    };

    const newStore = await Store.create({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      location: location.trim(),
      active: true,
      organizationId,
      pickupSlots: defaultPickupSlots,
      exitLanes: defaultExitLanes,
      fraudConfig: defaultFraudConfig,
    });

    // Record Audit Log
    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'CREATE_STORE_WORKSPACE',
      entityType: 'STORE',
      entityId: newStore._id.toString(),
      storeId: newStore._id,
      newValue: {
        store: newStore.toObject(),
        manager: null,
      },
      reason: 'Super Admin provisioned new supermarket workspace',
    });

    res.status(201).json({
      success: true,
      message: `Supermarket workspace '${newStore.name}' created successfully.`,
      store: newStore,
      manager: null,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update Supermarket Workspace (System Admin only)
router.put('/:id', authenticate, authorize('SYSTEM_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const store = await Store.findById(req.params.id);
    if (!store) {
      res.status(404).json({ success: false, error: 'Store not found.' });
      return;
    }

    const previous = store.toObject();

    if (req.body.name) store.name = req.body.name.trim();
    if (req.body.code) store.code = req.body.code.trim().toUpperCase();
    if (req.body.location) store.location = req.body.location.trim();
    if (req.body.active !== undefined) store.active = req.body.active;
    if (req.body.exitLanes) store.exitLanes = req.body.exitLanes;
    if (req.body.pickupSlots) store.pickupSlots = req.body.pickupSlots;

    await store.save();

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'UPDATE_STORE_WORKSPACE',
      entityType: 'STORE',
      entityId: store._id.toString(),
      storeId: store._id,
      previousValue: previous,
      newValue: store.toObject(),
      reason: req.body.reason || 'Super Admin workspace configuration update',
    });

    res.json({ success: true, message: 'Supermarket workspace updated.', store });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:id/assign-admin - Assign or create a Supermarket Admin for a specific workspace (System Admin only)
router.post('/:id/assign-admin', authenticate, authorize('SYSTEM_ADMIN'), requireRoleScope('ORG'), async (req: AuthRequest, res) => {
  try {
    const store = await Store.findById(req.params.id);
    if (!store) {
      res.status(404).json({ success: false, error: 'Store workspace not found.' });
      return;
    }

    const { userId, name, phone, email, password } = req.body;
    let managerUser: any = null;

    if (userId) {
      // Assign existing user
      managerUser = await User.findById(userId);
      if (!managerUser) {
        res.status(404).json({ success: false, error: 'Specified user was not found.' });
        return;
      }
      managerUser.role = 'STORE_MANAGER';
      managerUser.storeId = store._id as any;
      await managerUser.save();
    } else if (name && phone) {
      // Create or update user by phone
      let existing = await User.findOne({ phone: phone.trim() });
      const pass = password || 'password123';
      const passwordHash = await bcrypt.hash(pass, 10);

      if (existing) {
        existing.name = name.trim();
        existing.role = 'STORE_MANAGER';
        existing.storeId = store._id as any;
        existing.passwordHash = passwordHash;
        if (email) existing.email = email.trim();
        await existing.save();
        managerUser = existing;
      } else {
        managerUser = await User.create({
          name: name.trim(),
          phone: phone.trim(),
          email: email ? email.trim() : undefined,
          passwordHash,
          role: 'STORE_MANAGER',
          storeId: store._id as any,
        });
      }
    } else {
      res.status(400).json({
        success: false,
        error: 'Provide either userId or name and phone to assign a Supermarket Admin.',
      });
      return;
    }

    // Link manager to store
    store.managerId = managerUser._id as any;
    await store.save();

    // Audit log
    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'ASSIGN_STORE_MANAGER',
      entityType: 'STORE',
      entityId: store._id.toString(),
      storeId: store._id,
      newValue: {
        storeId: store._id,
        storeName: store.name,
        managerId: managerUser._id,
        managerName: managerUser.name,
        managerPhone: managerUser.phone,
      },
      reason: `Super Admin assigned ${managerUser.name} as Supermarket Admin for ${store.name}`,
    });

    res.json({
      success: true,
      message: `Assigned ${managerUser.name} as Supermarket Admin for ${store.name}.`,
      store,
      manager: {
        id: managerUser._id,
        name: managerUser.name,
        phone: managerUser.phone,
        email: managerUser.email,
        role: managerUser.role,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id/staff - Get all staff members assigned to a store
router.get('/:id/staff', authenticate, requirePermission('staff:read'), requireStoreAccess('params', 'id'), async (req: AuthRequest, res) => {
  try {
    const staff = await User.find({
      storeId: req.params.id,
      role: { $in: ['STORE_MANAGER', 'BRANCH_MANAGER', 'SUPERVISOR', 'EXIT_STAFF', 'EXIT_OFFICER', 'PICKER', 'PACKER_VERIFIER', 'STOCK_CONTROLLER', 'CASHIER_CUSTOMER_SERVICE', 'DELIVERY_COLLECTION_HANDOVER'] },
    }).select('name phone email role cleanTrips confirmedDiscrepancies createdAt');

    res.json({ success: true, staff });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Roster entries are kept in process memory for the current server session.
const storeRosters: Record<string, any[]> = {};

// GET /:id/roster - Get shift roster
router.get('/:id/roster', authenticate, requirePermission('staff:read'), requireStoreAccess('params', 'id'), async (req: AuthRequest, res) => {
  try {
    const storeId = String(req.params.id);
    const roster = storeRosters[storeId] || [];
    res.json({ success: true, roster });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:id/roster - Add/Update shift assignment
router.post('/:id/roster', authenticate, requirePermission('staff:assign'), requireStoreAccess('params', 'id'), async (req: AuthRequest, res) => {
  try {
    const storeId = String(req.params.id);
    const { shiftAssignment } = req.body;
    if (!storeRosters[storeId]) storeRosters[storeId] = [];
    storeRosters[storeId].unshift({
      id: `shift-${Date.now()}`,
      ...shiftAssignment,
      assignedBy: req.user?.name,
      assignedAt: new Date().toISOString(),
    });
    res.json({ success: true, roster: storeRosters[storeId] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// End-of-Day Reconciliation records
const storeEods: Record<string, any[]> = {};

// GET /:id/eod-reconciliation - Fetch latest EOD records
router.get('/:id/eod-reconciliation', authenticate, requirePermission('reports:read'), authorize('STORE_MANAGER', 'BRANCH_MANAGER', 'ORG_ADMIN', 'ORG_OWNER'), requireStoreAccess('params', 'id'), async (req: AuthRequest, res) => {
  try {
    const storeId = String(req.params.id);
    const records = storeEods[storeId] || [];
    res.json({ success: true, records });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:id/eod-reconciliation - Submit Branch EOD reconciliation
router.post('/:id/eod-reconciliation', authenticate, requirePermission('reports:export'), authorize('STORE_MANAGER', 'BRANCH_MANAGER'), requireRoleScope('BRANCH'), requireStoreAccess('params', 'id'), async (req: AuthRequest, res) => {
  try {
    const storeId = String(req.params.id);
    const { date, totalMpesaMinor, cashCountedMinor, voidsMinor, refundsMinor, discrepancyLossMinor, notes } = req.body;

    const record = {
      id: `eod-${Date.now()}`,
      storeId,
      date: date || new Date().toISOString().slice(0, 10),
      totalMpesaMinor: totalMpesaMinor || 0,
      cashCountedMinor: cashCountedMinor || 0,
      voidsMinor: voidsMinor || 0,
      refundsMinor: refundsMinor || 0,
      discrepancyLossMinor: discrepancyLossMinor || 0,
      notes: notes || '',
      closedBy: req.user?.name,
      closedById: req.user?.id,
      timestamp: new Date().toISOString(),
      status: 'VERIFIED_BALANCED',
    };

    if (!storeEods[storeId]) storeEods[storeId] = [];
    storeEods[storeId].unshift(record);

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'BRANCH_EOD_RECONCILIATION',
      entityType: 'STORE',
      entityId: storeId,
      storeId,
      newValue: record,
    });

    res.json({ success: true, message: 'End-of-day reconciliation successfully recorded.', record });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update fraud thresholds (Store Manager or System Admin only)
router.patch('/:id/fraud-config', authenticate, requirePermission('fraud:config'), authorize('STORE_MANAGER', 'BRANCH_MANAGER', 'ORG_OWNER', 'LOSS_PREVENTION_MANAGER'), requireStoreAccess('params', 'id'), async (req: AuthRequest, res) => {
  try {
    const store = await Store.findById(req.params.id);
    if (!store) {
      res.status(404).json({ success: false, error: 'Store not found.' });
      return;
    }

    const previousConfig = { ...store.fraudConfig };
    store.fraudConfig = { ...store.fraudConfig, ...req.body };
    await store.save();

    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'UPDATE_FRAUD_CONFIG',
      entityType: 'STORE',
      entityId: store._id.toString(),
      storeId: store._id,
      previousValue: previousConfig,
      newValue: store.fraudConfig,
      reason: req.body.reason || 'Manager policy update',
    });

    res.json({ success: true, fraudConfig: store.fraudConfig });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Configure the store's scale barcode layout. Variable-measure barcodes are store-scoped.
router.patch('/:id/variable-measure-config', authenticate, requirePermission('stores:manage'), requireStoreAccess('params', 'id'), async (req: AuthRequest, res) => {
  try {
    const store = await Store.findById(req.params.id);
    if (!store) return res.status(404).json({ success: false, error: 'Store not found.' });
    const config = req.body;
    if (config.enabled && (!String(config.prefix || '').length || !String(config.scaleId || '').trim() || !['PRICE', 'WEIGHT'].includes(config.valueType))) {
      return res.status(400).json({ success: false, error: 'Enabled scale layouts require a prefix, scaleId, and PRICE or WEIGHT valueType.' });
    }
    if (config.enabled && !(config.storeCodeStart !== undefined && config.storeCodeLength > 0)) {
      const sharedPrefix = await Store.exists({ _id: { $ne: store._id }, 'variableMeasureBarcode.enabled': true, 'variableMeasureBarcode.prefix': String(config.prefix) });
      if (sharedPrefix) return res.status(409).json({ success: false, error: 'Scale prefixes must be unique across stores unless the barcode layout includes an encoded store code.' });
    }
    const previousValue = store.variableMeasureBarcode;
    store.variableMeasureBarcode = { ...config, prefix: String(config.prefix || ''), scaleId: String(config.scaleId || '').trim() } as any;
    await store.save();
    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      actorName: req.user?.name,
      action: 'UPDATE_VARIABLE_MEASURE_CONFIG',
      entityType: 'STORE',
      entityId: store._id.toString(),
      storeId: store._id,
      previousValue,
      newValue: store.variableMeasureBarcode,
      reason: req.body.reason || 'Store scale barcode configuration update',
    });
    return res.json({ success: true, variableMeasureBarcode: store.variableMeasureBarcode });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

export default router;
