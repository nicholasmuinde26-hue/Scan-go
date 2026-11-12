import bcrypt from 'bcryptjs';
import { connectDatabase } from '../config/database.js';
import Store from '../modules/stores/store.model.js';
import User from '../modules/users/user.model.js';
import Organization from '../modules/organizations/organization.model.js';
import { phoneVariants } from '../shared/utils/phone.js';

/**
 * NON-destructive: adds the demo staff accounts that are missing from the current database.
 * Never drops anything and never touches users that already exist.
 *   npx tsx src/scripts/seed-missing-staff.ts
 */
async function main() {
  await connectDatabase();

  // Optional: npx tsx src/scripts/seed-missing-staff.ts <storeCode>
  const storeCodeArg = process.argv[2];
  let store: any = storeCodeArg ? await Store.findOne({ code: storeCodeArg }) : await Store.findOne({ code: 'STORE-01' });
  let org: any = await Organization.findOne({ slug: 'naivas-supermarket' });

  // Fallback: attach to the same store/org as the already-seeded demo staff (e.g. the store manager).
  if (!store || !org) {
    const anchor =
      (await User.findOne({ phone: { $in: phoneVariants('0766444555') } })) ||
      (await User.findOne({ phone: { $in: phoneVariants('0733111222') } }));
    if (anchor?.storeId) store = store || (await Store.findById(anchor.storeId));
    const orgId = anchor?.organizationId || store?.organizationId;
    if (orgId) org = org || (await Organization.findById(orgId));
  }

  if (!store || !org) {
    console.error('Could not work out which store/organization to use. What exists in this database:');
    const stores = await Store.find({}, { name: 1, code: 1, organizationId: 1 }).lean();
    const orgs = await Organization.find({}, { name: 1, slug: 1 }).lean();
    console.error('Stores:', stores.map((x: any) => `${x.code} - ${x.name}`));
    console.error('Organizations:', orgs.map((x: any) => `${x.slug} - ${x.name}`));
    console.error('Re-run with a store code: npx tsx src/scripts/seed-missing-staff.ts <storeCode>');
    process.exit(1);
  }
  console.log(`Attaching staff to store "${store.name}" (${store.code}) in organization "${org.name}"`);

  const passwordHash = await bcrypt.hash('password123', 10);
  const wanted = [
    { name: 'Peter Ouma (Stock Controller)', phone: '0777555666', email: 'peter.stock@supermarket.co.ke', role: 'STOCK_CONTROLLER', storeId: store._id, organizationId: org._id },
    { name: 'Samuel Njoroge (Branch Manager)', phone: '0799777888', email: 'branch.manager@supermarket.co.ke', role: 'BRANCH_MANAGER', storeId: store._id, organizationId: org._id },
    { name: 'Faith Njeri (Catalogue & Inventory Manager)', phone: '0788666777', email: 'faith.catalogue@supermarket.co.ke', role: 'CATALOGUE_INVENTORY_MANAGER', organizationId: org._id },
  ];

  for (const u of wanted) {
    const exists = await User.findOne({ phone: { $in: phoneVariants(u.phone) } });
    if (exists) {
      console.log(`Skipped ${u.phone}: already exists (${exists.role})`);
      continue;
    }
    await User.create({ ...u, passwordHash } as any);
    console.log(`Created ${u.phone} (${u.role}) with password "password123"`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });