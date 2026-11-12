import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Organization, { OrganizationStatus } from '../organizations/organization.model.js';
import Store from '../stores/store.model.js';
import User from '../users/user.model.js';
import Order from '../orders/order.model.js';
import Payment from '../payments/payment.model.js';
import PickingTask from '../picking/picking.model.js';
import { Discrepancy, ExitEvent } from '../exit-verification/exit.model.js';
import Approval, { ApprovalStatus, ApprovalType } from '../approvals/approval.model.js';
import LedgerEntry from '../ledger/ledger.model.js';
import Payout, { PayoutStatus } from '../ledger/payout.model.js';
import SupportTicket from '../support/ticket.model.js';
import FraudCase from '../fraud/fraudCase.model.js';
import BlocklistEntry from '../fraud/blocklist.model.js';
import RetentionRequest from './compliance.model.js';
import ApiKey from './apiKey.model.js';
import WebhookLog from './webhookLog.model.js';
import AuditLog from '../audits/audit.model.js';
import { authenticate, authorize, AuthRequest, ROLE_PERMISSIONS, Permission, isPlatformRole, canonicalRole } from '../../middleware/auth.js';
import { getSettings, updateSettings } from './systemSettings.model.js';
import Subscription from '../subscriptions/subscription.model.js';
import {
  checkSubscriptionGate,
  createSubscriptionForOrganization,
  getSubscriptionContext,
} from '../subscriptions/subscription.service.js';

const router = Router();

// Everything under /api/v1/platform is for PLATFORM staff only, and each console section needs its own
// permission. A finance admin can open Finance but not Engineering; a compliance auditor can read audit
// logs but cannot change anything; support agents see tickets and nothing else.
// A caller needs ANY ONE of the listed permissions. system:admin (platform owner / super admin) covers all.
const SECTION_RULES: { prefix: string; read: Permission[]; write: Permission[] }[] = [
  { prefix: '/overview', read: ['platform:overview:read'], write: [] },
  { prefix: '/organizations', read: ['platform:orgs:read'], write: ['platform:orgs:create', 'platform:orgs:suspend', 'org:users:manage'] },
  { prefix: '/stores', read: ['platform:orgs:read'], write: ['platform:orgs:suspend', 'org:config'] },
  // The global user directory is a platform-owner/admin-console capability. Tenant staff are managed
  // through tenant-scoped staff routes, and support searches users through the support workflow.
  { prefix: '/users', read: ['platform:admins:create'], write: ['platform:admins:create'] },
  { prefix: '/permissions', read: ['org:users:manage', 'platform:admins:create', 'audit:read'], write: ['platform:admins:create'] },
  { prefix: '/tickets', read: ['support:view:any'], write: ['support:view:any'] },
  { prefix: '/finance', read: ['finance:ledger:read', 'finance:export'], write: ['finance:reconcile'] },
  { prefix: '/fraud', read: ['fraud:view'], write: ['fraud:block', 'fraud:unblock', 'fraud:review', 'fraud:config'] },
  { prefix: '/audits', read: ['audit:read'], write: [] },
  { prefix: '/compliance', read: ['compliance:read', 'audit:read'], write: ['platform:settings:write'] },
  { prefix: '/settings', read: ['platform:settings:read'], write: ['platform:settings:write'] },
  { prefix: '/approvals', read: ['payouts:approve', 'platform:admins:approve'], write: ['payouts:approve', 'platform:admins:approve'] },
  { prefix: '/engineering', read: ['system:health'], write: ['system:maintenance'] },
];

function platformSectionGate(req: AuthRequest, res: Response, next: () => void) {
  if (!req.user || !isPlatformRole(req.user.role)) {
    res.status(403).json({ success: false, error: 'Platform access only.' });
    return;
  }
  const perms = req.user.permissions || [];
  if (perms.includes('system:admin')) return next();
  const rule = SECTION_RULES.find((r) => req.path === r.prefix || req.path.startsWith(r.prefix + '/'));
  if (!rule) {
    // Unknown platform path: deny by default.
    res.status(403).json({ success: false, error: 'Forbidden.' });
    return;
  }
  const needed = req.method === 'GET' || req.method === 'HEAD' ? rule.read : rule.write;
  if (!needed.some((perm) => perms.includes(perm))) {
    res.status(403).json({ success: false, error: 'Forbidden: you do not have access to this console section.' });
    return;
  }
  next();
}

router.use(authenticate, platformSectionGate);

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const tempPassword = () => crypto.randomBytes(9).toString('base64url');

const handle =
  (fn: (req: AuthRequest, res: Response) => Promise<any>) =>
  (req: AuthRequest, res: Response) =>
    fn(req, res).catch((e: any) => res.status(e.status || 500).json({ success: false, error: e.message }));

const fail = (status: number, message: string) => Object.assign(new Error(message), { status });

async function audit(req: AuthRequest, action: string, entityType: any, entityId: string, extra: any = {}) {
  await AuditLog.create({
    actorId: req.user?.id,
    actorRole: req.user?.role,
    actorName: req.user?.name,
    action,
    entityType,
    entityId,
    ...extra,
  });
}

const publicUser = (u: any) => ({
  id: u._id,
  name: u.name,
  phone: u.phone,
  email: u.email,
  role: u.role,
  status: u.status || 'ACTIVE',
  active: u.active !== false,
  organizationId: u.organizationId,
  storeId: u.storeId,
  createdAt: u.createdAt,
});

async function createOrgAdmin(organizationId: any, a: { name: string; phone: string; email?: string }, role: 'ORG_OWNER' | 'ORG_ADMIN' = 'ORG_ADMIN') {
  const password = tempPassword();
  const user = await User.create({
    name: a.name,
    phone: a.phone,
    email: a.email,
    passwordHash: await bcrypt.hash(password, 10),
    role,
    organizationId,
    mustChangePassword: true,
  });
  return { user, password };
}

/* ==========================================================================
   1. OVERVIEW: Live KPIs, Alerts, System Health, and Queue Depth
   ========================================================================== */

router.get('/overview', handle(async (_req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalOrders,
    todayOrders,
    paidOrders,
    activeStores,
    totalStores,
    failedPayments,
    todayFailedPayments,
    totalDiscrepancies,
    todayDiscrepancies,
    pendingApprovals,
    pendingPicking,
    pendingExits,
    pendingOrders,
    recentDiscrepancies,
    settings,
  ] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ createdAt: { $gte: todayStart } }),
    Order.aggregate([
      { $match: { status: { $in: ['PAID', 'PICKED', 'VERIFIED', 'COMPLETED'] } } },
      { $group: { _id: null, totalMinor: { $sum: '$totalMinor' } } },
    ]),
    Store.countDocuments({ active: true }),
    Store.countDocuments(),
    Payment.countDocuments({ status: 'FAILED' }),
    Payment.countDocuments({ status: 'FAILED', createdAt: { $gte: todayStart } }),
    Discrepancy.countDocuments(),
    Discrepancy.countDocuments({ createdAt: { $gte: todayStart } }),
    Approval.countDocuments({ status: ApprovalStatus.PENDING }),
    PickingTask.countDocuments({ status: { $in: ['PENDING', 'IN_PROGRESS'] } }),
    ExitEvent.countDocuments({ riskBand: { $in: ['AMBER', 'AMBER_FULL', 'RED'] } }),
    Order.countDocuments({ status: { $in: ['CREATED', 'AWAITING_CUSTOMER_APPROVAL', 'HELD'] } }),
    Discrepancy.find().sort({ createdAt: -1 }).limit(5).populate('customerId', 'name phone').lean(),
    getSettings(),
  ]);

  const gmvMinor = paidOrders[0]?.totalMinor || 0;

  // Compile Alerts
  const alerts: Array<{ id: string; type: 'CRITICAL' | 'WARNING' | 'INFO'; title: string; message: string; timestamp: Date }> = [];

  if (settings.maintenanceMode) {
    alerts.push({
      id: 'alert-maint',
      type: 'CRITICAL',
      title: 'Platform Maintenance Mode Active',
      message: settings.maintenanceMessage || 'Non-admin traffic is currently blocked.',
      timestamp: new Date(),
    });
  }

  if (pendingApprovals > 0) {
    alerts.push({
      id: 'alert-approvals',
      type: 'WARNING',
      title: 'Pending Maker-Checker Approvals',
      message: `${pendingApprovals} critical approval request(s) waiting for checker review.`,
      timestamp: new Date(),
    });
  }

  if (todayDiscrepancies > 0) {
    alerts.push({
      id: 'alert-fraud',
      type: 'WARNING',
      title: 'Exit Lane Mismatches Flagged',
      message: `${todayDiscrepancies} exit discrepancies detected today requiring supervisor verification.`,
      timestamp: new Date(),
    });
  }

  if (todayFailedPayments > 0) {
    alerts.push({
      id: 'alert-payments',
      type: 'INFO',
      title: 'Failed Payment Callbacks',
      message: `${todayFailedPayments} payment transactions failed today. Check STK requery queue.`,
      timestamp: new Date(),
    });
  }

  // System Health
  const dbConnected = mongoose.connection.readyState === 1;
  const memoryUsage = process.memoryUsage();

  res.json({
    success: true,
    kpis: {
      totalOrders,
      todayOrders,
      gmvMinor,
      gmvKes: gmvMinor / 100,
      activeStores,
      totalStores,
      failedPayments,
      todayFailedPayments,
      exitMismatches: totalDiscrepancies,
      todayExitMismatches: todayDiscrepancies,
    },
    queueDepth: {
      pendingOrders,
      pendingPicking,
      pendingExits,
      pendingApprovals,
    },
    alerts,
    systemHealth: {
      dbStatus: dbConnected ? 'HEALTHY' : 'DEGRADED',
      uptimeSeconds: Math.floor(process.uptime()),
      memoryRssMb: Math.round(memoryUsage.rss / (1024 * 1024)),
      memoryHeapMb: Math.round(memoryUsage.heapUsed / (1024 * 1024)),
      nodeVersion: process.version,
      timestamp: new Date(),
    },
    recentDiscrepancies,
  });
}));

/* ==========================================================================
   2. ORGANIZATIONS: Lifecycle, Branding, Contacts, Flags, Limits, Drilldown
   ========================================================================== */

router.get('/organizations', handle(async (_req, res) => {
  const orgs = await Organization.find().sort({ createdAt: -1 }).lean();
  const withCounts = await Promise.all(
    orgs.map(async (o) => {
      const [{ subscription, plan }, storeCount, adminCount, orderCount] = await Promise.all([
        getSubscriptionContext(o._id.toString()),
        Store.countDocuments({ organizationId: o._id }),
        User.countDocuments({ organizationId: o._id, role: 'ORG_ADMIN' }),
        Order.countDocuments({ storeId: { $in: await Store.find({ organizationId: o._id }).distinct('_id') } }),
      ]);
      return {
        ...o,
        storeCount,
        adminCount,
        orderCount,
        maxStores: o.maxStores || plan.maxStores,
        features: { ...(plan.features || {}), ...(o.featureFlags || {}) },
        subscription,
      };
    })
  );
  res.json({ success: true, organizations: withCounts });
}));

