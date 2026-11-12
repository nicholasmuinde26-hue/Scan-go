import { Schema, model, Document } from 'mongoose';

export interface ISubscriptionJobLock extends Document {
  name: string;
  lockedUntil: Date;
  lastRunAt?: Date;
  lastRunSummary?: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionJobLockSchema = new Schema<ISubscriptionJobLock>(
  {
    name: { type: String, required: true, unique: true },
    lockedUntil: { type: Date, required: true, index: true },
    lastRunAt: Date,
    lastRunSummary: Schema.Types.Mixed,
  },
  { timestamps: true }
);

export default model<ISubscriptionJobLock>('SubscriptionJobLock', subscriptionJobLockSchema);
