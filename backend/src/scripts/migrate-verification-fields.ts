import mongoose from 'mongoose';
import { ENV } from '../config/environment.js';
import Product from '../modules/products/product.model.js';

async function migrateVerificationFields() {
  await mongoose.connect(ENV.MONGODB_URI);
  const result = await Product.updateMany(
    { $or: [{ soldBy: { $exists: false } }, { requiresSerializedTag: { $exists: false } }] },
    { $set: { soldBy: 'unit', requiresSerializedTag: false } },
  );
  console.log(`Updated ${result.modifiedCount} legacy product records.`);
  await mongoose.disconnect();
}

migrateVerificationFields().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
