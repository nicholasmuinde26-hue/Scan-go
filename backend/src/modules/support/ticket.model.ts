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
  subject: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
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
    subject: { type: String, required: true },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
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
