import rateLimit from 'express-rate-limit';

// General API rate limiter (protects against general abuse: 600 req per 15 min per IP)
export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP address. Please try again later.',
  },
});

// Strict rate limiter for Authentication (Login / Register: 10 attempts per 15 min per IP)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login or registration attempts. Please wait 15 minutes before trying again.',
  },
});

// Strict rate limiter for OTP verification (5 attempts per 15 min)
export const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many OTP verification attempts. Please wait 15 minutes before retrying.',
  },
});

// Rate limiter for QR Receipt Redemption at Exit Lane (prevents brute forcing tokens: 30 req/min)
export const qrRedemptionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    decision: 'RED',
    error: 'Rate limit exceeded: Too many receipt verification requests at this lane.',
    reason: 'RATE_LIMIT_EXCEEDED',
  },
});

// Rate limiter for in-store check-in (poster code lookups and session creation: 20 req/min per IP)
export const presenceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    error: 'Too many check-in attempts. Please wait a minute and try again.',
  },
});
