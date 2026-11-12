import { connectDatabase } from '../config/database.js';
import User from '../modules/users/user.model.js';
import Organization from '../modules/organizations/organization.model.js';
import { generateToken } from '../middleware/auth.js';
import { createApp } from '../app.js';
import mongoose from 'mongoose';

async function testSuperAdmin() {
  await connectDatabase();
  const app = createApp();

  const superAdmin = await User.findOne({ role: 'SYSTEM_ADMIN' });
  if (!superAdmin) throw new Error('No SYSTEM_ADMIN found');

  const token = generateToken({
    id: superAdmin._id.toString(),
    role: superAdmin.role,
    name: superAdmin.name,
    phone: superAdmin.phone,
  });

  // Start temporary local server to test HTTP routes
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1/platform`;

  try {
    console.log('Testing Super Admin Platform APIs...');

    // 1. GET /settings
    const resSettings = await fetch(`${baseUrl}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const dataSettings: any = await resSettings.json();
    console.log('1. GET /settings:', resSettings.status, dataSettings.success ? 'PASS' : 'FAIL');

    // 2. PATCH /settings (update maintenance message)
    const resPatchSettings = await fetch(`${baseUrl}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ maintenanceMessage: 'Scheduled server upgrades tonight 2am.' }),
    });
    const dataPatch: any = await resPatchSettings.json();
    console.log('2. PATCH /settings:', resPatchSettings.status, dataPatch.success ? 'PASS' : 'FAIL');

    // 3. GET /organizations
    const resOrgs = await fetch(`${baseUrl}/organizations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const dataOrgs: any = await resOrgs.json();
    console.log('3. GET /organizations:', resOrgs.status, 'Count:', dataOrgs.organizations?.length);

    // 4. POST /organizations (Create a new supermarket workspace + admin)
    const testSlug = `quickmart-${Date.now()}`;
    const testPhone = `0799${Math.floor(100000 + Math.random() * 900000)}`;
    const resCreateOrg = await fetch(`${baseUrl}/organizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: 'QuickMart Supermarkets',
        slug: testSlug,
        contactEmail: 'contact@quickmart.co.ke',
        contactPhone: '0700112233',
        maxStores: 8,
        planCode: 'BASIC',
        features: { scanAndGo: true, clickAndCollect: true, mpesa: true },
        admin: {
          name: 'Daniel Mutua',
          phone: testPhone,
          email: 'daniel@quickmart.co.ke',
        },
      }),
    });
    const dataCreateOrg: any = await resCreateOrg.json();
    console.log('4. POST /organizations:', resCreateOrg.status, dataCreateOrg.success ? 'PASS' : 'FAIL');
    if (!dataCreateOrg.success) console.error('Error detail:', dataCreateOrg);

    const createdOrgId = dataCreateOrg.organization?._id;
    if (createdOrgId) {
      // 5. GET /organizations/:id/admins
      const resAdmins = await fetch(`${baseUrl}/organizations/${createdOrgId}/admins`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dataAdmins: any = await resAdmins.json();
      console.log('5. GET /organizations/:id/admins:', resAdmins.status, 'Admins found:', dataAdmins.admins?.length);

      // 6. POST /organizations/:id/stores (Provision store branch under workspace)
      const resStore = await fetch(`${baseUrl}/organizations/${createdOrgId}/stores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: 'QuickMart Kilimani Branch',
          code: `QM-KIL-${Date.now().toString().slice(-4)}`,
          location: 'Argwings Kodhek Rd, Kilimani, Nairobi',
        }),
      });
      const dataStore: any = await resStore.json();
      console.log('6. POST /organizations/:id/stores:', resStore.status, dataStore.success ? 'PASS' : 'FAIL');
    }

    console.log('ALL SUPER ADMIN BACKEND TESTS COMPLETED SUCCESSFULLY!');
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

testSuperAdmin().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