// Create Organization + initial admin
router.post('/organizations', authorize('PLATFORM_OWNER', 'PLATFORM_ADMIN'), handle(async (req, res) => {
  const {
    name,
    contactEmail,
    contactPhone,
    contactPerson,
    maxStores,
    planCode,
    billingInterval = 'MONTHLY',
    branding,
    featureFlags,
    features,
    admin,
  } = req.body;

  if (!name || !admin?.name || !admin?.phone) throw fail(400, 'name, admin.name and admin.phone are required.');

  // Accept the older `features` request shape while keeping subscription plans authoritative.
  // If an older caller explicitly requests Shop & Collect but omits a plan, place the workspace
  // on the lowest tier that includes it (with the normal trial); an explicit plan selection wins.
  const requestedFeatures = features && typeof features === 'object' ? features : {};
  const normalizedFeatureFlags = featureFlags || {
    scanAndGo: requestedFeatures.scanAndGo !== false,
    pickup: requestedFeatures.clickAndCollect !== false,
    advancedFraud: true,
  };
  const resolvedPlanCode = planCode || (requestedFeatures.clickAndCollect === true ? 'BASIC' : 'FREE');

  const slug = slugify(req.body.slug || name);
  if (await Organization.exists({ slug })) throw fail(409, `A workspace with slug "${slug}" already exists.`);
  if (await User.exists({ phone: admin.phone })) {
    throw fail(409, 'That phone number is already registered. Create the workspace first, then promote the user.');
  }

  const org = await Organization.create({
    name,
    slug,
    contactEmail,
    contactPhone,
    contactPerson,
    maxStores: maxStores ? Number(maxStores) : undefined,
    verificationStatus: 'VERIFIED',
    branding: branding || { primaryColor: '#059669' },
    featureFlags: normalizedFeatureFlags,
    createdBy: req.user!.id,
  });

  try {
    const subscription = await createSubscriptionForOrganization(org._id.toString(), resolvedPlanCode, billingInterval);
    const { user, password } = await createOrgAdmin(org._id, admin);
    await audit(req, 'CREATE_ORGANIZATION', 'ORGANIZATION', org._id.toString(), {
      newValue: { name, slug, admin: user._id, subscriptionId: subscription._id, planCode: resolvedPlanCode, featureFlags: normalizedFeatureFlags },
    });
    res.status(201).json({ success: true, organization: org, admin: publicUser(user), temporaryPassword: password });
  } catch (e) {
    await Organization.findByIdAndDelete(org._id);
    await Subscription.deleteOne({ organizationId: org._id });
    throw e;
  }
}));

// Lifecycle update: Suspend, Reactivate, Verify, Archive, Edit Branding, Feature Flags, Contacts
router.patch('/organizations/:id', handle(async (req, res) => {
  const org = await Organization.findById(req.params.id);
  if (!org) throw fail(404, 'Workspace not found.');
  const before = org.toObject();

  const fields = [
    'name',
    'contactEmail',
    'contactPhone',
    'contactPerson',
    'status',
    'verificationStatus',
    'isArchived',
    'maxStores',
    'branding',
    'featureFlags',
  ] as const;

  for (const k of fields) {
    if (req.body[k] !== undefined) (org as any)[k] = req.body[k];
  }
  await org.save();

  // Cascade suspension to branches
  if (req.body.status && req.body.status !== before.status) {
    await Store.updateMany({ organizationId: org._id }, { active: req.body.status === OrganizationStatus.ACTIVE });
  }

  await audit(req, 'UPDATE_ORGANIZATION', 'ORGANIZATION', org._id.toString(), {
    previousValue: before,
    newValue: org.toObject(),
  });
  res.json({ success: true, organization: org });
}));

// Organization drilldown details
router.get('/organizations/:id/drilldown', handle(async (req, res) => {
  const org = await Organization.findById(req.params.id).lean();
  if (!org) throw fail(404, 'Organization not found.');

  const [stores, admins, { subscription, plan }] = await Promise.all([
    Store.find({ organizationId: org._id }).populate('managerId', 'name phone email').lean(),
    User.find({ organizationId: org._id, role: 'ORG_ADMIN' }).select('-passwordHash').lean(),
    getSubscriptionContext(org._id.toString()),
  ]);

  const storeIds = stores.map((s) => s._id);

  const [ordersSummary, discrepanciesCount, recentOrders] = await Promise.all([
    Order.aggregate([
      { $match: { storeId: { $in: storeIds }, status: { $in: ['PAID', 'PICKED', 'VERIFIED', 'COMPLETED'] } } },
      { $group: { _id: null, count: { $sum: 1 }, totalMinor: { $sum: '$totalMinor' } } },
    ]),
    Discrepancy.countDocuments({ storeId: { $in: storeIds } }),
    Order.find({ storeId: { $in: storeIds } }).sort({ createdAt: -1 }).limit(10).populate('customerId', 'name phone').lean(),
  ]);

  res.json({
    success: true,
    organization: {
      ...org,
      subscription,
      plan,
    },
    stores,
    admins,
    metrics: {
      storeCount: stores.length,
      adminCount: admins.length,
      paidOrderCount: ordersSummary[0]?.count || 0,
      totalGmvMinor: ordersSummary[0]?.totalMinor || 0,
      totalGmvKes: (ordersSummary[0]?.totalMinor || 0) / 100,
      discrepanciesCount,
    },
    recentOrders,
  });
}));

// Reset admin password
router.post('/organizations/:id/reset-admin-password', authorize('PLATFORM_OWNER', 'PLATFORM_ADMIN'), handle(async (req, res) => {
  const { adminId } = req.body;
  const user = await User.findOne({ _id: adminId, organizationId: req.params.id, role: { $in: ['ORG_OWNER', 'ORG_ADMIN'] } });
  if (!user) throw fail(404, 'Admin not found in this organization.');

  const newPass = tempPassword();
  user.passwordHash = await bcrypt.hash(newPass, 10);
  user.mustChangePassword = true;
  await user.save();

  await audit(req, 'RESET_ORG_ADMIN_PASSWORD', 'USER', user._id.toString(), {
    organizationId: req.params.id,
    adminPhone: user.phone,
  });

  res.json({
    success: true,
    message: `Password reset successfully for ${user.name}.`,
    temporaryPassword: newPass,
    phone: user.phone,
  });
}));

