import { Schema, model, Document } from 'mongoose';

export interface IWebhookLog extends Document {
  endpoint: string;
  method: string;
  provider: 'MPESA_STK' | 'MPESA_C2B' | 'ERP' | 'SYSTEM';
  statusCode: number;
  latencyMs: number;
  payload: Record<string, any>;
  ipAddress?: string;
  errorMessage?: string;
  createdAt: Date;
}

const webhookLogSchema = new Schema<IWebhookLog>(
  {
    endpoint: { type: String, required: true },
    method: { type: String, default: 'POST' },
    provider: {
      type: String,
      enum: ['MPESA_STK', 'MPESA_C2B', 'ERP', 'SYSTEM'],
      default: 'MPESA_STK',
      index: true,
    },
    statusCode: { type: Number, required: true, index: true },
    latencyMs: { type: Number, default: 0 },
    payload: { type: Schema.Types.Mixed },
    ipAddress: String,
    errorMessage: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default model<IWebhookLog>('WebhookLog', webhookLogSchema);
