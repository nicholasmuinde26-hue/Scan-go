import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../modules/users/user.model.js';
import { connectDatabase } from '../config/database.js';
import { getSettings } from '../modules/platform/systemSettings.model.js';
import { validatePasswordStrength } from '../shared/utils/passwordPolicy.js';

/**
 * Enterprise Production One-Time Bootstrap Script:
 * 
 * Rules:
 * 1. Refuses to run if any SYSTEM_ADMIN or PLATFORM_OWNER already exists in database.
 * 2. Creates two distinct platform super-admin owners (for disaster recovery & quorum).
 * 3. Enforces >= 12 character strong passwords (cost 12 bcrypt).
 * 4. Mandates password change and TOTP MFA enrollment on first login.
 * 5. CLI / Env only.
 * 
 * Usage:
 * OWNER_1_PHONE=0700000001 OWNER_1_PASSWORD='Passphrase-One-1234' OWNER_1_NAME='Platform Owner Alpha' \
 * OWNER_2_PHONE=0700000002 OWNER_2_PASSWORD='Passphrase-Two-1234' OWNER_2_NAME='Platform Owner Beta' \
 * npx tsx src/scripts/seed.super.admin.ts
 */
async function main() {
  const p1Phone = process.env.OWNER_1_PHONE;
  const p1Pass = process.env.OWNER_1_PASSWORD;
  const p1Name = process.env.OWNER_1_NAME || 'Platform Owner Alpha';
  const p1Email = process.env.OWNER_1_EMAIL;

  const p2Phone = process.env.OWNER_2_PHONE;
  const p2Pass = process.env.OWNER_2_PASSWORD;
  const p2Name = process.env.OWNER_2_NAME || 'Platform Owner Beta';
  const p2Email = process.env.OWNER_2_EMAIL;

  if (!p1Phone || !p1Pass || !p2Phone || !p2Pass) {
    throw new Error(
      'Bootstrap requires two distinct owners: Set OWNER_1_PHONE, OWNER_1_PASSWORD, OWNER_2_PHONE, and OWNER_2_PASSWORD in env.'
    );
  }

  if (p1Phone === p2Phone) {
    throw new Error('Owner 1 and Owner 2 must have distinct phone numbers.');
  }

  const v1 = validatePasswordStrength(p1Pass);
  if (!v1.valid) throw new Error(`Owner 1 password invalid: ${v1.error}`);

  const v2 = validatePasswordStrength(p2Pass);
  if (!v2.valid) throw new Error(`Owner 2 password invalid: ${v2.error}`);

  await connectDatabase();
  await getSettings(); // Initialize global system settings singleton

  // 1. Refuse to run if an owner already exists
  const existingOwner = await User.findOne({
    role: { $in: ['SYSTEM_ADMIN', 'PLATFORM_OWNER'] },
  });

  if (existingOwner) {
    console.error(`[BOOTSTRAP REFUSED]: An owner already exists (${existingOwner.phone}). Bootstrap cannot run twice.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // 2. Create Owner 1
  const owner1 = await User.create({
    name: p1Name,
    phone: p1Phone.trim(),
    email: p1Email ? p1Email.trim() : undefined,
    passwordHash: await bcrypt.hash(p1Pass, 12),
    role: 'PLATFORM_OWNER',
    status: 'ACTIVE',
    active: true,
    mustChangePassword: true,
    mfaEnabled: false,
    failedLoginAttempts: 0,
    sessions: [],
  });

  // 3. Create Owner 2
  const owner2 = await User.create({
    name: p2Name,
    phone: p2Phone.trim(),
    email: p2Email ? p2Email.trim() : undefined,
    passwordHash: await bcrypt.hash(p2Pass, 12),
    role: 'PLATFORM_OWNER',
    status: 'ACTIVE',
    active: true,
    mustChangePassword: true,
    mfaEnabled: false,
    failedLoginAttempts: 0,
    sessions: [],
  });

  console.log(`[BOOTSTRAP SUCCESS]: Created 2 distinct Super Admin owners:`);
  console.log(`  1. ${owner1.name} (${owner1.phone})`);
  console.log(`  2. ${owner2.name} (${owner2.phone})`);
  console.log(`Note: Password change and TOTP MFA setup are required on first login.`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('[BOOTSTRAP ERROR]:', err);
  process.exit(1);
});
