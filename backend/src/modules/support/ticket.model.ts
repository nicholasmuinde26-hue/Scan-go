import { Schema, model, Document } from 'mongoose';

export interface ITicketMessage {
  sender: string;
  senderRole: string;
  message: string;
  isInternal: boolean;
  createdAt: Date;
}

export interface ISupportTicket extends Document {
  ticketNumber: string;
  customerId?: Schema.Types.ObjectId;
  customerPhone: string;
  customerName?: string;
  orderId?: Schema.Types.ObjectId;
  // Origin context: customer-help tickets have none; organization tickets carry the
  // supermarket (and optionally the branch) that raised them.
  source?: 'CUSTOMER' | 'STAFF' | 'PLATFORM';
  organizationId?: Schema.Types.ObjectId;
  storeId?: Schema.Types.ObjectId;
  raisedBy?: Schema.Types.ObjectId;
  raisedByName?: string;
  subject: string;
  description: string;
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  tier: 'TIER_1' | 'TIER_2';
  assignedTo?: Schema.Types.ObjectId;
  assignedAgentName?: string;
  slaExpiresAt: Date;
  slaBreached: boolean;
  messages: ITicketMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const ticketSchema = new Schema<ISupportTicket>(
  {
    ticketNumber: { type: String, required: true, unique: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User' },
    customerPhone: { type: String, required: true, index: true },
    customerName: String,
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    source: { type: String, enum: ['CUSTOMER', 'STAFF', 'PLATFORM'], default: 'CUSTOMER', index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', index: true },
    raisedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    raisedByName: String,
    subject: { type: String, required: true },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'],
      default: 'OPEN',
      index: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
      default: 'MEDIUM',
      index: true,
    },
    tier: {
      type: String,
      enum: ['TIER_1', 'TIER_2'],
      default: 'TIER_1',
      index: true,
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedAgentName: String,
    slaExpiresAt: { type: Date, required: true },
    slaBreached: { type: Boolean, default: false },
    messages: [
      {
        sender: { type: String, required: true },
        senderRole: { type: String, required: true },
        message: { type: String, required: true },
        isInternal: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default model<ISupportTicket>('SupportTicket', ticketSchema);
