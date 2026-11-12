import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import {
  maskPhoneNumber,
  maskEmail,
  maskName,
  maskObject,
  shouldMaskByDefault,
  logDataReveal,
} from '../shared/utils/dataMasking.js';

/**
 * Middleware to automatically mask sensitive fields in responses
 * for roles that require data masking by default (e.g., support agents)
 */
export function applyDataMasking(req: AuthRequest, res: Response, next: NextFunction) {
  // Skip masking if the role doesn't require it
  if (!shouldMaskByDefault(req.user!.role)) {
    return next();
  }

  // Store the original json method
  const originalJson = res.json.bind(res);

  // Override the json method to mask data before sending
  res.json = function (data: any) {
    if (data && typeof data === 'object') {
      // Mask sensitive fields in the response
      const maskedData = maskSensitiveFields(data, req);
      return originalJson(maskedData);
    }
    return originalJson(data);
  };

  next();
}

/**
 * Mask sensitive fields in response data
 */
function maskSensitiveFields(data: any, req: AuthRequest): any {
  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveFields(item, req));
  }

  if (data && typeof data === 'object') {
    const masked = { ...data };

    // Mask phone numbers
    if (masked.phone) {
      masked.phone = maskPhoneNumber(masked.phone);
    }
    if (masked.phoneNumber) {
      masked.phoneNumber = maskPhoneNumber(masked.phoneNumber);
    }

    // Mask emails
    if (masked.email) {
      masked.email = maskEmail(masked.email);
    }

    // Mask names (optional - less aggressive)
    // if (masked.name) {
    //   masked.name = maskName(masked.name);
    // }

    // Recursively mask nested objects
    for (const key in masked) {
      if (typeof masked[key] === 'object' && masked[key] !== null) {
        masked[key] = maskSensitiveFields(masked[key], req);
      }
    }

    return masked;
  }

  return data;
}

/**
 * Middleware to handle explicit data reveal requests
 * Logs the reveal and returns unmasked data
 */
export function revealSensitiveData(req: AuthRequest, res: Response, next: NextFunction) {
  const { reveal } = req.query;

  if (reveal === 'true') {
    // Log the reveal event
    logDataReveal({
      userId: req.user!.id,
      userRole: req.user!.role,
      revealedField: 'all',
      entityId: req.params.id || req.body.id || 'unknown',
      entityType: req.path.split('/')[1] || 'unknown',
      revealedAt: new Date(),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Continue without masking
    return next();
  }

  // Apply masking
  return applyDataMasking(req, res, next);
}

/**
 * Middleware to check if user has permission to reveal data
 */
export function requireRevealPermission(req: AuthRequest, res: Response, next: NextFunction) {
  const { canReveal } = req.query;

  if (canReveal === 'true') {
    // Check if user has permission to reveal
    const hasPermission = [
      'PLATFORM_OWNER',
      'PLATFORM_ADMIN',
      'SUPPORT_LEAD_TIER2',
      'ORG_OWNER',
      'ORG_ADMIN',
      'COMPLIANCE_AUDITOR',
    ].includes(req.user!.role);

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions to reveal sensitive data',
      });
    }

    // Log the reveal
    logDataReveal({
      userId: req.user!.id,
      userRole: req.user!.role,
      revealedField: 'all',
      entityId: req.params.id || req.body.id || 'unknown',
      entityType: req.path.split('/')[1] || 'unknown',
      revealedAt: new Date(),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  next();
}
