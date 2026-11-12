import { Schema, model, Document } from 'mongoose';

export interface IPhoneOtp extends Document {
  phone: string;
  codeHash: string;
  purpose: 'REGISTRATION' | 'FORGOT_PASSWORD' | 'LOGIN_VERIFY';
  expiresAt: Date;
  verified: boolean;
  attempts: number;
  createdAt: Date;
}

const phoneOtpSchema = new Schema<IPhoneOtp>(
  {
    phone: { type: String, required: true, index: true },
    codeHash: { type: String, required: true },
    purpose: {
      type: String,
      enum: ['REGISTRATION', 'FORGOT_PASSWORD', 'LOGIN_VERIFY'],
      required: true,
    },
    expiresAt: { type: Date, required: true },
    verified: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Expire OTP documents automatically after 10 minutes
phoneOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default model<IPhoneOtp>('PhoneOtp', phoneOtpSchema);