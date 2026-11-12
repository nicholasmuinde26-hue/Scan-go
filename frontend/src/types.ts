export type UserRole =
  | 'CUSTOMER'
  | 'PICKER'
  | 'PACKER_VERIFIER'
  | 'EXIT_STAFF'
  | 'EXIT_OFFICER'
  | 'SUPERVISOR'
  | 'STORE_MANAGER'
  | 'BRANCH_MANAGER'
  | 'ORG_ADMIN'
  | 'ORG_OWNER'
  | 'STOCK_CONTROLLER'
  | 'CATALOGUE_INVENTORY_MANAGER'
  | 'CASHIER_CUSTOMER_SERVICE'
  | 'DELIVERY_COLLECTION_HANDOVER'
  | 'LOSS_PREVENTION_MANAGER'
  | 'ORG_AUDITOR'
  | 'FINANCE_OFFICER'
  | 'MARKETING_MANAGER'
  | 'PLATFORM_OWNER'
  | 'PLATFORM_ADMIN'
  | 'FINANCE_ADMIN'
  | 'FINANCE_APPROVER'
  | 'SUPPORT_AGENT_TIER1'
  | 'SUPPORT_LEAD_TIER2'
  | 'RISK_FRAUD_ANALYST'
  | 'COMPLIANCE_AUDITOR'
  | 'PLATFORM_ENGINEER'
  | 'CUSTOMER_SUCCESS'
  | 'SYSTEM_ADMIN';

export type RiskBand = 'GREEN' | 'AMBER' | 'AMBER_FULL' | 'RED';

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: UserRole;
  storeId?: string;
  organizationId?: string;
  tripsCompleted?: number;
  cleanTrips?: number;
  confirmedDiscrepancies?: number;
  /** Effective permissions from the server (role + overrides). Drives which tabs and actions are shown. */
  permissions?: string[];
}

export interface Organization {
  _id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED';
  contactEmail?: string;
  contactPhone?: string;
  maxStores: number;
  features: {
    scanAndGo: boolean;
    clickAndCollect: boolean;
    mpesa: boolean;
  };
  storeCount?: number;
  adminCount?: number;
  createdAt?: string;
  subscription?: {
    planCode: string;
    status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED';
  };
}

export interface SystemSettings {
  key: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  allowPublicRegistration: boolean;
  maxStoresPerOrg: number;
  defaultFraudConfig: {
    largeBasketMinor: number;
    mediumBasketMinor: number;
    fullCheckBasketMinor: number;
    maxItemsWithoutFullCheck: number;
    manualEntryAmberThreshold: number;
    randomAuditPercentage: number;
    amberScoreThreshold: number;
    amberFullScoreThreshold: number;
    amberTimeoutSeconds: number;
  };
  defaultPickupSlots: { slotId: string; startTime: string; endTime: string; capacity: number; active: boolean }[];
  defaultExitLanes: { laneId: string; name: string; active: boolean }[];
}

export interface Store {
  _id: string;
  name: string;
  code: string;
  location: string;
  organizationId?: string;
  shopAndCollectAvailable?: boolean; // false when the branch's plan does not include Shop & Collect
  shopAndCollectUnavailableReason?: string;
  collectDepositPercent?: number;
  organization?: {
    name: string;
    slug?: string;
    branding?: { logoUrl?: string; primaryColor?: string };
  };
  active?: boolean;
  openHours?: {
    openingTime: string;
    closingTime: string;
    daysDescription: string;
  };
  mpesaConfig?: {
    shortcode?: string;
    tillNumber?: string;
    storeIdentifier?: string;
  };
  pickupSlots: {
    slotId: string;
    startTime: string;
    endTime: string;
    capacity: number;
    active: boolean;
  }[];
  exitLanes: {
    laneId: string;
    name: string;
    active: boolean;
  }[];
  fraudConfig: {
    largeBasketMinor: number;
    mediumBasketMinor: number;
    fullCheckBasketMinor?: number;
    maxItemsWithoutFullCheck: number;
    manualEntryAmberThreshold: number;
    randomAuditPercentage: number;
    amberScoreThreshold?: number;
    amberFullScoreThreshold?: number;
    amberTimeoutSeconds?: number;
  };
  variableMeasureBarcode?: {
    enabled: boolean;
    prefix: string;
    scaleId: string;
    valueType: 'PRICE' | 'WEIGHT';
  };
}