// Invite or add admin
router.post('/organizations/:id/admins', authorize('PLATFORM_OWNER', 'PLATFORM_ADMIN'), handle(async (req, res) => {
  const org = await Organization.findById(req.params.id);
  if (!org) throw fail(404, 'Workspace not found.');

  // Organization Owner and Organization Admin accounts are appointed only by platform staff.
  const role = req.body.role === 'ORG_OWNER' ? 'ORG_OWNER' : 'ORG_ADMIN';
  if (role === 'ORG_OWNER' && (await User.exists({ organizationId: org._id, role: 'ORG_OWNER' }))) {
    throw fail(409, 'This supermarket already has an owner.');
  }

  if (req.body.userId) {
    const u = await User.findById(req.body.userId);
    if (!u) throw fail(404, 'User not found.');
    if (u.role !== 'CUSTOMER') throw fail(409, 'Only plain customer accounts can be promoted.');
    u.role = role;
    (u as any).organizationId = org._id;
    u.storeId = undefined;
    await u.save();
    await audit(req, role === 'ORG_OWNER' ? 'PROMOTE_ORG_OWNER' : 'PROMOTE_ORG_ADMIN', 'USER', u._id.toString(), { newValue: { organizationId: org._id, role } });
    res.json({ success: true, admin: publicUser(u) });
    return;
  }

  const { name, phone, email } = req.body;
  if (!name || !phone) throw fail(400, 'name and phone are required.');
  if (await User.exists({ phone })) throw fail(409, 'Phone number already registered. Pass userId to promote that account.');

  const { user, password } = await createOrgAdmin(org._id, { name, phone, email }, role);
  await audit(req, role === 'ORG_OWNER' ? 'CREATE_ORG_OWNER' : 'CREATE_ORG_ADMIN', 'USER', user._id.toString(), { newValue: { organizationId: org._id, role } });
  res.status(201).json({ success: true, admin: publicUser(user), temporaryPassword: password });
}));

router.delete('/organizations/:id/admins/:userId', authorize('PLATFORM_OWNER', 'PLATFORM_ADMIN'), handle(async (req, res) => {
  const u = await User.findOne({ _id: req.params.userId, organizationId: req.params.id, role: 'ORG_ADMIN' });
  if (!u) throw fail(404, 'Admin not found in this workspace.');
  const remaining = await User.countDocuments({ organizationId: req.params.id, role: 'ORG_ADMIN' });
  if (remaining <= 1) throw fail(409, 'A workspace must keep at least one admin. Add another before removing this one.');

  u.role = 'CUSTOMER';
  (u as any).organizationId = undefined;
  await u.save();
  await audit(req, 'REMOVE_ORG_ADMIN', 'USER', u._id.toString(), { previousValue: { organizationId: req.params.id } });
  res.json({ success: true });
}));

/* ==========================================================================
   3. STORES / BRANCHES: CRUD, Open Hours, Pickup Slots, M-Pesa, Fraud, Health
   ========================================================================== */

router.get('/stores', handle(async (_req, res) => {
  const stores = await Store.find()
    .populate('organizationId', 'name slug status')
    .populate('managerId', 'name phone email role')
    .sort({ createdAt: -1 })
    .lean();

  const enhancedStores = await Promise.all(
    stores.map(async (store) => {
      const [productCount, orderCount, staffCount, discrepancies] = await Promise.all([
        mongoose.model('Product').countDocuments({ storeId: store._id }),
        Order.countDocuments({ storeId: store._id }),
        User.countDocuments({ storeId: store._id }),
        Discrepancy.countDocuments({ storeId: store._id }),
      ]);
      return {
        ...store,
        productCount,
        orderCount,
        staffCount,
        discrepancies,
      };
    })
  );

  res.json({ success: true, stores: enhancedStores });
}));

router.get('/stores/:id/health', handle(async (req, res) => {
  const store = await Store.findById(req.params.id)
    .populate('organizationId', 'name slug')
    .populate('managerId', 'name phone email')
    .lean();
  if (!store) throw fail(404, 'Store branch not found.');

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todayOrders, gmvResult, activeLanes, openPickupSlots, discrepancies] = await Promise.all([
    Order.countDocuments({ storeId: store._id, createdAt: { $gte: todayStart } }),
    Order.aggregate([
      { $match: { storeId: store._id, createdAt: { $gte: todayStart }, status: { $in: ['PAID', 'PICKED', 'VERIFIED', 'COMPLETED'] } } },
      { $group: { _id: null, totalMinor: { $sum: '$totalMinor' } } },
    ]),
    (store.exitLanes || []).filter((l: any) => l.active).length,
    (store.pickupSlots || []).filter((s: any) => s.active).length,
    Discrepancy.countDocuments({ storeId: store._id, createdAt: { $gte: todayStart } }),
  ]);

  res.json({
    success: true,
    store,
    health: {
      todayOrders,
      todayGmvMinor: gmvResult[0]?.totalMinor || 0,
      todayGmvKes: (gmvResult[0]?.totalMinor || 0) / 100,
      activeExitLanes: activeLanes,
      totalExitLanes: (store.exitLanes || []).length,
      openPickupSlots,
      totalPickupSlots: (store.pickupSlots || []).length,
      todayDiscrepancies: discrepancies,
      isOpen: store.active,
    },
  });
}));

router.patch('/stores/:id', handle(async (req, res) => {
  const store = await Store.findById(req.params.id);
  if (!store) throw fail(404, 'Store not found.');
  const before = store.toObject();

  const updatable = [
    'name',
    'code',
    'location',
    'active',
    'managerId',
    'openHours',
    'mpesaConfig',
    'pickupSlots',
    'exitLanes',
    'fraudConfig',
  ] as const;

  for (const k of updatable) {
    if (req.body[k] !== undefined) (store as any)[k] = req.body[k];
  }
  await store.save();

  await audit(req, 'UPDATE_STORE', 'STORE', store._id.toString(), {
    previousValue: before,
    newValue: store.toObject(),
  });

  res.json({ success: true, store });
}));

