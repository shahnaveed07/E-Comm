import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const DATA_DIR = path.join(process.cwd(), '.data');
const SECRET_FILE = path.join(DATA_DIR, 'session-secret.txt');

function resolveDevSecret(envSecret) {
  if (envSecret && envSecret.length >= 16) return envSecret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET (min 16 chars) must be configured in production.');
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(SECRET_FILE)) {
    const existing = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
    if (existing.length >= 32) return existing;
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, 'utf-8');
  return generated;
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const sessionSecret = resolveDevSecret(env.SESSION_SECRET);
  const storeCurrency = (env.STORE_CURRENCY || 'USD').trim().toUpperCase();
  const upiCurrency = (env.UPI_CURRENCY || 'INR').trim().toUpperCase();

  const config = {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    port: Number(env.PORT || 3000),
    appUrl: (env.APP_URL || 'http://localhost:3000').replace(/\/+$/, ''),
    logLevel: env.LOG_LEVEL || 'info',
    databaseUrl: env.DATABASE_URL || '',
    allowLocalDevStore:
      env.ALLOW_LOCAL_DEV_STORE !== 'false' && nodeEnv !== 'production',
    sessionSecret,
    csrfSecret:
      env.CSRF_SECRET && env.CSRF_SECRET.length >= 16
        ? env.CSRF_SECRET
        : crypto.createHash('sha256').update(`csrf:${sessionSecret}`).digest('hex'),
    sessionTtlMs: Math.max(1, Number(env.SESSION_TTL_HOURS || 168)) * 60 * 60 * 1000,
    bcryptRounds: Math.min(14, Math.max(8, Number(env.BCRYPT_ROUNDS || (nodeEnv === 'test' ? 8 : 10)))),
    storeName: env.STORE_NAME || 'Sylvan Grove',
    storeCurrency,
    freeShippingThresholdMinor: Math.round(Number(env.FREE_SHIPPING_THRESHOLD || 65) * 100),
    standardShippingFeeMinor: Math.round(Number(env.STANDARD_SHIPPING_FEE || 6.95) * 100),
    upiQr: {
      enabled: String(env.UPI_QR_ENABLED || 'false').toLowerCase() === 'true',
      merchantVpa: (env.UPI_MERCHANT_VPA || '').trim(),
      merchantName: (env.UPI_MERCHANT_NAME || env.STORE_NAME || 'Sylvan Grove').trim(),
      currency: upiCurrency,
      expiryMinutes: Math.min(60, Math.max(5, Number(env.UPI_QR_EXPIRY_MINUTES || 15))),
    },
    razorpay: {
      enabled: String(env.RAZORPAY_ENABLED || 'false').toLowerCase() === 'true',
      keyId: (env.RAZORPAY_KEY_ID || '').trim(),
      keySecret: (env.RAZORPAY_KEY_SECRET || '').trim(),
      webhookSecret: (env.RAZORPAY_WEBHOOK_SECRET || '').trim(),
    },
    stripe: {
      enabled: String(env.STRIPE_ENABLED || 'false').toLowerCase() === 'true',
      secretKey: (env.STRIPE_SECRET_KEY || '').trim(),
      publishableKey: (env.STRIPE_PUBLISHABLE_KEY || '').trim(),
      webhookSecret: (env.STRIPE_WEBHOOK_SECRET || '').trim(),
    },
    email: {
      provider: (env.EMAIL_PROVIDER || 'console').trim().toLowerCase(),
      resendApiKey: (env.RESEND_API_KEY || '').trim(),
      from: (env.EMAIL_FROM || 'Sylvan Grove <orders@sylvangrove.example>').trim(),
    },
    storage: {
      provider: (env.STORAGE_PROVIDER || 'local').trim().toLowerCase(),
      maxImageBytes: Number(env.MAX_IMAGE_UPLOAD_BYTES || 5 * 1024 * 1024),
      cloudinary: {
        cloudName: (env.CLOUDINARY_CLOUD_NAME || '').trim(),
        apiKey: (env.CLOUDINARY_API_KEY || '').trim(),
        apiSecret: (env.CLOUDINARY_API_SECRET || '').trim(),
      },
      s3: {
        bucket: (env.S3_BUCKET || '').trim(),
        region: (env.S3_REGION || '').trim(),
        accessKeyId: (env.S3_ACCESS_KEY_ID || '').trim(),
        secretAccessKey: (env.S3_SECRET_ACCESS_KEY || '').trim(),
        endpoint: (env.S3_ENDPOINT || '').trim(),
      },
    },
  };

  if (config.isProduction && !config.databaseUrl) {
    throw new Error('DATABASE_URL (MySQL 8) is required when NODE_ENV=production.');
  }

  return config;
}

export function isUpiQrAvailable(config, orderCurrency = config.storeCurrency) {
  const normStore = String(config.storeCurrency || '').toUpperCase();
  const normOrder = String(orderCurrency || normStore).toUpperCase();
  const normQr = String(config.upiQr?.currency || '').toUpperCase();
  return Boolean(
    config.upiQr?.enabled &&
      config.upiQr?.merchantVpa &&
      normStore === 'INR' &&
      normQr === 'INR' &&
      normOrder === 'INR'
  );
}

export function isRazorpayAvailable(config) {
  return Boolean(config.razorpay?.enabled && config.razorpay?.keyId && config.razorpay?.keySecret);
}

export function isStripeAvailable(config) {
  return Boolean(config.stripe?.enabled && config.stripe?.secretKey);
}