export interface Product {
  _id: string;
  storeId: string;
  name: string;
  category: string;
  barcode: string;
  barcodeAliases?: string[];
  pluCode?: string;
  vatRateBps?: number;
  sku: string;
  priceMinor: number;
  priceVersion: number;
  weightGrams?: number;
  isWeighted?: boolean;
  highTheft?: boolean;
  soldBy?: 'unit' | 'weight';
  pricePerKgMinor?: number;
  requiresSerializedTag?: boolean;
  image?: string;
  stock: number;
  compareAtPriceMinor?: number;
  unitsSold30d?: number;
}

export interface BasketItem {
  productId: string;
  barcode: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  priceVersion: number;
  weightGrams?: number;
  isWeighted?: boolean;
  highTheft?: boolean;
  labelBarcode?: string;
  unitPriceAtScan?: number;
  scaleId?: string;
  tagSerial?: string;
}

export interface Basket {
  _id: string;
  storeId: string;
  customerId: string;
  status: 'OPEN' | 'ABANDONED' | 'CONVERTED';
  items: BasketItem[];
  manualEntryCount: number;
  removalCount: number;
  unknownBarcodeCount: number;
  totalMinor: number;
  totalItems: number;
  expectedWeightGrams: number;
  basketHash: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  barcode: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  weightGrams?: number;
  isWeighted?: boolean;
  highTheft?: boolean;
  labelBarcode?: string;
  unitPriceAtScan?: number;
  scaleId?: string;
  tagSerial?: string;
}

export interface Order {
  _id: string;
  orderNumber: string;
  orderType: 'SCAN_AND_GO' | 'CLICK_AND_COLLECT';
  storeId: any;
  customerId: any;
  basketId?: string;
  items: OrderItem[];
  totalMinor: number;
  totalItems: number;
  expectedWeightGrams: number;
  basketHash: string;
  status: string;
  pickupSlot?: {
    slotId: string;
    date: string;
    timeWindow: string;
  };
  substitutionsAllowed: boolean;
  collectionCode?: string;
  collectionQrToken?: string;
  paymentPlan?: 'FULL' | 'DEPOSIT';
  depositMinor?: number;
  paidMinor?: number;
  assignedPickerId?: any;
  verifiedPackerId?: any;
  isAddon?: boolean;
  parentOrderId?: string;
  paidAt?: string;
  pickedAt?: string;
  verifiedAt?: string;
  collectedAt?: string;
  exitedAt?: string;
  createdAt: string;
}

export interface PickingItem {
  productId: string;
  barcode: string;
  name: string;
  requiredQuantity: number;
  scannedQuantity: number;
  isWeighted: boolean;
  expectedWeightGrams?: number;
  actualWeightGrams?: number;
  isVerified: boolean;
  status: 'PENDING' | 'VERIFIED' | 'OUT_OF_STOCK' | 'SUBSTITUTED';
  substitution?: {
    originalProductId: string;
    replacementProductId: string;
    replacementName: string;
    replacementBarcode: string;
    replacementPriceMinor: number;
    priceDifferenceMinor: number;
    customerApproval: 'PENDING' | 'APPROVED' | 'REJECTED';
  };
}

export interface PickingTask {
  _id: string;
  orderId: any;
  storeId: string;
  pickerId: any;
  status: 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'AWAITING_APPROVAL' | 'PACKED';
  items: PickingItem[];
  verifierId?: any;
  packageSealNumber?: string;
  totalBagsOrContainers?: number;
  verificationNotes?: string;
  createdAt: string;
}

export interface ExitEvent {
  _id: string;
  orderId: string;
  storeId: string;
  exitLaneId: string;
  staffId: string;
  receiptToken: string;
  riskScore: number;
  riskBand: RiskBand;
  riskReasons: string[];
  physicalCheckRequired: boolean;
  physicalCheckSubmitted: boolean;
  differences?: {
    productId: string;
    barcode: string;
    name: string;
    paidQuantity: number;
    physicalQuantity: number;
    difference: number;
    unitPriceMinor: number;
  }[];
  hasDiscrepancies: boolean;
  clearanceDecision: 'PENDING' | 'CLEARED' | 'BLOCKED' | 'ESCALATED';
}