/* ==========================================================================
   4. USERS & ROLES: Global Directory, Search, Filters, Overrides, Revoke, Matrix
   ========================================================================== */

router.get('/users', handle(async (req, res) => {
  const { q, role, organizationId, storeId, status } = req.query;
  const filter: any = {};

  if (q && typeof q === 'string') {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
    ];
  }
  if (role) filter.role = role;
  if (organizationId) filter.organizationId = organizationId;
  if (storeId) filter.storeId = storeId;
  if (status) filter.status = status;

  const users = await User.find(filter)
    .populate('organizationId', 'name slug')
    .populate('storeId', 'name code')
    .select('-passwordHash -mfaSecret -mfaBackupCodes')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  res.json({ success: true, count: users.length, users });
}));

router.patch('/users/:id/status', handle(async (req, res) => {
  const { status, active } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) throw fail(404, 'User not found.');
  if (canonicalRole(req.user!.role) === 'PLATFORM_ADMIN' && canonicalRole(user.role) === 'PLATFORM_OWNER') {
    throw fail(403, 'Platform Admins cannot manage the Platform Owner.');
  }

  const before = { status: user.status, active: user.active };
  if (status) user.status = status;
  if (active !== undefined) user.active = active;
  await user.save();

  await audit(req, 'UPDATE_USER_STATUS', 'USER', user._id.toString(), {
    previousValue: before,
    newValue: { status: user.status, active: user.active },
  });

  res.json({ success: true, user: publicUser(user) });
}));

router.post('/users/:id/revoke-sessions', handle(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw fail(404, 'User not found.');
  if (canonicalRole(req.user!.role) === 'PLATFORM_ADMIN' && canonicalRole(user.role) === 'PLATFORM_OWNER') {
    throw fail(403, 'Platform Admins cannot manage the Platform Owner.');
  }

  user.sessions = [];
  await user.save();

  await audit(req, 'REVOKE_USER_SESSIONS', 'USER', user._id.toString(), {
    details: 'All active sessions and tokens terminated by Platform Super Admin',
  });

  res.json({ success: true, message: `All active sessions revoked for ${user.name}.` });
}));

router.get('/permissions/matrix', handle(async (_req, res) => {
  res.json({
    success: true,
    rolePermissions: ROLE_PERMISSIONS,
  });
}));

/* ==========================================================================
   5. SUPPORT DESK: Ticketing, Escalation (Tier 1 -> Tier 2), SLA, Messages
   ========================================================================== */

router.get('/tickets', handle(async (req, res) => {
  const { status, priority, tier } = req.query;
  const filter: any = {};
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (tier) filter.tier = tier;

  const tickets = await SupportTicket.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, tickets });
}));

router.post('/tickets', handle(async (req, res) => {
  const { customerPhone, customerName, subject, description, priority = 'MEDIUM', orderId } = req.body;
  if (!customerPhone || !subject || !description) throw fail(400, 'customerPhone, subject, and description are required.');

  const count = await SupportTicket.countDocuments();
  const ticketNumber = `TICK-${1000 + count + 1}`;

  // SLA calculation: URGENT=2h, HIGH=4h, MEDIUM=12h, LOW=24h
  const slaHours = priority === 'URGENT' ? 2 : priority === 'HIGH' ? 4 : priority === 'MEDIUM' ? 12 : 24;
  const slaExpiresAt = new Date(Date.now() + slaHours * 60 * 60 * 1000);

  const ticket = await SupportTicket.create({
    ticketNumber,
    customerPhone,
    customerName,
    subject,
    description,
    priority,
    orderId,
    status: 'OPEN',
    tier: 'TIER_1',
    slaExpiresAt,
    messages: [
      {
        sender: req.user!.name || 'Super Admin',
        senderRole: req.user!.role,
        message: description,
        isInternal: false,
        createdAt: new Date(),
      },
    ],
  });

  await audit(req, 'CREATE_SUPPORT_TICKET', 'SYSTEM', ticket._id.toString(), { ticketNumber });
  res.status(201).json({ success: true, ticket });
}));

router.patch('/tickets/:id', handle(async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) throw fail(404, 'Ticket not found.');

  const { status, priority, tier, assignedTo, assignedAgentName, newMessage, isInternal } = req.body;

  if (status) ticket.status = status;
  if (priority) ticket.priority = priority;
  if (tier) ticket.tier = tier;
  if (assignedTo !== undefined) ticket.assignedTo = assignedTo;
  if (assignedAgentName !== undefined) ticket.assignedAgentName = assignedAgentName;

  if (newMessage) {
    ticket.messages.push({
      sender: req.user!.name || 'Support Staff',
      senderRole: req.user!.role,
      message: newMessage,
      isInternal: Boolean(isInternal),
      createdAt: new Date(),
    });
  }

  await ticket.save();
  await audit(req, 'UPDATE_SUPPORT_TICKET', 'SYSTEM', ticket._id.toString(), {
    ticketNumber: ticket.ticketNumber,
    status: ticket.status,
    tier: ticket.tier,
  });

  res.json({ success: true, ticket });
}));

/* ==========================================================================
   6. FINANCE: Ledger, Settlements & Payouts, Reconciliation, CSV Export
   ========================================================================== */

router.get('/finance/overview', handle(async (_req, res) => {
  const [totalEntries, payouts, pendingPayouts] = await Promise.all([
    LedgerEntry.countDocuments(),
    Payout.find().populate('storeId', 'name code').populate('organizationId', 'name').sort({ createdAt: -1 }).limit(50).lean(),
    Payout.countDocuments({ status: PayoutStatus.PENDING }),
  ]);

  const recentEntries = await LedgerEntry.find().sort({ createdAt: -1 }).limit(50).lean();

  res.json({
    success: true,
    totalEntries,
    pendingPayouts,
    payouts,
    recentEntries,
  });
}));

