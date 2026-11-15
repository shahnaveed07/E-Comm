import rateLimit from 'express-rate-limit';

export function createRateLimiters(config, overrides = {}) {
  const isTest = config.isTest;

  const authLimiter = rateLimit({
    windowMs: overrides.authWindowMs || 15 * 60 * 1000,
    max: overrides.authMax ?? (isTest ? 500 : 25),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many authentication attempts. Please wait a few minutes and try again.',
      code: 'RATE_LIMITED',
    },
  });

  const passwordResetLimiter = rateLimit({
    windowMs: overrides.passwordResetWindowMs || 15 * 60 * 1000,
    max: overrides.passwordResetMax ?? (isTest ? 500 : 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many password reset requests. Please try again later.',
      code: 'RATE_LIMITED',
    },
  });

  const checkoutLimiter = rateLimit({
    windowMs: overrides.checkoutWindowMs || 15 * 60 * 1000,
    max: overrides.checkoutMax ?? (isTest ? 500 : 30),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many order attempts. Please wait before retrying.',
      code: 'RATE_LIMITED',
    },
  });

  const paymentLimiter = rateLimit({
    windowMs: overrides.paymentWindowMs || 15 * 60 * 1000,
    max: overrides.paymentMax ?? (isTest ? 500 : 40),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many payment requests. Please wait before retrying.',
      code: 'RATE_LIMITED',
    },
  });

  const apiLimiter = rateLimit({
    windowMs: overrides.apiWindowMs || 1 * 60 * 1000,
    max: overrides.apiMax ?? (isTest ? 2000 : 300),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Request rate limit exceeded. Please slow down.',
      code: 'RATE_LIMITED',
    },
  });

  return {
    authLimiter,
    passwordResetLimiter,
    checkoutLimiter,
    paymentLimiter,
    apiLimiter,
  };
}
