import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../users/user.model.js';
import PhoneOtp from './otp.model.js';
import Organization from '../organizations/organization.model.js';
import Store from '../stores/store.model.js';
import AuditLog from '../audits/audit.model.js';
import SystemConfig from '../system-config/system-config.model.js';
import { getSettings } from '../platform/systemSettings.model.js';
import { generateToken, authenticate, AuthRequest, getRolePortalConfig, effectivePermissionsFor } from '../../middleware/auth.js';
import { UserRole } from '../../shared/types/index.js';
import { validatePasswordStrength } from '../../shared/utils/passwordPolicy.js';
import { ENV } from '../../config/environment.js';
import { OAuth2Client } from 'google-auth-library';

const googleClient = new OAuth2Client(ENV.GOOGLE_CLIENT_ID || undefined);
import { phoneVariants } from '../../shared/utils/phone.js';

const router = Router();

// Constant dummy hash for timing attack mitigation when phone does not exist
const DUMMY_HASH = '$2a$12$e8r0Hsk8wA2b5Yh/Yj172eI56sP0JvM4vW202zWfWq9b.91k358mK';

// Portal role authorization mappings
const PORTAL_ROLE_MAP: Record<string, string[]> = {
  CUSTOMER: ['CUSTOMER'],
  STAFF: [
    'BRANCH_MANAGER', 'STOCK_CONTROLLER', 'STOCK_MANAGER', 'SUPERVISOR', 'CASHIER_CUSTOMER_SERVICE',
    'PICKER', 'PACKER_VERIFIER', 'EXIT_OFFICER', 'DELIVERY_COLLECTION_HANDOVER',
    'ORG_OWNER', 'ORG_ADMIN', 'FINANCE_OFFICER', 'CATALOGUE_INVENTORY_MANAGER',
    'MARKETING_MANAGER', 'LOSS_PREVENTION_MANAGER', 'ORG_AUDITOR',
    'EXIT_STAFF', 'STORE_MANAGER'
  ],
  ADMIN: [
    'SYSTEM_ADMIN', 'PLATFORM_OWNER', 'PLATFORM_ADMIN', 'FINANCE_ADMIN', 'FINANCE_APPROVER',
    'SUPPORT_AGENT_TIER1', 'SUPPORT_LEAD_TIER2', 'RISK_FRAUD_ANALYST', 'COMPLIANCE_AUDITOR',
    'PLATFORM_ENGINEER', 'CUSTOMER_SUCCESS',
    'ORG_OWNER', 'ORG_ADMIN', 'FINANCE_OFFICER', 'CATALOGUE_INVENTORY_MANAGER',
    'BRANCH_MANAGER', 'STORE_MANAGER', 'STOCK_CONTROLLER', 'STOCK_MANAGER'
  ]
};

// Refresh token duration: 7 days
const REFRESH_TOKEN_DAYS = 7;

function setRefreshTokenCookie(res: Response, refreshToken: string) {
  res.cookie('tusk_refresh_token', refreshToken, {
    httpOnly: true,
    secure: ENV.NODE_ENV === 'production',
    // 'none' is required when the web app is hosted on a different site than the API
    // (e.g. Vercel frontend -> Render API); browsers only send it over HTTPS.
    sameSite: ENV.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    path: '/api/v1/auth',
  });
}

function clearRefreshTokenCookie(res: Response) {
  res.clearCookie('tusk_refresh_token', {
    httpOnly: true,
    secure: ENV.NODE_ENV === 'production',
    sameSite: ENV.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/api/v1/auth',
  });
}