router.get('/finance/statement/export', handle(async (req, res) => {
  const { organizationId, storeId } = req.query;
  const filter: any = {};
  if (organizationId) filter.organizationId = organizationId;
  if (storeId) filter.storeId = storeId;

  const entries = await LedgerEntry.find(filter).sort({ createdAt: -1 }).limit(500).lean();

  // Generate CSV format
  const headers = ['Date', 'EntryID', 'Type', 'Account', 'DebitMinor', 'CreditMinor', 'Description', 'Store', 'Org'];
  const rows = entries.map((e: any) => [
    new Date(e.createdAt).toISOString(),
    e._id.toString(),
    e.entryType,
    e.accountCode,
    e.debitMinor || 0,
    e.creditMinor || 0,
    `"${(e.description || '').replace(/"/g, '""')}"`,
    e.storeId || '',
    e.organizationId || '',
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="finance_statement.csv"');
  res.send(csvContent);
}));

/* ==========================================================================
   7. RISK & FRAUD: Discrepancy Queue, Risk Scores, Blocklists, Case Mgmt
   ========================================================================== */

router.get('/fraud/discrepancies', handle(async (_req, res) => {
  const discrepancies = await Discrepancy.find()
    .populate('storeId', 'name code')
    .populate('customerId', 'name phone')
    .populate('officerId', 'name role')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  res.json({ success: true, count: discrepancies.length, discrepancies });
}));

router.get('/fraud/blocklist', handle(async (_req, res) => {
  const blocklist = await BlocklistEntry.find().sort({ createdAt: -1 }).lean();
  res.json({ success: true, blocklist });
}));

router.post('/fraud/blocklist', handle(async (req, res) => {
  const { identifier, type = 'PHONE', name, reason, riskScore = 90 } = req.body;
  if (!identifier || !reason) throw fail(400, 'Identifier and reason are required.');

  const entry = await BlocklistEntry.create({
    identifier,
    type,
    name,
    reason,
    riskScore,
    addedBy: req.user!.id,
    addedByName: req.user!.name || 'Super Admin',
    active: true,
  });

  await audit(req, 'ADD_BLOCKLIST_ENTRY', 'USER', entry._id.toString(), { identifier, reason });
  res.status(201).json({ success: true, entry });
}));

router.delete('/fraud/blocklist/:id', handle(async (req, res) => {
  await BlocklistEntry.findByIdAndDelete(req.params.id);
  await audit(req, 'REMOVE_BLOCKLIST_ENTRY', 'USER', req.params.id as string);
  res.json({ success: true, message: 'Removed from blocklist.' });
}));

router.get('/fraud/cases', handle(async (_req, res) => {
  const cases = await FraudCase.find()
    .populate('storeId', 'name code')
    .populate('organizationId', 'name')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, cases });
}));

router.post('/fraud/cases', handle(async (req, res) => {
  const { title, storeId, organizationId, customerPhone, customerName, severity = 'MEDIUM', evidenceSummary, evidenceNotes = [] } = req.body;
  if (!title || !evidenceSummary) throw fail(400, 'title and evidenceSummary are required.');

  const count = await FraudCase.countDocuments();
  const caseNumber = `CASE-${new Date().getFullYear()}-${1000 + count + 1}`;

  const fraudCase = await FraudCase.create({
    caseNumber,
    title,
    storeId,
    organizationId,
    customerPhone,
    customerName,
    severity,
    evidenceSummary,
    evidenceNotes,
    investigatorName: req.user!.name || 'Lead Fraud Investigator',
    status: 'INVESTIGATING',
  });

  await audit(req, 'CREATE_FRAUD_CASE', 'DISCREPANCY', fraudCase._id.toString(), { caseNumber });
  res.status(201).json({ success: true, fraudCase });
}));

router.patch('/fraud/cases/:id', handle(async (req, res) => {
  const fraudCase = await FraudCase.findById(req.params.id);
  if (!fraudCase) throw fail(404, 'Fraud case not found.');

  const { status, actionTaken, note } = req.body;
  if (status) fraudCase.status = status;
  if (actionTaken) fraudCase.actionTaken = actionTaken;
  if (note) fraudCase.evidenceNotes.push(note);
  await fraudCase.save();

  await audit(req, 'UPDATE_FRAUD_CASE', 'DISCREPANCY', fraudCase._id.toString(), { status });
  res.json({ success: true, fraudCase });
}));

/* ==========================================================================
   8. COMPLIANCE & AUDIT: Searchable Log, Access Review, Reveal Log, Retention
   ========================================================================== */

router.get('/audits', handle(async (req, res) => {
  const { actorName, action, entityType, limit = 100 } = req.query;
  const filter: any = {};
  if (actorName) filter.actorName = { $regex: actorName, $options: 'i' };
  if (action) filter.action = action;
  if (entityType) filter.entityType = entityType;

  const logs = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(Number(limit)).lean();
  res.json({ success: true, count: logs.length, logs });
}));

