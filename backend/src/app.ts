import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import authRoutes from './modules/auth/auth.routes.js';
import inviteRoutes from './modules/invitations/invite.routes.js';
import onboardingRoutes from './modules/onboarding/onboarding.routes.js';
import storeRoutes from './modules/stores/store.routes.js';
import productRoutes from './modules/products/product.routes.js';
import basketRoutes from './modules/baskets/basket.routes.js';
import orderRoutes from './modules/orders/order.routes.js';
import paymentRoutes from './modules/payments/payment.routes.js';
import pickingRoutes from './modules/picking/picking.routes.js';
import exitRoutes from './modules/exit-verification/exit.routes.js';
import auditRoutes from './modules/audits/audit.routes.js';
import systemConfigRoutes from './modules/system-config/system-config.routes.js';
import platformRoutes from './modules/platform/platform.routes.js';
import userPermissionsRoutes from './modules/users/user-permissions.routes.js';
import ledgerRoutes from './modules/ledger/payout.routes.js';
import approvalRoutes from './modules/approvals/approval.routes.js';
import actAsRoutes from './modules/act-as/actAs.routes.js';
import dataMaskingRoutes from './modules/data-masking/dataMasking.routes.js';
import supportRoutes from './modules/support/support.routes.js';
import customerSupportRoutes from './modules/support/customerSupport.routes.js';
import organizationSupportRoutes from './modules/support/organizationSupport.routes.js';
import mfaRoutes from './modules/mfa/mfa.routes.js';
import accessReviewRoutes from './modules/access-review/accessReview.routes.js';
import subscriptionRoutes from './modules/subscriptions/subscription.routes.js';
import structureRoutes from './modules/organizations/structure.routes.js';
import billingRoutes from './modules/billing/billing.routes.js';
import presenceRoutes from './modules/presence/presence.routes.js';
import deviceRoutes from './modules/devices/device.routes.js';
import guestRoutes from './modules/guest/guest.routes.js';
import posRoutes from './modules/pos/pos.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import financialRoutes from './modules/financial/financial.routes.js';
import { handleSseConnection } from './shared/utils/eventStream.js';
import { ENV } from './config/environment.js';
import { generalApiLimiter, authRateLimiter, qrRedemptionLimiter, presenceLimiter } from './middleware/rateLimiter.js';

export function createApp() {
  const app = express();

  // Behind a reverse proxy (hosting platform, ngrok) trust exactly N hops so req.ip and rate limiting see the real client.
  if (ENV.TRUST_PROXY_HOPS > 0) {
    app.set('trust proxy', ENV.TRUST_PROXY_HOPS);
  }

  // Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allows cross-origin frontend SPA interaction in development
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // Allow popups (Google Sign-In) to communicate back to the opener window.
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    })
  );

  // Controlled CORS policy
  // Security fix: Don't use origin: true when ALLOWED_ORIGINS is unset
  // In development, allow localhost; in production, require explicit origins
  const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : 
    (process.env.NODE_ENV === 'development' ? ['http://localhost:5173', 'http://localhost:3000'] : []);
  
  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : false,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-callback-secret'],
    })
  );

  // Barcode-from-image uploads (mobile "scan from photo") carry full JPEGs — larger limit, this path only.
  app.use('/api/v1/products/decode-image', express.json({ limit: '8mb' }));
  // 700kb: product photos arrive as compressed (~60-150kb) data URLs; everything else is far smaller.
  app.use(express.json({ limit: '700kb' }));
  app.use(cookieParser());

  // General rate limiting across all API endpoints
  app.use('/api/', generalApiLimiter);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'HEALTHY',
      service: 'Smart Scan & Go Anti-Fraud Retail API',
      time: new Date().toISOString(),
    });
  });

  // Real-Time Event Stream (Server-Sent Events for live multi-portal sync)
  app.get('/api/v1/events/stream', handleSseConnection);

  // Public mobile-app download — serves the built APK placed in
  // backend/downloads/scan-go.apk so the website's "Get the app" button can
  // hand phones the real app instead of the PWA.
  app.get('/api/v1/app/download', (_req, res) => {
    const apkPath = path.resolve(process.cwd(), 'downloads', 'scan-go.apk');
    if (!fs.existsSync(apkPath)) {
      res.status(404).json({
        success: false,
        error: 'APP_NOT_AVAILABLE',
        message: 'The mobile app package has not been published yet.',
      });
      return;
    }
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="scan-go.apk"');
    fs.createReadStream(apkPath).pipe(res);
  });

  // Mount API modules with specific security rate limiters
  app.use('/api/v1/auth/login', authRateLimiter);
  app.use('/api/v1/auth/register', authRateLimiter);
  app.use('/api/v1/exit/verify-receipt', qrRedemptionLimiter);
  app.use('/api/v1/presence/enter', presenceLimiter);
  app.use('/api/v1/presence/entry-info', presenceLimiter);

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/invites', inviteRoutes);
  app.use('/api/v1/onboarding', onboardingRoutes);
  app.use('/api/v1/users', userPermissionsRoutes);
  app.use('/api/v1/stores', storeRoutes);
  app.use('/api/v1/products', productRoutes);
  app.use('/api/v1/presence', presenceRoutes);
  app.use('/api/v1/baskets', basketRoutes);
  app.use('/api/v1/devices', deviceRoutes);
  app.use('/api/v1/guest', guestRoutes);
  app.use('/api/v1/pos', posRoutes);
  app.use('/api/v1/analytics', analyticsRoutes);
  app.use('/api/v1/financial', financialRoutes);
  app.use('/api/v1/orders', orderRoutes);
  app.use('/api/v1/payments', paymentRoutes);
  app.use('/api/v1/picking', pickingRoutes);
  app.use('/api/v1/exit', exitRoutes);
  app.use('/api/v1/audits', auditRoutes);
  app.use('/api/v1/system-config', systemConfigRoutes);
  app.use('/api/v1/platform', platformRoutes);
  app.use('/api/v1/ledger', ledgerRoutes);
  app.use('/api/v1/approvals', approvalRoutes);
  app.use('/api/v1/act-as', actAsRoutes);
  app.use('/api/v1/data-masking', dataMaskingRoutes);
  // Customer-facing help desk (must be mounted before the staff support router)
  app.use('/api/v1/support/my', customerSupportRoutes);
  app.use('/api/v1/support/org', organizationSupportRoutes);
  app.use('/api/v1/support', supportRoutes);
  app.use('/api/v1/mfa', mfaRoutes);
  app.use('/api/v1/access-review', accessReviewRoutes);
  app.use('/api/v1/subscriptions', subscriptionRoutes);
  app.use('/api/v1/org-structure', structureRoutes);
  app.use('/api/v1/billing', billingRoutes);

  // Global error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[API Error]:', err);
    res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Internal Server Error',
    });
  });

  return app;
}