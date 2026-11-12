import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import User from '../modules/users/user.model.js';
import { phoneVariants } from '../shared/utils/phone.js';

/**
 * Diagnose a failing login without guessing.
 *   npx tsx src/scripts/check-login.ts 0777555666 password123
 */
const STAFF_ROLES = [
  'BRANCH_MANAGER', 'STOCK_CONTROLLER', 'SUPERVISOR', 'CASHIER_CUSTOMER_SERVICE', 'PICKER',
  'PACKER_VERIFIER', 'EXIT_OFFICER', 'DELIVERY_COLLECTION_HANDOVER', 'ORG_OWNER', 'ORG_ADMIN',
  'FINANCE_OFFICER', 'CATALOGUE_INVENTORY_MANAGER', 'MARKETING_MANAGER', 'LOSS_PREVENTION_MANAGER',
  'ORG_AUDITOR', 'EXIT_STAFF', 'STORE_MANAGER',
];

async function main() {
  const [phone, password] = process.argv.slice(2);
  if (!phone) {
    console.log('Usage: npx tsx src/scripts/check-login.ts <phone> [password]');
    process.exit(1);
  }

  await connectDatabase();
  console.log(`Database: ${mongoose.connection.name}  @ ${mongoose.connection.host}`);
  console.log(`Total users in this database: ${await User.countDocuments()}`);

  const variants = phoneVariants(phone);
  console.log('Looking for any of:', variants);

  const users = await User.find({ phone: { $in: variants } });
  if (users.length === 0) {
    console.log('\nRESULT: no user with that phone in THIS database.');
    const sample = await User.find({}, { phone: 1, role: 1 }).limit(15).lean();
    console.log('Phones that DO exist (first 15):');
    sample.forEach((u: any) => console.log(`  ${JSON.stringify(u.phone)}  ${u.role}`));
    console.log('\nIf the user is in your seed file, the seed has not been run against this database.');
    process.exit(0);
  }

  for (const u of users) {
    console.log(`\nFound: ${JSON.stringify(u.phone)}  role=${u.role}  status=${u.status}  active=${u.active}`);
    console.log(`  allowed on STAFF portal: ${STAFF_ROLES.includes(u.role)}`);
    console.log(`  locked until: ${u.lockoutUntil ?? 'not locked'}  failedLoginAttempts=${u.failedLoginAttempts ?? 0}`);
    console.log(`  mfaEnabled=${u.mfaEnabled ?? false}  storeId=${u.storeId ?? '-'}  organizationId=${u.organizationId ?? '-'}`);
    if (password) {
      console.log(`  password matches: ${await bcrypt.compare(password, u.passwordHash)}`);
    }
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });