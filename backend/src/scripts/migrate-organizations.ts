import mongoose from 'mongoose';
import { ENV } from '../config/environment.js';
import Organization from '../modules/organizations/organization.model.js';
import Store from '../modules/stores/store.model.js';
import User from '../modules/users/user.model.js';

/**
 * Migration Script: Migrate existing Stores into Organizations
 * 
 * This script:
 * 1. Creates an Organization for each existing Store that doesn't have one
 * 2. Links the Store to the Organization
 * 3. Updates ORG_ADMIN users to have organizationId
 * 4. Updates STORE_MANAGER users to have both organizationId and storeId
 * 
 * Run with: npm run migrate-organizations
 */

async function migrate() {
  try {
    console.log('[Migration] Starting Organization migration...');
    
    await mongoose.connect(ENV.MONGODB_URI);
    console.log('[Migration] Connected to MongoDB');

    // Step 1: Find all stores without an organization
    const storesWithoutOrg = await Store.find({ organizationId: { $exists: false } });
    console.log(`[Migration] Found ${storesWithoutOrg.length} stores without organization`);

    for (const store of storesWithoutOrg) {
      console.log(`[Migration] Processing store: ${store.name} (${store.code})`);

      // Step 2: Create an Organization for this store
      const orgSlug = store.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      
      let org = await Organization.findOne({ slug: orgSlug });
      if (!org) {
        org = await Organization.create({
          name: `${store.name} Organization`,
          slug: orgSlug,
          status: 'ACTIVE',
          contactEmail: store.managerId ? undefined : undefined,
          contactPhone: store.managerId ? undefined : undefined,
        });
        console.log(`[Migration] Created organization: ${org.name} (${org.slug})`);
      } else {
        console.log(`[Migration] Using existing organization: ${org.name} (${org.slug})`);
      }

      // Step 3: Link store to organization
      store.organizationId = org._id as any;
      await store.save();
      console.log(`[Migration] Linked store ${store.name} to organization ${org.name}`);

      // Step 4: Update users
      // Find STORE_MANAGER for this store
      const storeManagers = await User.find({ 
        storeId: store._id, 
        role: 'STORE_MANAGER' 
      });

      for (const manager of storeManagers) {
        manager.organizationId = org._id as any;
        await manager.save();
        console.log(`[Migration] Updated STORE_MANAGER ${manager.name} with organizationId`);
      }

      // Find users with this store who might need organizationId
      const storeStaff = await User.find({ 
        storeId: store._id,
        role: { $in: ['SUPERVISOR', 'PICKER', 'EXIT_STAFF'] }
      });

      for (const staff of storeStaff) {
        staff.organizationId = org._id as any;
        await staff.save();
        console.log(`[Migration] Updated ${staff.role} ${staff.name} with organizationId`);
      }
    }

    // Step 5: Handle ORG_ADMIN users without organizationId
    const orgAdmins = await User.find({ 
      role: 'ORG_ADMIN',
      organizationId: { $exists: false }
    });

    console.log(`[Migration] Found ${orgAdmins.length} ORG_ADMIN users without organizationId`);

    for (const admin of orgAdmins) {
      // If they have a storeId, use that store's organization
      if (admin.storeId) {
        const store = await Store.findById(admin.storeId);
        if (store && store.organizationId) {
          admin.organizationId = store.organizationId as any;
          await admin.save();
          console.log(`[Migration] Updated ORG_ADMIN ${admin.name} with organizationId from store`);
        }
      } else {
        // Find first organization without an admin
        const orgWithoutAdmin = await Organization.findOne({ 
          status: 'ACTIVE' 
        }).sort({ createdAt: 1 });

        if (orgWithoutAdmin) {
          admin.organizationId = orgWithoutAdmin._id as any;
          await admin.save();
          console.log(`[Migration] Updated ORG_ADMIN ${admin.name} with organizationId ${orgWithoutAdmin.name}`);
        } else {
          console.warn(`[Migration] WARNING: No organization found for ORG_ADMIN ${admin.name}`);
        }
      }
    }

    console.log('[Migration] Migration completed successfully!');
    console.log('[Migration] Summary:');
    console.log(`  - Stores migrated: ${storesWithoutOrg.length}`);
    console.log(`  - ORG_ADMIN users updated: ${orgAdmins.length}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error('[Migration] Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

migrate();
