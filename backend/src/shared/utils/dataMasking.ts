/**
 * Data masking utilities for sensitive fields (phone numbers, PII, etc.)
 * Support roles see masked data by default and must explicitly reveal
 */

/**
 * Mask a phone number (e.g., +254712345678 -> +2547******78)
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 4) {
    return phone;
  }

  // Keep first 4 and last 2 characters
  const visibleStart = phone.slice(0, 4);
  const visibleEnd = phone.slice(-2);
  const maskedLength = Math.max(phone.length - 6, 3);

  return `${visibleStart}${'*'.repeat(maskedLength)}${visibleEnd}`;
}

/**
 * Mask an email address (e.g., john@example.com -> j***@example.com)
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) {
    return email;
  }

  const [localPart, domain] = email.split('@');
  if (localPart.length <= 1) {
    return email;
  }

  const maskedLocal = localPart[0] + '*'.repeat(Math.min(localPart.length - 1, 3));
  return `${maskedLocal}@${domain}`;
}

/**
 * Mask a name (e.g., John Doe -> J*** D**)
 */
export function maskName(name: string): string {
  if (!name) {
    return name;
  }

  return name
    .split(' ')
    .map((part) => {
      if (part.length <= 1) {
        return part;
      }
      return part[0] + '*'.repeat(part.length - 1);
    })
    .join(' ');
}

/**
 * Mask an ID/identifier (e.g., 12345678 -> 1234****)
 */
export function maskId(id: string, visibleChars: number = 4): string {
  if (!id || id.length <= visibleChars) {
    return id;
  }

  return id.slice(0, visibleChars) + '*'.repeat(id.length - visibleChars);
}

/**
 * Generic object masking - recursively masks specified fields
 */
export function maskObject<T extends Record<string, any>>(
  obj: T,
  fieldsToMask: (keyof T)[],
  maskFn: (value: any) => string = maskPhoneNumber
): T {
  const masked = { ...obj };

  for (const field of fieldsToMask) {
    if (masked[field] && typeof masked[field] === 'string') {
      (masked as any)[field] = maskFn(masked[field]);
    }
  }

  return masked;
}

/**
 * Mask an array of objects
 */
export function maskArray<T extends Record<string, any>>(
  arr: T[],
  fieldsToMask: (keyof T)[],
  maskFn?: (value: any) => string
): T[] {
  return arr.map((item) => maskObject(item, fieldsToMask, maskFn));
}

/**
 * Data reveal tracking interface
 */
export interface DataRevealLog {
  userId: string;
  userRole: string;
  revealedField: string;
  entityId: string;
  entityType: string;
  revealedAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * In-memory store for reveal logs (in production, use a database)
 */
const revealLogs: DataRevealLog[] = [];

/**
 * Log a data reveal event
 */
export function logDataReveal(log: DataRevealLog): void {
  revealLogs.push(log);

  // In production, save to database
  // await DataReveal.create(log);

  // Keep only last 1000 logs in memory
  if (revealLogs.length > 1000) {
    revealLogs.shift();
  }
}

/**
 * Get reveal logs for a user (for auditing)
 */
export function getRevealLogsForUser(userId: string, limit: number = 100): DataRevealLog[] {
  return revealLogs
    .filter((log) => log.userId === userId)
    .sort((a, b) => b.revealedAt.getTime() - a.revealedAt.getTime())
    .slice(0, limit);
}

/**
 * Get all reveal logs (for admins)
 */
export function getAllRevealLogs(limit: number = 500): DataRevealLog[] {
  return revealLogs
    .sort((a, b) => b.revealedAt.getTime() - a.revealedAt.getTime())
    .slice(0, limit);
}

/**
 * Check if user has permission to reveal data
 */
export function canRevealData(userRole: string): boolean {
  const rolesWithRevealAccess = [
    'PLATFORM_OWNER',
    'PLATFORM_ADMIN',
    'SUPPORT_LEAD_TIER2',
    'ORG_OWNER',
    'ORG_ADMIN',
    'COMPLIANCE_AUDITOR',
  ];
  return rolesWithRevealAccess.includes(userRole);
}

/**
 * Check if data should be masked by default for a role
 */
export function shouldMaskByDefault(userRole: string): boolean {
  const supportRoles = ['SUPPORT_AGENT_TIER1', 'SUPPORT_LEAD_TIER2'];
  return supportRoles.includes(userRole);
}
