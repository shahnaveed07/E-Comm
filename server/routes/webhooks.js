import express, { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';

export function createWebhooksRouter({ webhookProcessor }) {
  const router = Router();

  router.post(
    '/razorpay',
    express.raw({ type: '*/*' }),
    asyncHandler(async (req, res) => {
      const signatureHeader = req.get('x-razorpay-signature') || '';
      const result = await webhookProcessor.processRazorpayWebhook({
        rawBody: req.body,
        signatureHeader,
      });
      res.json({ received: true, ...result });
    })
  );

  router.post(
    '/stripe',
    express.raw({ type: '*/*' }),
    asyncHandler(async (req, res) => {
      const signatureHeader = req.get('stripe-signature') || '';
      const result = await webhookProcessor.processStripeWebhook({
        rawBody: req.body,
        signatureHeader,
      });
      res.json({ received: true, ...result });
    })
  );

  return router;
}
