export type SuperAdminSection =
  | 'OVERVIEW'
  | 'ORGANIZATIONS'
  | 'STORES'
  | 'USERS_ROLES'
  | 'SUPPORT_DESK'
  | 'FINANCE'
  | 'RISK_FRAUD'
  | 'COMPLIANCE_AUDIT'
  | 'PLATFORM_CONFIG'
  | 'APPROVALS_INBOX'
  | 'ENGINEERING';

export interface OverviewKPIs {
  totalOrders: number;
  todayOrders: number;
  gmvMinor: number;
  gmvKes: number;
  activeStores: number;
  totalStores: number;
  failedPayments: number;
  todayFailedPayments: number;
  exitMismatches: number;
  todayExitMismatches: number;
}

export interface QueueDepth {
  pendingOrders: number;
  pendingPicking: number;
  pendingExits: number;
  pendingApprovals: number;
}

export interface PlatformAlert {
  id: string;
  type: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  message: string;
  timestamp: string | Date;
}

export interface SystemHealth {
  dbStatus: string;
  uptimeSeconds: number;
  memoryRssMb: number;
  memoryHeapMb: number;
  nodeVersion: string;
  timestamp: string;
}

export interface SupportTicketItem {
  _id: string;
  ticketNumber: string;
  customerPhone: string;
  customerName?: string;
  subject: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  tier: 'TIER_1' | 'TIER_2';
  assignedTo?: string;
  assignedAgentName?: string;
  slaExpiresAt: string;
  slaBreached?: boolean;
  messages: Array<{
    sender: string;
    senderRole: string;
    message: string;
    isInternal: boolean;
    createdAt: string;
  }>;
  createdAt: string;
}

export interface FraudCaseItem {
  _id: string;
  caseNumber: string;
  title: string;
  storeId?: { _id: string; name: string; code: string };
  organizationId?: { _id: string; name: string };
  customerPhone?: string;
  customerName?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'INVESTIGATING' | 'CONFIRMED_THEFT' | 'CLEARED' | 'POLICE_REPORTED';
  incidentDate: string;
  evidenceSummary: string;
  evidenceNotes: string[];
  investigatorName?: string;
  actionTaken?: string;
  totalLossPreventedMinor?: number;
  createdAt: string;
}

export interface BlocklistEntryItem {
  _id: string;
  identifier: string;
  type: 'PHONE' | 'NATIONAL_ID' | 'DEVICE_ID';
  name?: string;
  reason: string;
  riskScore: number;
  addedByName: string;
  active: boolean;
  createdAt: string;
}

export interface RetentionRequestItem {
  _id: string;
  customerPhone: string;
  customerName?: string;
  requestType: 'FORGET_ME' | 'DATA_EXPORT' | 'CONSENT_REVOCATION';
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  reason?: string;
  reviewedByName?: string;
  processedAt?: string;
  notes?: string;
  createdAt: string;
}

export interface ApiKeyItem {
  _id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  rateLimitPerMin: number;
  active: boolean;
  lastUsedAt?: string;
  createdByName?: string;
  createdAt: string;
}

export interface WebhookLogItem {
  _id: string;
  endpoint: string;
  method: string;
  provider: 'MPESA_STK' | 'MPESA_C2B' | 'ERP' | 'SYSTEM';
  statusCode: number;
  latencyMs: number;
  payload: Record<string, any>;
  errorMessage?: string;
  createdAt: string;
}

export interface ApprovalItem {
  _id: string;
  type: string;
  targetType: string;
  targetId: string;
  requestData: Record<string, any>;
  requestedBy: {
    _id: string;
    name: string;
    phone: string;
    role: string;
  };
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  expiresAt: string;
  notes?: string;
  createdAt: string;
}