router.get('/audits/export', handle(async (_req, res) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(1000).lean();
  const headers = ['Timestamp', 'Actor', 'Role', 'Action', 'EntityType', 'EntityID', 'Reason'];
  const rows = logs.map((l: any) => [
    new Date(l.createdAt).toISOString(),
    `"${l.actorName || ''}"`,
    l.actorRole || '',
    l.action,
    l.entityType,
    l.entityId,
    `"${(l.reason || '').replace(/"/g, '""')}"`,
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="audit_log_export.csv"');
  res.send(csv);
}));

router.get('/compliance/retention-requests', handle(async (_req, res) => {
  const requests = await RetentionRequest.find().sort({ createdAt: -1 }).lean();
  res.json({ success: true, requests });
}));

router.post('/compliance/retention-requests', handle(async (req, res) => {
  const { customerPhone, customerName, requestType = 'FORGET_ME', reason } = req.body;
  if (!customerPhone) throw fail(400, 'customerPhone is required.');

  const request = await RetentionRequest.create({
    customerPhone,
    customerName,
    requestType,
    reason,
    status: 'PENDING_REVIEW',
  });

  await audit(req, 'CREATE_RETENTION_REQUEST', 'USER', request._id.toString(), { customerPhone });
  res.status(201).json({ success: true, request });
}));

router.patch('/compliance/retention-requests/:id/process', handle(async (req, res) => {
  const request = await RetentionRequest.findById(req.params.id);
  if (!request) throw fail(404, 'Retention request not found.');

  const { status, notes } = req.body;
  request.status = status;
  request.reviewedBy = req.user!.id as any;
  request.reviewedByName = req.user!.name || 'Compliance Officer';
  request.processedAt = new Date();
  request.notes = notes;
  await request.save();

  // If approved and FORGET_ME, pseudonymize the user's personal details
  if (status === 'COMPLETED' && request.requestType === 'FORGET_ME') {
    const user = await User.findOne({ phone: request.customerPhone });
    if (user) {
      user.name = `Anonymized User ${user._id.toString().slice(-4)}`;
      user.email = undefined;
      user.status = 'DEACTIVATED';
      user.active = false;
      await user.save();
    }
  }

  await audit(req, 'PROCESS_RETENTION_REQUEST', 'USER', request._id.toString(), { status });
  res.json({ success: true, request });
}));

/* ==========================================================================
   9. PLATFORM CONFIG: Global Settings, Feature Flags, Taxes, Templates
   ========================================================================== */

router.get('/settings', handle(async (_req, res) => {
  res.json({ success: true, settings: await getSettings() });
}));

router.patch('/settings', handle(async (req, res) => {
  const before = await getSettings();
  const settings = await updateSettings(req.body, req.user!.id);
  await audit(req, 'UPDATE_SYSTEM_SETTINGS', 'SYSTEM', 'global', {
    previousValue: before.toObject(),
    newValue: settings.toObject(),
  });
  res.json({ success: true, settings });
}));

/* ==========================================================================
   10. APPROVALS INBOX: Maker-Checker Unified Queue
   ========================================================================== */

router.get('/approvals/pending', handle(async (req, res) => {
  const isOwner = canonicalRole(req.user!.role) === 'PLATFORM_OWNER';
  const allowedTypes: string[] = [];
  if (isOwner) allowedTypes.push(...Object.values(ApprovalType));
  else {
    if (req.user!.permissions.includes('platform:admins:approve')) allowedTypes.push(ApprovalType.PLATFORM_ADMIN_CREATE);
    if (req.user!.permissions.includes('payouts:approve')) allowedTypes.push(ApprovalType.PAYOUT_REQUEST, ApprovalType.PAYOUT_APPROVAL);
  }
  const approvals = await Approval.find({ status: ApprovalStatus.PENDING, type: { $in: allowedTypes } })
    .populate('requestedBy', 'name phone role')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, approvals });
}));

const PLATFORM_STAFF_ROLES = [
  'PLATFORM_ADMIN', 'FINANCE_ADMIN', 'FINANCE_APPROVER', 'SUPPORT_AGENT_TIER1', 'SUPPORT_LEAD_TIER2',
  'RISK_FRAUD_ANALYST', 'COMPLIANCE_AUDITOR', 'PLATFORM_ENGINEER', 'CUSTOMER_SUCCESS',
];

router.post('/approvals/platform-staff', authorize('PLATFORM_OWNER'), handle(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').trim();
  const email = req.body.email ? String(req.body.email).trim() : undefined;
  const role = String(req.body.role || '');
  if (!name || !phone || !PLATFORM_STAFF_ROLES.includes(role)) throw fail(400, 'Name, phone, and an appointable platform role are required.');
  if (await User.exists({ phone })) throw fail(409, 'A user with this phone number already exists.');
  const targetId = new mongoose.Types.ObjectId();
  const approval = await Approval.create({
    type: ApprovalType.PLATFORM_ADMIN_CREATE,
    status: ApprovalStatus.PENDING,
    requestedBy: req.user!.id,
    requestedByRole: req.user!.role,
    requestedByName: req.user!.name,
    targetType: 'USER',
    targetId,
    requestData: { name, phone, email, role },
    requiresSecondFactor: true,
    creatorCanApprove: false,
  });
  await audit(req, 'REQUEST_PLATFORM_STAFF_APPOINTMENT', 'USER', targetId.toString(), { newValue: { name, phone, email, role, approvalId: approval._id } });
  res.status(201).json({ success: true, approval });
}));

router.post('/approvals/:id/approve', handle(async (req, res) => {
  const approval = await Approval.findById(req.params.id);
  if (!approval) throw fail(404, 'Approval request not found.');
  if (approval.status !== ApprovalStatus.PENDING) throw fail(400, 'Approval is no longer pending.');

  // Enforce Maker != Checker
  if (approval.requestedBy.toString() === req.user!.id.toString() && !approval.creatorCanApprove) {
    throw fail(403, 'Maker-Checker policy violation: You cannot approve your own request.');
  }

  let appointedUser: any;
  let temporaryPassword: string | undefined;
  if (approval.type === ApprovalType.PLATFORM_ADMIN_CREATE) {
    if (!req.user!.permissions.includes('platform:admins:approve') && !req.user!.permissions.includes('system:admin')) throw fail(403, 'You cannot approve platform staff appointments.');
    const { name, phone, email, role } = approval.requestData;
    if (!PLATFORM_STAFF_ROLES.includes(String(role))) throw fail(400, 'The requested platform role is not appointable.');
    if (await User.exists({ phone })) throw fail(409, 'A user with this phone number already exists.');
    temporaryPassword = tempPassword();
    appointedUser = await User.create({ _id: approval.targetId, name, phone, email, role, passwordHash: await bcrypt.hash(temporaryPassword, 10), mustChangePassword: true, status: 'ACTIVE', active: true });
    await audit(req, 'APPROVE_PLATFORM_STAFF_APPOINTMENT', 'USER', appointedUser._id.toString(), { newValue: { name, phone, email, role, approvalId: approval._id } });
  }

  approval.status = ApprovalStatus.APPROVED;
  approval.approvedBy = req.user!.id as any;
  approval.approvedAt = new Date();
  approval.notes = req.body.notes || 'Approved by Platform Super Admin';
  await approval.save();

  await audit(req, 'APPROVE_MAKER_CHECKER', 'SYSTEM', approval._id.toString(), {
    type: approval.type,
    notes: approval.notes,
  });

  res.json({ success: true, approval, user: appointedUser ? publicUser(appointedUser) : undefined, temporaryPassword });
}));

