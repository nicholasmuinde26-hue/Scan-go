import { Schema, model, Document } from 'mongoose';

export interface IFraudCase extends Document {
  caseNumber: string;
  title: string;
  storeId?: Schema.Types.ObjectId;
  organizationId?: Schema.Types.ObjectId;
  customerId?: Schema.Types.ObjectId;
  customerPhone?: string;
  customerName?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'INVESTIGATING' | 'CONFIRMED_THEFT' | 'CLEARED' | 'POLICE_REPORTED';
  incidentDate: Date;
  discrepancyId?: Schema.Types.ObjectId;
  evidenceSummary: string;
  evidenceNotes: string[];
  investigatorName?: string;
  actionTaken?: string;
  totalLossPreventedMinor?: number;
  createdAt: Date;
  updatedAt: Date;
}

const fraudCaseSchema = new Schema<IFraudCase>(
  {
    caseNumber: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
    customerId: { type: Schema.Types.ObjectId, ref: 'User' },
    customerPhone: String,
    customerName: String,
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM',
    },
    status: {
      type: String,
      enum: ['OPEN', 'INVESTIGATING', 'CONFIRMED_THEFT', 'CLEARED', 'POLICE_REPORTED'],
      default: 'OPEN',
      index: true,
    },
    incidentDate: { type: Date, default: Date.now },
    discrepancyId: { type: Schema.Types.ObjectId, ref: 'Discrepancy' },
    evidenceSummary: { type: String, required: true },
    evidenceNotes: [{ type: String }],
    investigatorName: String,
    actionTaken: String,
    totalLossPreventedMinor: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default model<IFraudCase>('FraudCase', fraudCaseSchema);
