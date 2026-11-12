import User from '../users/user.model.js';
import AuditLog from '../audits/audit.model.js';
import { AuthRequest } from '../../middleware/auth.js';

export interface ActAsRequest {
  targetOrganizationId: string;
  targetStoreId?: string;
  reason: string;
  durationHours?: number; // Default: 4 hours, max: 24 hours
}

/**
 * Request time-limited "act as" access to an organization/store
 * Only available to SUPPORT_LEAD_TIER2 and above
 */
export async function requestActAs(req: AuthRequest, actAsData: ActAsRequest) {
  const { targetOrganizationId, targetStoreId, reason, durationHours = 4 } = actAsData;

  // Validate duration (max 24 hours)
  const duration = Math.min(durationHours, 24);
  const expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000);

  // Get the user
  const user = await User.findById(req.user!.id);
  if (!user) {
    throw new Error('User not found');
  }

  // Check if user has permission to act as
  const canActAs = ['SUPPORT_LEAD_TIER2', 'PLATFORM_OWNER', 'PLATFORM_ADMIN'].includes(req.user!.role);
  if (!canActAs) {
    throw new Error('Insufficient permissions to request act-as access');
  }

  // Create the act-as session
  const actAsSession: any = {
    targetOrganizationId,
    targetStoreId,
    reason,
    expiresAt,
    createdAt: new Date(),
  };

  // Add to user's actAsSessions
  if (!user.actAsSessions) {
    user.actAsSessions = [];
  }
  user.actAsSessions.push(actAsSession);

  // Set the active acting-as context
  user.actingAsOrganizationId = targetOrganizationId as any;
  if (targetStoreId) {
    user.actingAsStoreId = targetStoreId as any;
  }

  await user.save();

  // Log the act-as request
  await AuditLog.create({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    actorName: req.user!.name,
    action: 'ACT_AS_REQUEST',
    entityType: 'ORGANIZATION',
    entityId: targetOrganizationId,
    details: {
      targetStoreId,
      reason,
      expiresAt,
      duration,
    },
  });

  return {
    actAsSession,
    user: {
      id: user._id,
      name: user.name,
      role: user.role,
      actingAsOrganizationId: user.actingAsOrganizationId,
      actingAsStoreId: user.actingAsStoreId,
    },
  };
}

/**
 * End an active act-as session
 */
export async function endActAs(req: AuthRequest, sessionId?: string) {
  const user = await User.findById(req.user!.id);
  if (!user) {
    throw new Error('User not found');
  }

  let endedSession: any = null;

  if (sessionId) {
    // End a specific session
    const sessionIndex = user.actAsSessions?.findIndex(
      (s: any) => s._id?.toString() === sessionId
    );

    if (sessionIndex === -1 || sessionIndex === undefined || !user.actAsSessions) {
      throw new Error('Act-as session not found');
    }

    endedSession = user.actAsSessions[sessionIndex];
    user.actAsSessions.splice(sessionIndex, 1);
  } else {
    // End the current active session
    if (user.actingAsOrganizationId) {
      const activeSession = user.actAsSessions?.find(
        (s: any) =>
          s.targetOrganizationId.toString() === user.actingAsOrganizationId?.toString() &&
          (!user.actingAsStoreId || s.targetStoreId?.toString() === user.actingAsStoreId?.toString())
      );

      if (activeSession) {
        endedSession = activeSession;
        // Remove the session
        user.actAsSessions = user.actAsSessions?.filter(
          (s: any) => s !== activeSession
        );
      }
    }

    // Clear the acting-as context
    user.actingAsOrganizationId = undefined;
    user.actingAsStoreId = undefined;
  }

  await user.save();

  // Log the end of act-as
  if (endedSession) {
    await AuditLog.create({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      actorName: req.user!.name,
      action: 'ACT_AS_END',
      entityType: 'ORGANIZATION',
      entityId: endedSession.targetOrganizationId,
      details: {
        targetStoreId: endedSession.targetStoreId,
        reason: endedSession.reason,
        duration: endedSession.expiresAt
          ? Math.round((new Date(endedSession.expiresAt).getTime() - endedSession.createdAt.getTime()) / (1000 * 60 * 60))
          : 0,
      },
    });
  }

  return {
    message: 'Act-as session ended',
    user: {
      id: user._id,
      name: user.name,
      role: user.role,
      actingAsOrganizationId: user.actingAsOrganizationId,
      actingAsStoreId: user.actingAsStoreId,
    },
  };
}

/**
 * Get current active act-as session
 */
export async function getActiveActAs(req: AuthRequest) {
  const user = await User.findById(req.user!.id);
  if (!user) {
    throw new Error('User not found');
  }

  // Clean up expired sessions
  if (user.actAsSessions) {
    const now = new Date();
    user.actAsSessions = user.actAsSessions.filter((s: any) => new Date(s.expiresAt) > now);

    // If the current acting-as context is expired, clear it
    if (user.actingAsOrganizationId) {
      const activeSession = user.actAsSessions?.find(
        (s: any) =>
          s.targetOrganizationId.toString() === user.actingAsOrganizationId?.toString() &&
          (!user.actingAsStoreId || s.targetStoreId?.toString() === user.actingAsStoreId?.toString())
      );

      if (!activeSession) {
        user.actingAsOrganizationId = undefined;
        user.actingAsStoreId = undefined;
      }
    }

    await user.save();
  }

  return {
    actingAsOrganizationId: user.actingAsOrganizationId,
    actingAsStoreId: user.actingAsStoreId,
    actAsSessions: user.actAsSessions || [],
  };
}

/**
 * Get all act-as sessions for the current user
 */
export async function getMyActAsSessions(req: AuthRequest) {
  const user = await User.findById(req.user!.id);
  if (!user) {
    throw new Error('User not found');
  }

  // Clean up expired sessions
  if (user.actAsSessions) {
    const now = new Date();
    user.actAsSessions = user.actAsSessions.filter((s: any) => new Date(s.expiresAt) > now);
    await user.save();
  }

  return user.actAsSessions || [];
}

/**
 * Get act-as sessions for a specific organization (for org admins to see who's acting as them)
 */
export async function getOrgActAsSessions(req: AuthRequest, organizationId: string) {
  // Only org admins and platform roles can see this
  const canView = ['ORG_OWNER', 'ORG_ADMIN', 'PLATFORM_OWNER', 'PLATFORM_ADMIN', 'SUPPORT_LEAD_TIER2'].includes(req.user!.role);
  if (!canView) {
    throw new Error('Insufficient permissions to view organization act-as sessions');
  }

  // Check if user belongs to the org (for org roles)
  if (['ORG_OWNER', 'ORG_ADMIN'].includes(req.user!.role) && req.user!.organizationId !== organizationId) {
    throw new Error('You can only view act-as sessions for your own organization');
  }

  const sessions = await User.find({
    'actAsSessions.targetOrganizationId': organizationId,
  }).select('name role actAsSessions');

  // Filter to only sessions for this org and clean up expired
  const now = new Date();
  const filteredSessions = sessions
    .map((u: any) => ({
      userName: u.name,
      userRole: u.role,
      sessions: u.actAsSessions.filter(
        (s: any) =>
          s.targetOrganizationId.toString() === organizationId && new Date(s.expiresAt) > now
      ),
    }))
    .filter((u: any) => u.sessions.length > 0);

  return filteredSessions;
}