router.post('/approvals/:id/reject', handle(async (req, res) => {
  const approval = await Approval.findById(req.params.id);
  if (!approval) throw fail(404, 'Approval request not found.');
  if (approval.status !== ApprovalStatus.PENDING) throw fail(400, 'Approval is no longer pending.');
  if (approval.requestedBy.toString() === req.user!.id.toString() && !approval.creatorCanApprove) throw fail(403, 'Maker-Checker policy violation: You cannot reject your own request.');

  approval.status = ApprovalStatus.REJECTED;
  approval.rejectedBy = req.user!.id as any;
  approval.rejectedAt = new Date();
  approval.rejectionReason = req.body.reason || 'Rejected by Platform Super Admin';
  await approval.save();

  await audit(req, 'REJECT_MAKER_CHECKER', 'SYSTEM', approval._id.toString(), {
    type: approval.type,
    reason: approval.rejectionReason,
  });

  res.json({ success: true, approval });
}));

/* ==========================================================================
   11. ENGINEERING VIEW: Jobs, Webhooks, Error Rates, API Keys
   ========================================================================== */

router.get('/engineering/jobs', handle(async (_req, res) => {
  const jobs = [
    {
      id: 'job-reconciliation',
      name: 'M-Pesa STK Daily Reconciliation Job',
      schedule: '0 2 * * * (Every day at 2:00 AM)',
      status: 'IDLE',
      lastRun: new Date(Date.now() - 6 * 3600 * 1000),
      lastDurationMs: 1420,
      nextRun: new Date(Date.now() + 18 * 3600 * 1000),
    },
    {
      id: 'job-billing',
      name: 'Subscription Plan Renewal & Invoicing Job',
      schedule: '0 0 1 * * (1st of every month)',
      status: 'IDLE',
      lastRun: new Date(Date.now() - 24 * 3600 * 1000),
      lastDurationMs: 830,
      nextRun: new Date(Date.now() + 29 * 24 * 3600 * 1000),
    },
    {
      id: 'job-session-cleanup',
      name: 'Expired Tokens & Act-As Session Pruning',
      schedule: '0 * * * * (Every hour)',
      status: 'IDLE',
      lastRun: new Date(Date.now() - 25 * 60 * 1000),
      lastDurationMs: 180,
      nextRun: new Date(Date.now() + 35 * 60 * 1000),
    },
    {
      id: 'job-access-review',
      name: 'Privileged Access Review Compliance Daemon',
      schedule: '0 0 1 */3 * (Quarterly)',
      status: 'IDLE',
      lastRun: new Date(Date.now() - 15 * 24 * 3600 * 1000),
      lastDurationMs: 410,
      nextRun: new Date(Date.now() + 75 * 24 * 3600 * 1000),
    },
  ];

  res.json({ success: true, jobs });
}));

router.post('/engineering/jobs/run', handle(async (req, res) => {
  const { jobId } = req.body;
  await audit(req, 'TRIGGER_BACKGROUND_JOB', 'SYSTEM', jobId || 'unknown', {
    triggeredBy: req.user!.name,
  });
  res.json({ success: true, message: `Job ${jobId} triggered successfully in worker pool.` });
}));

router.get('/engineering/callbacks', handle(async (_req, res) => {
  let callbacks = await WebhookLog.find().sort({ createdAt: -1 }).limit(50).lean();

  res.json({ success: true, callbacks });
}));

router.get('/engineering/api-keys', handle(async (_req, res) => {
  const apiKeys = await ApiKey.find().select('-keyHash').sort({ createdAt: -1 }).lean();
  res.json({ success: true, apiKeys });
}));

router.post('/engineering/api-keys', handle(async (req, res) => {
  const { name, permissions = ['orders:read:any'], rateLimitPerMin = 120 } = req.body;
  if (!name) throw fail(400, 'Key name is required.');

  const prefix = `tk_${crypto.randomBytes(4).toString('hex')}`;
  const secret = crypto.randomBytes(24).toString('base64url');
  const fullApiKey = `${prefix}_${secret}`;
  const keyHash = await bcrypt.hash(fullApiKey, 10);

  const apiKey = await ApiKey.create({
    name,
    keyPrefix: prefix,
    keyHash,
    permissions,
    rateLimitPerMin,
    createdBy: req.user!.id,
    createdByName: req.user!.name || 'Platform Super Admin',
  });

  await audit(req, 'CREATE_API_KEY', 'SYSTEM', apiKey._id.toString(), { name, keyPrefix: prefix });

  res.status(201).json({
    success: true,
    apiKey,
    fullApiKey, // Returned once
  });
}));

router.delete('/engineering/api-keys/:id', handle(async (req, res) => {
  await ApiKey.findByIdAndDelete(req.params.id);
  await audit(req, 'REVOKE_API_KEY', 'SYSTEM', req.params.id as string);
  res.json({ success: true, message: 'API key revoked.' });
}));

export default router;
