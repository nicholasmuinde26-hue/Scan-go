import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { ENV } from './config/environment.js';
import { startReconciliationWorker } from './modules/payments/reconciliation.job.js';
import { ensurePlanCatalogue, startSubscriptionLifecycleWorker } from './modules/subscriptions/subscription.service.js';
import { startPresenceJanitor } from './modules/presence/presence.service.js';
import { startMqttGateway } from './modules/devices/mqtt.service.js';

async function bootstrap() {
  await connectDatabase();
  await ensurePlanCatalogue();
  const app = createApp();

  // Start Daraja background reconciliation worker for stuck orders
  startReconciliationWorker();
  startSubscriptionLifecycleWorker();
  startPresenceJanitor();
  startMqttGateway();

  app.listen(ENV.PORT, () => {
    console.log(`=======================================================`);
    console.log(` 🛒 Smart Scan & Go Retail Fraud-Prevention Server Running`);
    console.log(` 📍 API: http://localhost:${ENV.PORT}`);
    console.log(` 📍 Environment: ${ENV.NODE_ENV}`);
    console.log(`=======================================================`);
  });
}

bootstrap().catch(err => {
  console.error('Fatal Server Boot Error:', err);
  process.exit(1);
});
