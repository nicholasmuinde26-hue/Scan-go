/**
 * Copies databases from local MongoDB (localhost:27017) to the Atlas cluster.
 * Merges documents by _id (upsert) — safe to re-run.
 *
 * Usage:
 *   MONGODB_URI="mongodb+srv://...@cluster0.xxx.mongodb.net/?appName=Cluster0" \
 *   npx tsx src/scripts/migrate-local-to-atlas.ts scan_and_go_db nicholas-portfolio
 */
import { MongoClient } from 'mongodb';

const ATLAS_URI = process.env.MONGODB_URI;
const SOURCE_URI = process.env.LOCAL_MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAMES = process.argv.slice(2);

if (!ATLAS_URI) {
  console.error('Set MONGODB_URI to the Atlas connection string (no db path needed).');
  process.exit(1);
}
if (DB_NAMES.length === 0) {
  console.error('Pass database names to migrate, e.g. scan_and_go_db nicholas-portfolio');
  process.exit(1);
}

async function migrateDb(src: MongoClient, dst: MongoClient, dbName: string) {
  const srcDb = src.db(dbName);
  const dstDb = dst.db(dbName);
  const collections = await srcDb.listCollections().toArray();
  console.log(`[${dbName}] ${collections.length} collections on localhost`);

  for (const { name } of collections) {
    const srcCol = srcDb.collection(name);
    const dstCol = dstDb.collection(name);
    const docs = await srcCol.find({}).toArray();
    if (docs.length === 0) {
      console.log(`  ${name}: empty, skipped`);
      continue;
    }
    // Upsert by _id so re-runs merge instead of duplicating.
    const ops = docs.map((d) => ({
      replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true },
    }));
    let modified = 0;
    for (let i = 0; i < ops.length; i += 500) {
      const res = await dstCol.bulkWrite(ops.slice(i, i + 500), { ordered: false });
      modified += res.upsertedCount + res.modifiedCount;
    }
    // Copy indexes (skip _id which exists by default).
    const indexes = await srcCol.indexes();
    for (const idx of indexes) {
      if (idx.name === '_id_') continue;
      const { name: idxName, key, ...opts } = idx as any;
      try {
        await dstCol.createIndex(key, { ...opts, name: idxName });
      } catch { /* index may already exist */ }
    }
    console.log(`  ${name}: ${docs.length} docs synced (${modified} changed)`);
  }
  console.log(`[${dbName}] done`);
}

async function main() {
  const src = new MongoClient(SOURCE_URI);
  const dst = new MongoClient(ATLAS_URI);
  await src.connect();
  await dst.connect();
  console.log(`Source: ${SOURCE_URI}`);
  console.log(`Target: Atlas cluster`);
  for (const db of DB_NAMES) {
    await migrateDb(src, dst, db);
  }
  await src.close();
  await dst.close();
  console.log('Migration complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
