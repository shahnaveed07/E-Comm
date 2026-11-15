import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';

const initiateSchema = z.object({
  orderId: z.string().min(1),
  provider: z.string().min(2),
});

const utrSchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().optional(),
  utrNumber: z.string().trim().min(8, 'Enter a valid UTR reference.').max(30),
});

const razorpayVerifySchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export function createPaymentsRouter({
  repo,
  paymentService,
  razorpayAdapter,
  authMiddleware,
  paymentLimiter,
  buildClientState,
  broadcastEvent,
}) {
  const router = Router();
  const { requireAuth } = authMiddleware;

  router.get('/methods', (req, res) => {
    const currency = req.query.currency ? String(req.query.currency).toUpperCase() : undefined;
    res.json(paymentService.getAvailableMethods(currency));
  });

  router.post(
    '/initiate',
    requireAuth,
    paymentLimiter,
    validateBody(initiateSchema),
    asyncHandler(async (req, res) => {
      const result = await paymentService.initiatePayment({
        orderId: req.validatedBody.orderId,
        provider: req.validatedBody.provider,
        user: req.user,
      });
      res.json(result);
    })
  );

  router.post(
    '/upi/submit-utr',
    requireAuth,
    paymentLimiter,
    validateBody(utrSchema),
    asyncHandler(async (req, res) => {
      const result = await paymentService.submitUpiUtr({
        ...req.validatedBody,
        user: req.user,
      });
      broadcastEvent?.('payments:changed', {
        orderId: req.validatedBody.orderId,
        action: 'utr_submitted',
      });
      const freshUser = await repo.findUserById(req.user.id);
      res.json({ ...result, state: await buildClientState(freshUser) });
    })
  );

  router.post(
    '/razorpay/verify',
    requireAuth,
    paymentLimiter,
    validateBody(razorpayVerifySchema),
    asyncHandler(async (req, res) => {
      const result = await razorpayAdapter.verifyClientCheckout(req.validatedBody);
      broadcastEvent?.('orders:changed', {
        orderId: result.order.id,
        action: 'razorpay_verified',
      });
      const freshUser = await repo.findUserById(req.user.id);
      res.json({ ...result, state: await buildClientState(freshUser) });
    })
  );

  return router;
}
