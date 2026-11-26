// Seed script for RBAC roles, permissions and role‑permission mappings
import mongoose from 'mongoose';
import { Role } from '../models/rbac/role.model.js';
import { Permission } from '../models/rbac/permission.model.js';
import { RolePermission } from '../models/rbac/rolePermission.model.js';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI ?? 'mongodb://localhost/scanandgo');

  // Define permissions (module.resource.action)
  const permissions = [
    { key: 'users.view', description: 'View user profiles' },
    { key: 'staff:manage', description: 'Create / promote / assign staff' },
    { key: 'branches.manage', description: 'Create / edit branches' },
    { key: 'organizations.manage', description: 'Manage organization settings' },
    { key: 'audit.view', description: 'View audit logs' },
  ];

  const createdPermissions = await Permission.insertMany(permissions, { ordered: false }).catch(() => []);

  // Define roles
  const roles = [
    { name: 'PLATFORM_OWNER', description: 'Full platform authority', isPlatform: true },
    { name: 'PLATFORM_ADMIN', description: 'Platform administration', isPlatform: true },
    { name: 'ORG_OWNER', description: 'Owner of a supermarket organization' },
    { name: 'ORG_ADMIN', description: 'Organization administrator' },
    { name: 'REGION_MANAGER', description: 'Manages a set of branches' },
    { name: 'BRANCH_MANAGER', description: 'Manages a single branch' },
    { name: 'CASHIER', description: 'Cashier role' },
    // add other staff roles as needed …
  ];

  const createdRoles = await Role.insertMany(roles, { ordered: false }).catch(() => []);

  // Map permissions to roles (example mapping – adjust to your policy)
  const rolePermMap: {role: string; perms: string[]}[] = [
    { role: 'PLATFORM_OWNER', perms: ['users.view','staff:manage','branches.manage','organizations.manage','audit.view'] },
    { role: 'PLATFORM_ADMIN', perms: ['users.view','staff:manage','branches.manage','audit.view'] },
    { role: 'ORG_OWNER', perms: ['users.view','staff:manage','branches.manage','audit.view'] },
    { role: 'ORG_ADMIN', perms: ['users.view','staff:manage','branches.manage'] },
    { role: 'REGION_MANAGER', perms: ['staff:manage','branches.manage'] },
    { role: 'BRANCH_MANAGER', perms: ['staff:manage'] },
    { role: 'CASHIER', perms: ['users.view'] },
  ];

  const roleDocs = await Role.find({ name: { $in: rolePermMap.map(r => r.role) } });
  const permDocs = await Permission.find({ key: { $in: rolePermMap.flatMap(r => r.perms) } });

  const rolePermInserts = rolePermMap.flatMap(r => {
    const roleId = roleDocs.find(d => d.name === r.role)?._id;
    return r.perms.map(p => {
      const permId = permDocs.find(d => d.key === p)?._id;
      return { roleId, permissionId: permId };
    });
  });

  await RolePermission.insertMany(rolePermInserts, { ordered: false }).catch(() => []);

  console.log('✅ RBAC seed completed');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Seed error', err);
  process.exit(1);
});