// -------------------------------------------------------------
// 1. Phone OTP generation (for Customer Registration / Forgot Password)
// -------------------------------------------------------------
router.post('/otp/send', async (req: Request, res: Response) => {
  try {
    const { phone, purpose } = req.body;
    if (!phone || !purpose) {
      res.status(400).json({ success: false, error: 'Phone and purpose are required.' });
      return;
    }

    if (!['REGISTRATION', 'FORGOT_PASSWORD', 'LOGIN_VERIFY'].includes(purpose)) {
      res.status(400).json({ success: false, error: 'Invalid OTP purpose.' });
      return;
    }

    // In registration mode, verify public registration is allowed
    if (purpose === 'REGISTRATION') {
      const settings = await getSettings();
      if (settings && settings.allowPublicRegistration === false) {
        res.status(403).json({ success: false, error: 'Public customer registration is currently disabled.' });
        return;
      }

      const existing = await User.findOne({ phone: phone.trim() });
      if (existing) {
        res.status(409).json({ success: false, error: 'Phone number already registered. Please sign in.' });
        return;
      }
    }

    // Generate 6-digit numeric OTP
    const rawOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await bcrypt.hash(rawOtp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

    // Delete any pending OTPs for this phone + purpose
    await PhoneOtp.deleteMany({ phone: phone.trim(), purpose });
    await PhoneOtp.create({
      phone: phone.trim(),
      codeHash,
      purpose,
      expiresAt,
    });

    // In production, integrate SMS provider (Africa's Talking / Twilio).
    // Dev/demo mode returns the otp code so testers can complete flows without SMS.
    // OTP_DEV_ECHO=true also enables the echo in production for demo deployments.
    const isDev = ENV.NODE_ENV !== 'production' || process.env.OTP_DEV_ECHO === 'true';

    res.json({
      success: true,
      message: `OTP sent to ${phone.trim()}. Valid for 5 minutes.`,
      ...(isDev ? { devOtpCode: rawOtp } : {}),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------------------------------------------
// 2. Customer Registration (with OTP verification & DPA consent)
// -------------------------------------------------------------
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, phone, email, password, otp, termsConsent } = req.body;

    if (!name || !phone || !password || !otp) {
      res.status(400).json({ success: false, error: 'Name, phone, password, and OTP are required.' });
      return;
    }

    if (!termsConsent) {
      res.status(400).json({
        success: false,
        error: 'You must consent to the Terms of Service & Privacy Policy under the Data Protection Act.',
      });
      return;
    }

    // Check platform settings
    const settings = await getSettings();
    if (settings && settings.allowPublicRegistration === false) {
      res.status(403).json({ success: false, error: 'Public customer registration is currently disabled.' });
      return;
    }

    // Validate password strength (12 chars min)
    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      res.status(400).json({ success: false, error: pwCheck.error });
      return;
    }

    // Verify OTP
    const otpRecord = await PhoneOtp.findOne({ phone: phone.trim(), purpose: 'REGISTRATION' });
    if (!otpRecord) {
      res.status(400).json({ success: false, error: 'OTP expired or never requested. Please request a new OTP.' });
      return;
    }

    if (new Date() > otpRecord.expiresAt) {
      await PhoneOtp.deleteOne({ _id: otpRecord._id });
      res.status(400).json({ success: false, error: 'OTP has expired. Please request a new one.' });
      return;
    }

    const otpMatch = await bcrypt.compare(otp.trim(), otpRecord.codeHash);
    if (!otpMatch) {
      otpRecord.attempts = (otpRecord.attempts || 0) + 1;
      await otpRecord.save();
      res.status(400).json({ success: false, error: 'Invalid verification OTP.' });
      return;
    }

    // OTP verified - delete it
    await PhoneOtp.deleteOne({ _id: otpRecord._id });

    // Check unique phone
    const existing = await User.findOne({ phone: phone.trim() });
    if (existing) {
      res.status(400).json({ success: false, error: 'Phone number already registered.' });
      return;
    }

    // Cost 12 everywhere
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: name.trim(),
      phone: phone.trim(),
      email: email ? email.trim() : undefined,
      passwordHash,
      role: 'CUSTOMER', // Public register strictly creates CUSTOMER only
      status: 'ACTIVE',
      active: true,
      tripsCompleted: 0,
      cleanTrips: 0,
      sessions: [],
    });

    // Create session and refresh token
    const sessionId = crypto.randomUUID();
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    user.sessions = [
      {
        sessionId,
        refreshTokenHash,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
      },
    ];
    await user.save();

    setRefreshTokenCookie(res, `${sessionId}:${rawRefreshToken}`);

    const token = generateToken({
      id: user._id.toString(),
      role: user.role,
      name: user.name,
      phone: user.phone,
    });

    const portalConfig = getRolePortalConfig(user.role);

    await AuditLog.create({
      actorId: user._id,
      actorRole: user.role,
      actorName: user.name,
      action: 'CUSTOMER_REGISTER',
      entityType: 'USER',
      entityId: user._id.toString(),
      newValue: { phone: user.phone },
      reason: 'Verified phone registration with DPA consent',
    });

    res.status(201).json({
      success: true,
      token,
      refreshToken: `${sessionId}:${rawRefreshToken}`,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        tripsCompleted: user.tripsCompleted,
        cleanTrips: user.cleanTrips,
      },
      ...portalConfig,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------------------------------------------
// 3. Login with Portal Enforcement, MFA Challenge & Brute-Force Defense
// -------------------------------------------------------------
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { phone, password, portal = 'CUSTOMER', mfaCode } = req.body;

    if (!phone || !password) {
      res.status(400).json({ success: false, error: 'Phone and password are required.' });
      return;
    }

    const cleanPhone = String(phone).trim();
    // Exact match first, then any equivalent spelling (07.., 2547.., +2547..) so the way the
    // number was originally saved (seed, invite, registration) never blocks a valid login.
    const user =
      (await User.findOne({ phone: cleanPhone })) ||
      (await User.findOne({ phone: { $in: phoneVariants(cleanPhone) } })) ||
      (cleanPhone.includes('@') ? await User.findOne({ email: cleanPhone.toLowerCase() }) : null);

    // Anti-enumeration: If user does not exist, run dummy compare to match response time
    if (!user) {
      if (ENV.NODE_ENV !== 'production') {
        console.warn(`[Auth] Login failed: no user found for phone variants ${JSON.stringify(phoneVariants(cleanPhone))} (db: ${User.db.name})`);
      }
      await bcrypt.compare(password, DUMMY_HASH);
      res.status(401).json({ success: false, error: 'Invalid phone number or password.' });
      return;
    }

    // Check account lockout
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      const waitMinutes = Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 60000);
      res.status(429).json({
        success: false,
        error: `Account temporarily locked due to repeated failed logins. Please try again in ${waitMinutes} minute(s).`,
      });
      return;
    }

    // Password verification
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      if (ENV.NODE_ENV !== 'production') {
        console.warn(`[Auth] Login failed: user ${user.phone} (${user.role}) found but password did not match`);
      }
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      // Progressive lockout: 5 failures = 5 min, 10 failures = 30 min
      if (user.failedLoginAttempts >= 10) {
        user.lockoutUntil = new Date(Date.now() + 30 * 60 * 1000);
      } else if (user.failedLoginAttempts >= 5) {
        user.lockoutUntil = new Date(Date.now() + 5 * 60 * 1000);
      }
      await user.save();

      await AuditLog.create({
        actorRole: user.role,
        actorName: user.name,
        action: 'LOGIN_FAILURE',
        entityType: 'USER',
        entityId: user._id.toString(),
        reason: `Failed login attempt #${user.failedLoginAttempts}`,
      });

      res.status(401).json({ success: false, error: 'Invalid phone number or password.' });
      return;
    }

    // Reset failed login attempts upon successful password
    user.failedLoginAttempts = 0;
    user.lockoutUntil = undefined;

    // Account active check
    if (user.active === false || user.status === 'DEACTIVATED') {
      res.status(403).json({ success: false, error: 'Your account has been deactivated. Please contact support.' });
      return;
    }
    if (user.status === 'SUSPENDED') {
      res.status(403).json({ success: false, error: 'Your account has been suspended. Please contact your administrator.' });
      return;
    }

    // Organization active check
    if (user.organizationId) {
      const org = await Organization.findById(user.organizationId);
      if (org && org.status === 'SUSPENDED') {
        res.status(403).json({ success: false, error: 'Your supermarket organization is suspended.' });
        return;
      }
    }

    // Store branch active check (for branch staff)
    if (user.storeId) {
      const branch = await Store.findById(user.storeId);
      if (branch && branch.active === false) {
        res.status(403).json({ success: false, error: 'Your assigned store branch is currently inactive.' });
        return;
      }
    }

    // Portal enforcement: Ensure user role is permitted for the portal targeted
    const allowedRolesForPortal = PORTAL_ROLE_MAP[portal.toUpperCase()] || [];
    if (portal && portal.toUpperCase() !== 'CUSTOMER' && !allowedRolesForPortal.includes(user.role)) {
      // Return generic error so attackers cannot probe portal boundaries
      res.status(403).json({
        success: false,
        error: 'Invalid credentials or portal access denied.',
      });
      return;
    }

    // Privileged roles require MFA check
    const privilegedRoles = [
      'SYSTEM_ADMIN', 'PLATFORM_OWNER', 'PLATFORM_ADMIN', 'FINANCE_ADMIN', 'FINANCE_APPROVER',
      'ORG_OWNER', 'ORG_ADMIN', 'FINANCE_OFFICER', 'LOSS_PREVENTION_MANAGER', 'BRANCH_MANAGER', 'STORE_MANAGER'
    ];
    const isPrivileged = privilegedRoles.includes(user.role);

    // If MFA is enabled on user OR mandated by privileged role
    if (user.mfaEnabled && user.mfaSecret) {
      if (!mfaCode) {
        // Issue short 5-minute MFA challenge token
        const mfaChallengeToken = jwt.sign(
          { id: user._id.toString(), stage: 'MFA_REQUIRED' },
          ENV.JWT_SECRET,
          { expiresIn: '5m' }
        );
        res.status(200).json({
          success: false,
          requireMfa: true,
          mfaChallengeToken,
          message: 'Two-factor authenticator code required.',
        });
        return;
      }

      // Verify TOTP code
      const speakeasy = (await import('speakeasy')).default;
      const verified = speakeasy.totp.verify({
        secret: user.mfaSecret,
        encoding: 'base32',
        token: mfaCode.trim(),
        window: 1,
      });

      if (!verified) {
        // Check backup/recovery codes
        let recoveryUsed = false;
        if (user.mfaBackupCodes && user.mfaBackupCodes.length > 0) {
          const matchingIndex = user.mfaBackupCodes.findIndex(
            (codeHash) => bcrypt.compareSync(mfaCode.trim(), codeHash)
          );
          if (matchingIndex !== -1) {
            user.mfaBackupCodes.splice(matchingIndex, 1);
            recoveryUsed = true;
          }
        }

        if (!recoveryUsed) {
          res.status(401).json({ success: false, error: 'Invalid two-factor authentication code.' });
          return;
        }
      }
    } else if (isPrivileged && !user.mfaEnabled) {
      // Force MFA setup on next step
      user.mustChangePassword = user.mustChangePassword || false;
    }

    // Create session and rotating refresh token
    const sessionId = crypto.randomUUID();
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    // Keep at most 10 active sessions per user
    const currentSessions = (user.sessions || []).slice(-9);
    currentSessions.push({
      sessionId,
      refreshTokenHash,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    });

    user.sessions = currentSessions as any;
    user.lastLoginAt = new Date();
    await user.save();

    setRefreshTokenCookie(res, `${sessionId}:${rawRefreshToken}`);

    const token = generateToken({
      id: user._id.toString(),
      role: user.role,
      storeId: user.storeId?.toString(),
      organizationId: user.organizationId?.toString(),
      name: user.name,
      phone: user.phone,
    });

    const portalConfig = getRolePortalConfig(user.role);

    await AuditLog.create({
      actorId: user._id,
      actorRole: user.role,
      actorName: user.name,
      action: 'LOGIN_SUCCESS',
      entityType: 'USER',
      entityId: user._id.toString(),
      ipAddress: req.ip,
      reason: `Authenticated to ${portal} portal`,
    });

    res.json({
      success: true,
      token,
      refreshToken: `${sessionId}:${rawRefreshToken}`,
      mustChangePassword: user.mustChangePassword || false,
      mfaRequiredSetup: isPrivileged && !user.mfaEnabled,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        storeId: user.storeId,
        organizationId: user.organizationId,
        tripsCompleted: user.tripsCompleted,
        cleanTrips: user.cleanTrips,
        // Effective permissions (role + overrides, with the scope ceiling applied) drive what the UI shows.
        permissions: effectivePermissionsFor(user),
      },
      ...portalConfig,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------------------------------------------
// 4. Session Refresh Token Rotation (/auth/refresh)
// -------------------------------------------------------------
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    // Refresh token may arrive via httpOnly cookie OR request body (cross-site
    // deployments where third-party cookies are blocked, e.g. Vercel -> Render).
    const rawCookie = req.body?.refreshToken || req.cookies?.tusk_refresh_token;
    if (!rawCookie || !rawCookie.includes(':')) {
      res.status(401).json({ success: false, error: 'No refresh token provided.' });
      return;
    }

    const [sessionId, rawToken] = rawCookie.split(':');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const user = await User.findOne({ 'sessions.sessionId': sessionId });
    if (!user) {
      clearRefreshTokenCookie(res);
      res.status(401).json({ success: false, error: 'Session expired or invalidated.' });
      return;
    }

    const session = user.sessions?.find((s) => s.sessionId === sessionId);
    if (!session || session.refreshTokenHash !== tokenHash || new Date() > session.expiresAt) {
      // Token reuse / expiry detection: revoke session
      user.sessions = user.sessions?.filter((s) => s.sessionId !== sessionId) as any;
      await user.save();
      clearRefreshTokenCookie(res);
      res.status(401).json({ success: false, error: 'Invalid refresh token.' });
      return;
    }

    // Check user active
    if (user.active === false || user.status !== 'ACTIVE') {
      clearRefreshTokenCookie(res);
      res.status(403).json({ success: false, error: 'Account inactive.' });
      return;
    }

    // Rotate refresh token
    const newRawRefreshToken = crypto.randomBytes(40).toString('hex');
    session.refreshTokenHash = crypto.createHash('sha256').update(newRawRefreshToken).digest('hex');
    session.lastActiveAt = new Date();
    await user.save();

    setRefreshTokenCookie(res, `${sessionId}:${newRawRefreshToken}`);

    const newToken = generateToken({
      id: user._id.toString(),
      role: user.role,
      storeId: user.storeId?.toString(),
      organizationId: user.organizationId?.toString(),
      name: user.name,
      phone: user.phone,
    });

    res.json({
      success: true,
      token: newToken,
      refreshToken: `${sessionId}:${newRawRefreshToken}`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------------------------------------------
// 5. Logout & Revoke Session
// -------------------------------------------------------------
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const rawCookie = req.cookies?.tusk_refresh_token;
    if (rawCookie && rawCookie.includes(':')) {
      const [sessionId] = rawCookie.split(':');
      await User.updateOne(
        { 'sessions.sessionId': sessionId },
        { $pull: { sessions: { sessionId } } }
      );
    }
    clearRefreshTokenCookie(res);
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------------------------------------------
// 6. Sign Out Everywhere (Revoke All Sessions)
// -------------------------------------------------------------
router.post('/logout-all', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await User.updateOne({ _id: req.user?.id }, { $set: { sessions: [] } });
    clearRefreshTokenCookie(res);
    res.json({ success: true, message: 'Signed out of all devices successfully.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------------------------------------------
// 7. Password Reset with Phone OTP (/auth/forgot-password & /auth/reset-password)
// -------------------------------------------------------------
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { phone, otp, newPassword } = req.body;
    if (!phone || !otp || !newPassword) {
      res.status(400).json({ success: false, error: 'Phone, OTP, and new password are required.' });
      return;
    }

    const pwCheck = validatePasswordStrength(newPassword);
    if (!pwCheck.valid) {
      res.status(400).json({ success: false, error: pwCheck.error });
      return;
    }

    const otpRecord = await PhoneOtp.findOne({ phone: phone.trim(), purpose: 'FORGOT_PASSWORD' });
    if (!otpRecord) {
      res.status(400).json({ success: false, error: 'OTP expired or not found. Please request a new one.' });
      return;
    }

    if (new Date() > otpRecord.expiresAt) {
      await PhoneOtp.deleteOne({ _id: otpRecord._id });
      res.status(400).json({ success: false, error: 'OTP has expired.' });
      return;
    }

    const match = await bcrypt.compare(otp.trim(), otpRecord.codeHash);
    if (!match) {
      res.status(400).json({ success: false, error: 'Invalid OTP code.' });
      return;
    }

    await PhoneOtp.deleteOne({ _id: otpRecord._id });

    const user = await User.findOne({ phone: phone.trim() });
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found.' });
      return;
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.sessions = []; // Revoke all sessions on password change
    user.mustChangePassword = false;
    user.lastPasswordChangeAt = new Date();
    await user.save();

    await AuditLog.create({
      actorId: user._id,
      actorRole: user.role,
      actorName: user.name,
      action: 'PASSWORD_RESET_SUCCESS',
      entityType: 'USER',
      entityId: user._id.toString(),
      reason: 'Password reset completed via verified phone OTP',
    });

    clearRefreshTokenCookie(res);
    res.json({ success: true, message: 'Password reset successfully. Please sign in with your new password.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------------------------------------------
// 8. Trimmed /me profile endpoint
// -------------------------------------------------------------
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user?.id);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const portalConfig = getRolePortalConfig(user.role);

    // Return trimmed, explicit shape without internal passwordHash or tokens
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        storeId: user.storeId,
        organizationId: user.organizationId,
        tripsCompleted: user.tripsCompleted,
        cleanTrips: user.cleanTrips,
        mfaEnabled: user.mfaEnabled || false,
        mustChangePassword: user.mustChangePassword || false,
        active: user.active ?? true,
        permissions: req.user?.permissions || [],
      },
      ...portalConfig,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------------------------------------------
// 9. Google Sign-In / Registration for Customers
// -------------------------------------------------------------
router.post('/google', async (req: Request, res: Response) => {
  try {
    const mobileClient = req.get('X-Client') === 'mobile' || req.body?.isMobile;
    const { credential, email, name, googleId, avatarUrl, phone } = req.body;

    let cleanEmail: string | undefined;
    let cleanGoogleId: string | undefined;
    let cleanName: string | undefined;
    let cleanAvatarUrl: string | undefined;

    if (ENV.GOOGLE_CLIENT_ID) {
      // Secure path: verify the Google ID token server-side. The client sends
      // `credential` (the JWT from Google Sign-In); we never trust profile
      // fields sent directly by the client.
      if (!credential || typeof credential !== 'string') {
        res.status(400).json({ success: false, error: 'Google credential is required.' });
        return;
      }
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: ENV.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email) {
        res.status(401).json({ success: false, error: 'Invalid Google token.' });
        return;
      }
      if (payload.email_verified === false) {
        res.status(401).json({ success: false, error: 'Google account email is not verified.' });
        return;
      }
      cleanGoogleId = payload.sub;
      cleanEmail = payload.email.toLowerCase();
      cleanName = payload.name;
      cleanAvatarUrl = payload.picture;
    } else {
      // Demo fallback: GOOGLE_CLIENT_ID not configured, so accept profile fields
      // directly. INSECURE — anyone can impersonate any email. Set
      // GOOGLE_CLIENT_ID to enforce real token verification.
      console.warn('[Auth] GOOGLE_CLIENT_ID not set — /auth/google accepting unverified profile claims.');
      if (!email && !googleId) {
        res.status(400).json({ success: false, error: 'Email or Google ID is required.' });
        return;
      }
      cleanEmail = email ? String(email).trim().toLowerCase() : undefined;
      cleanGoogleId = googleId ? String(googleId).trim() : undefined;
      cleanName = name ? String(name).trim() : undefined;
      cleanAvatarUrl = avatarUrl ? String(avatarUrl) : undefined;
    }

    // Find existing user by googleId or email
    let user = null;
    if (cleanGoogleId) {
      user = await User.findOne({ googleId: cleanGoogleId });
    }
    if (!user && cleanEmail) {
      user = await User.findOne({ email: cleanEmail });
    }

    if (!user) {
      // Check if public registration is enabled
      const settings = await getSettings();
      if (settings && settings.allowPublicRegistration === false) {
        res.status(403).json({ success: false, error: 'Public customer registration is currently disabled.' });
        return;
      }

      // Generate a unique fallback phone if not provided
      let userPhone = phone ? String(phone).trim() : '';
      if (!userPhone) {
        const idSuffix = cleanGoogleId ? cleanGoogleId.replace(/\D/g, '').slice(-8) : Math.floor(10000000 + Math.random() * 90000000).toString();
        userPhone = `+254G${idSuffix.padEnd(8, '0')}`;
        let clash = await User.findOne({ phone: userPhone });
        while (clash) {
          userPhone = `+254G${Math.floor(10000000 + Math.random() * 90000000)}`;
          clash = await User.findOne({ phone: userPhone });
        }
      }

      const randomPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 12);

      user = await User.create({
        name: cleanName || cleanEmail?.split('@')[0] || 'Google User',
        email: cleanEmail,
        googleId: cleanGoogleId,
        avatarUrl: cleanAvatarUrl,
        phone: userPhone,
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        active: true,
        tripsCompleted: 0,
        cleanTrips: 0,
        sessions: [],
      });

      await AuditLog.create({
        actorId: user._id,
        actorRole: user.role,
        actorName: user.name,
        action: 'CUSTOMER_REGISTER',
        entityType: 'USER',
        entityId: user._id.toString(),
        reason: 'Customer Google Sign-In registration',
      });
    } else {
      if (cleanGoogleId && !user.googleId) user.googleId = cleanGoogleId;
      if (cleanAvatarUrl && !user.avatarUrl) user.avatarUrl = cleanAvatarUrl;
      if (cleanEmail && !user.email) user.email = cleanEmail;
      await user.save();
    }

    if (user.active === false || user.status === 'DEACTIVATED') {
      res.status(403).json({ success: false, error: 'Your account has been deactivated. Please contact support.' });
      return;
    }
    if (user.status === 'SUSPENDED') {
      res.status(403).json({ success: false, error: 'Your account has been suspended.' });
      return;
    }

    const sessionId = crypto.randomUUID();
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    const currentSessions = (user.sessions || []).slice(-9);
    currentSessions.push({
      sessionId,
      refreshTokenHash,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    });

    user.sessions = currentSessions as any;
    user.lastLoginAt = new Date();
    user.failedLoginAttempts = 0;
    user.lockoutUntil = undefined;
    await user.save();

    setRefreshTokenCookie(res, `${sessionId}:${rawRefreshToken}`);

    const token = generateToken({
      id: user._id.toString(),
      role: user.role,
      storeId: user.storeId?.toString(),
      organizationId: user.organizationId?.toString(),
      name: user.name,
      phone: user.phone,
    });

    const portalConfig = getRolePortalConfig(user.role);

    await AuditLog.create({
      actorId: user._id,
      actorRole: user.role,
      actorName: user.name,
      action: 'LOGIN_SUCCESS',
      entityType: 'USER',
      entityId: user._id.toString(),
      reason: 'Google Sign-In success',
    });

    res.status(200).json({
      success: true,
      token,
      refreshToken: `${sessionId}:${rawRefreshToken}`,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role,
        tripsCompleted: user.tripsCompleted,
        cleanTrips: user.cleanTrips,
        permissions: effectivePermissionsFor(user),
      },
      ...portalConfig,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/demo-switch', async (req: Request, res: Response) => {
  try {
    const { role } = req.body;
    if (!role) {
      res.status(400).json({ success: false, error: 'Role is required.' });
      return;
    }
    let user = await User.findOne({ role }).sort({ createdAt: 1 });
    if (!user && role === 'STOCK_MANAGER') {
      user = await User.findOne({ role: 'STOCK_CONTROLLER' }).sort({ createdAt: 1 });
    }
    if (!user) {
      res.status(404).json({ success: false, error: `No demo account found for role: ${role}` });
      return;
    }
    const token = generateToken({
      id: user._id.toString(),
      role: user.role,
      storeId: user.storeId?.toString(),
      organizationId: user.organizationId?.toString(),
      name: user.name,
      phone: user.phone,
    });
    const portalConfig = getRolePortalConfig(user.role);
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        storeId: user.storeId,
        organizationId: user.organizationId,
      },
      ...portalConfig,
      permissions: effectivePermissionsFor(user),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;