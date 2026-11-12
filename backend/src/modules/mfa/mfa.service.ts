import User from '../users/user.model.js';
import { AuthRequest } from '../../middleware/auth.js';
import speakeasy from 'speakeasy';
import bcrypt from 'bcryptjs';

/**
 * Generate MFA secret for a user
 */
export async function generateMFASecret(req: AuthRequest) {
  const user = await User.findById(req.user!.id);
  if (!user) {
    throw new Error('User not found');
  }

  // Generate a new secret
  const secret = speakeasy.generateSecret({
    name: `ScanAndGo (${user.phone})`,
    issuer: 'ScanAndGo',
  });

  // Store the secret temporarily (not enabled yet)
  user.mfaSecret = secret.base32;
  await user.save();

  return {
    secret: secret.base32,
    otpauth_url: secret.otpauth_url,
    message: 'Scan the QR code with your authenticator app, then verify to enable MFA',
  };
}

/**
 * Enable MFA for a user (after verification)
 */
export async function enableMFA(req: AuthRequest, token: string) {
  const user = await User.findById(req.user!.id);
  if (!user) {
    throw new Error('User not found');
  }

  if (!user.mfaSecret) {
    throw new Error('MFA secret not generated. Please generate a secret first.');
  }

  // Verify the token
  const verified = speakeasy.totp.verify({
    secret: user.mfaSecret!,
    encoding: 'base32',
    token,
  });

  if (!verified) {
    throw new Error('Invalid token. Please try again.');
  }

  // Generate backup codes
  const backupCodes = Array.from({ length: 10 }, () =>
    speakeasy.generateSecret().base32.slice(0, 8).toUpperCase()
  );

  // Enable MFA
  user.mfaEnabled = true;
  user.mfaBackupCodes = backupCodes;
  await user.save();

  return {
    success: true,
    message: 'MFA enabled successfully',
    backupCodes,
  };
}

/**
 * Disable MFA for a user
 */
export async function disableMFA(req: AuthRequest, token: string) {
  const user = await User.findById(req.user!.id);
  if (!user) {
    throw new Error('User not found');
  }

  if (!user.mfaEnabled) {
    throw new Error('MFA is not enabled');
  }

  // Verify the token before disabling
  const verified = speakeasy.totp.verify({
    secret: user.mfaSecret!,
    encoding: 'base32',
    token,
  });

  if (!verified) {
    throw new Error('Invalid token. Please try again.');
  }

  // Disable MFA
  user.mfaEnabled = false;
  user.mfaSecret = undefined;
  user.mfaBackupCodes = [];
  await user.save();

  return {
    success: true,
    message: 'MFA disabled successfully',
  };
}

/**
 * Verify MFA token
 */
export async function verifyMFAToken(req: AuthRequest, token: string): Promise<boolean> {
  const user = await User.findById(req.user!.id);
  if (!user) {
    throw new Error('User not found');
  }

  if (!user.mfaEnabled) {
    throw new Error('MFA is not enabled for this user');
  }

  // Check backup codes first
  if (user.mfaBackupCodes && user.mfaBackupCodes.includes(token.toUpperCase())) {
    // Remove the used backup code
    user.mfaBackupCodes = user.mfaBackupCodes.filter((code) => code !== token.toUpperCase());
    await user.save();
    return true;
  }

  // Verify TOTP token
  const verified = speakeasy.totp.verify({
    secret: user.mfaSecret!,
    encoding: 'base32',
    token,
    window: 2, // Allow 2 time steps (1 minute) of drift
  });

  return verified;
}

/**
 * Check if user requires MFA
 */
export function requiresMFA(role: string): boolean {
  const mfaRequiredRoles = [
    'PLATFORM_OWNER',
    'PLATFORM_ADMIN',
    'FINANCE_ADMIN',
    'FINANCE_APPROVER',
    'ORG_OWNER',
    'ORG_ADMIN',
  ];
  return mfaRequiredRoles.includes(role);
}

/**
 * Check if an action requires MFA verification
 */
export function actionRequiresMFA(action: string): boolean {
  const sensitiveActions = [
    'payouts:approve',
    'payouts:request',
    'platform:orgs:suspend',
    'platform:admins:create',
    'platform:admins:approve',
    'org:users:manage',
    'staff:terminate',
    'wallet:write',
    'finance:export',
    'reports:export:sensitive',
  ];
  return sensitiveActions.some((sensitive) => action.includes(sensitive));
}

/**
 * Re-authenticate user (verify password)
 */
export async function reAuthenticate(req: AuthRequest, password: string): Promise<boolean> {
  const user = await User.findById(req.user!.id).select('+passwordHash');
  if (!user) {
    throw new Error('User not found');
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    throw new Error('Invalid password');
  }

  // Update last password verification time
  user.lastPasswordChangeAt = new Date();
  await user.save();

  return true;
}
