import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ensureCsrfCookie } from '../middleware/csrf.js';
import { isRazorpayAvailable, isStripeAvailable, isUpiQrAvailable } from '../config/env.js';

export function createHealthRouter({ repo, config }) {
  const router = Router();

  router.get(
    '/health',
    asyncHandler(async (_req, res) => {
      let dbStatus = repo.mode;
      if (repo.prisma) {
        await repo.prisma.$queryRaw`SELECT 1`;
        dbStatus = 'mysql-ok';
      }
      res.json({
        ok: true,
        mode: dbStatus,
        currency: config.storeCurrency,
        timestamp: new Date().toISOString(),
      });
    })
  );

  router.get('/csrf-token', (req, res) => {
    const csrfToken = ensureCsrfCookie(req, res, config);
    res.json({ csrfToken });
  });

  router.get(
    '/config',
    asyncHandler(async (_req, res) => {
      const settings = await repo.getStoreSettings();
      const commerce = settings.commerce_config || {};
      const currency = commerce.currency || config.storeCurrency;
      res.json({
        storeName: commerce.storeName || config.storeName,
        currency,
        freeShippingThresholdMinor:
          commerce.freeShippingThresholdMinor ?? config.freeShippingThresholdMinor,
        standardShippingFeeMinor:
          commerce.standardShippingFeeMinor ?? config.standardShippingFeeMinor,
        paymentMethods: {
          cardToken: true,
          upiQr: isUpiQrAvailable(config, currency),
          upiManualVerification: true,
          razorpay: isRazorpayAvailable(config),
          stripe: isStripeAvailable(config),
          stripePublishableKey: config.stripe.publishableKey || null,
        },
      });
    })
  );

  return router;
}
