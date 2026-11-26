import { Schema, model, Document } from 'mongoose';
import { DiscrepancyResolution, RiskBand } from '../../shared/types/index.js';

export interface IPhysicalCheckItem {
  productId: Schema.Types.ObjectId;
  barcode: string;
  name: string;
  scannedQuantity: number;
}

export interface IComparisonDifference {
  productId: string;
  barcode: string;
  name: string;
  paidQuantity: number;
  physicalQuantity: number;
  difference: number; // positive = excess unrecorded items, negative = missing items
  unitPriceMinor: number;
}

export interface IExitEvent extends Document {
  orderId: Schema.Types.ObjectId;
  storeId: Schema.Types.ObjectId;
  exitLaneId: string;
  staffId: Schema.Types.ObjectId;
  receiptToken: string;
  riskScore: number;
  riskBand: RiskBand;
  riskReasons: string[];
  physicalCheckRequired: boolean;
  physicalCheckSubmitted: boolean;
  serializedTagsVerified?: boolean;
  serializedTagsPassed?: boolean;
  physicalItems: IPhysicalCheckItem[];
  differences: IComparisonDifference[];
  hasDiscrepancies: boolean;
  discrepancyId?: Schema.Types.ObjectId;
  clearanceDecision: 'PENDING' | 'CLEARED' | 'BLOCKED' | 'ESCALATED';
  clearedAt?: Date;
  amberOvertimeAlert?: boolean;
  amberDurationSeconds?: number;
  aiAssessment?: Record<string, any>;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDiscrepancy extends Document {
  exitEventId: Schema.Types.ObjectId;
  orderId: Schema.Types.ObjectId;
  storeId: Schema.Types.ObjectId;
  customerId: Schema.Types.ObjectId;
  itemsDiscrepant: IComparisonDifference[];
  totalExcessItems: number;
  totalExcessValueMinor: number;
  resolution?: DiscrepancyResolution;
  resolvedAt?: Date;
  resolvedBy?: Schema.Types.ObjectId;
  supervisorPinVerified?: boolean;
  linkedPaymentId?: Schema.Types.ObjectId;
  notes?: string;
}

const physicalCheckItemSchema = new Schema<IPhysicalCheckItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    barcode: { type: String, required: true },
    name: { type: String, required: true },
    scannedQuantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const comparisonDifferenceSchema = new Schema<IComparisonDifference>(
  {
    productId: { type: String, required: true },
    barcode: { type: String, required: true },
    name: { type: String, required: true },
    paidQuantity: { type: Number, required: true },
    physicalQuantity: { type: Number, required: true },
    difference: { type: Number, required: true },
    unitPriceMinor: { type: Number, required: true },
  },
  { _id: false }
);

const exitEventSchema = new Schema<IExitEvent>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    exitLaneId: { type: String, required: true },
    staffId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiptToken: { type: String, required: true, index: true },
    riskScore: { type: Number, required: true },
    riskBand: { type: String, enum: ['GREEN', 'AMBER', 'AMBER_FULL', 'RED'], required: true },
    riskReasons: [{ type: String }],
    physicalCheckRequired: { type: Boolean, default: false },
    physicalCheckSubmitted: { type: Boolean, default: false },
    serializedTagsVerified: { type: Boolean, default: false },
    serializedTagsPassed: { type: Boolean, default: false },
    physicalItems: [physicalCheckItemSchema],
    differences: [comparisonDifferenceSchema],
    hasDiscrepancies: { type: Boolean, default: false },
    discrepancyId: { type: Schema.Types.ObjectId, ref: 'Discrepancy' },
    clearanceDecision: {
      type: String,
      enum: ['PENDING', 'CLEARED', 'BLOCKED', 'ESCALATED'],
      default: 'PENDING',
    },
    clearedAt: Date,
    amberOvertimeAlert: { type: Boolean, default: false },
    amberDurationSeconds: Number,
    aiAssessment: { type: Schema.Types.Mixed },
    notes: String,
  },
  { timestamps: true }
);

const discrepancySchema = new Schema<IDiscrepancy>(
  {
    exitEventId: { type: Schema.Types.ObjectId, ref: 'ExitEvent', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    itemsDiscrepant: [comparisonDifferenceSchema],
    totalExcessItems: { type: Number, required: true },
    totalExcessValueMinor: { type: Number, required: true },
    resolution: {
      type: String,
      enum: ['PAID_DIFFERENCE', 'ITEM_RETURNED', 'ESCALATED', 'OVERRIDDEN_BY_SUPERVISOR'],
    },
    resolvedAt: Date,
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    supervisorPinVerified: Boolean,
    linkedPaymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
    notes: String,
  },
  { timestamps: true }
);

export const ExitEvent = model<IExitEvent>('ExitEvent', exitEventSchema);
export const Discrepancy = model<IDiscrepancy>('Discrepancy', discrepancySchema);
