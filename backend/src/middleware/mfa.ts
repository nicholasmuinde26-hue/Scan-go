import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { requiresMFA, actionRequiresMFA } from '../modules/mfa/mfa.service.js';
import User from '../modules/users/user.model.js';
import speakeasy from 'speakeasy';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/environment.js';

/**
 * Middleware to enforce MFA for specific roles
 */
export async function requireMFA(req: AuthRequest, res: Response, next: NextFunction) {
  if (!requiresMFA(req.user!.role)) {
    return next();
  }

  // Check if user has MFA enabled
  try {
    const user = await User.findById(req.user!.id).select('mfaEnabled mfaSecret mfaBackupCodes');
    if (!user || !user.mfaEnabled) {
      return res.status(403).json({
        success: false,
        error: 'MFA is required for your role. Please enable MFA to continue.',
        mfaRequired: true,
      });
    }

    // Check if MFA token was provided in headers
    const mfaToken = req.headers['x-mfa-token'] as string;
    if (!mfaToken) {
      return res.status(403).json({
        success: false,
        error: 'MFA token is required for this action',
        mfaRequired: true,
      });
    }

    if (!user.mfaSecret) {
      return res.status(403).json({
        success: false,
        error: 'MFA secret not found',
      });
    }

    // Check backup codes first
    if (user.mfaBackupCodes && user.mfaBackupCodes.includes(mfaToken.toUpperCase())) {
      // Remove the used backup code
      user.mfaBackupCodes = user.mfaBackupCodes.filter(
        (code: string) => code !== mfaToken.toUpperCase()
      );
      await user.save();
      return next();
    }

    // Verify TOTP token
    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: mfaToken,
      window: 2,
    });

    if (!verified) {
      return res.status(403).json({
        success: false,
        error: 'Invalid MFA token',
      });
    }

    next();
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Middleware to require re-authentication for sensitive actions
 */
export async function requireReAuthentication(req: AuthRequest, res: Response, next: NextFunction) {
  const reAuthHeader = req.headers['x-re-auth-token'] as string;

  if (!reAuthHeader) {
    return res.status(403).json({
      success: false,
      error: 'Re-authentication is required for this sensitive action',
      reAuthRequired: true,
    });
  }

  try {
    const user = await User.findById(req.user!.id).select('+passwordHash lastPasswordChangeAt');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const isValid = await bcrypt.compare(reAuthHeader, user.passwordHash);
    if (!isValid) {
      return res.status(403).json({
        success: false,
        error: 'Invalid password',
      });
    }

    // Update last password verification time
    user.lastPasswordChangeAt = new Date();
    await user.save();

    next();
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * Middleware to require MFA for sensitive actions
 * Checks if the action requires MFA based on the permission being used
 */
export function requireMFAForSensitiveAction(...sensitivePermissions: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // Check if any of the user's permissions match sensitive actions
    const hasSensitivePermission = req.user!.permissions.some((perm) =>
      sensitivePermissions.some((sensitive) => perm.includes(sensitive))
    );

    if (!hasSensitivePermission) {
      return next();
    }

    // Apply MFA requirement
    return requireMFA(req, res, next);
  };
}

/**
 * Middleware to enforce short session timeout for platform roles
 */
export function enforceShortSession(req: AuthRequest, res: Response, next: NextFunction) {
  const platformRoles = ['PLATFORM_OWNER', 'PLATFORM_ADMIN', 'FINANCE_ADMIN', 'FINANCE_APPROVER'];
  if (!platformRoles.includes(req.user!.role)) {
    return next();
  }

  // Check token issuance time (from JWT decode)
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as any;
    const tokenAge = Date.now() - decoded.iat * 1000;
    const maxAge = 15 * 60 * 1000; // 15 minutes in production

    if (tokenAge > maxAge) {
      return res.status(401).json({
        success: false,
        error: 'Session expired. Please re-authenticate.',
        reAuthRequired: true,
      });
    }

    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
}
