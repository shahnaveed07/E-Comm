import { Router } from 'express';
import { z } from 'zod';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';

const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        weightSize: z.string().optional(),
        quantity: z.number().int().min(1).max(25),
      })
    )
    .min(1, 'Your bag is empty.'),
  shippingAddress: z.object({
    fullName: z.string().trim().min(2),
    street: z.string().trim().min(3),
    city: z.string().trim().min(2),
    state: z.string().trim().optional().default(''),
    postalCode: z.string().trim().min(3),
    countryCode: z.string().trim().optional().default('US'),
    phone: z.string().trim().optional().default(''),
  }),
  paymentMethodId: z.string().optional().nullable(),
  paymentProvider: z.string().optional().default('CARD_TOKEN'),
  couponCode: z.string().trim().optional().nullable(),
  notes: z.string().max(500).optional(),
});

const returnRequestSchema = z.object({
  reason: z.string().trim().min(8, 'Please describe your return/refund reason (min 8 chars).').max(600),
});

export function createOrdersRouter({
  repo,
  orderService,
  invoiceService,
  authMiddleware,
  checkoutLimiter,
  buildClientState,
}) {
  const router = Router();
  const { requireAuth } = authMiddleware;

  router.post(
    '/',
    requireAuth,
    checkoutLimiter,
    validateBody(createOrderSchema),
    asyncHandler(async (req, res) => {
      const result = await orderService.placeCustomerOrder({
        user: req.user,
        ...req.validatedBody,
      });
      const freshUser = await repo.findUserById(req.user.id);
      const clientState = await buildClientState(freshUser);
      res.status(201).json({
        order: result.order,
        payment: result.payment,
        invoice: result.invoice,
        state: clientState,
      });
    })
  );

  router.get(
    '/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      const order = await repo.findOrderById(req.params.id);
      if (!order) throw new AppError(404, 'Order not found.', 'NOT_FOUND');
      const isAdmin = String(req.user.role).toUpperCase() === 'ADMIN';
      if (order.userId !== req.user.id && !isAdmin) {
        throw new AppError(403, 'You do not have permission to view this order.', 'FORBIDDEN');
      }
      res.json({ order });
    })
  );

  router.get(
    '/:id/invoice.pdf',
    requireAuth,
    asyncHandler(async (req, res) => {
      const order = await repo.findOrderById(req.params.id);
      if (!order) throw new AppError(404, 'Order not found.', 'NOT_FOUND');
      const isAdmin = String(req.user.role).toUpperCase() === 'ADMIN';
      if (order.userId !== req.user.id && !isAdmin) {
        throw new AppError(403, 'You do not have permission to download this invoice.', 'FORBIDDEN');
      }
      const invoice = await repo.findInvoiceByOrderId(order.id);
      const pdfBuffer = await invoiceService.generateInvoicePdfBuffer({ order, invoice });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="SylvanGrove-${order.orderNumber}.pdf"`
      );
      res.send(pdfBuffer);
    })
  );

  router.post(
    '/:id/returns',
    requireAuth,
    validateBody(returnRequestSchema),
    asyncHandler(async (req, res) => {
      const order = await repo.findOrderById(req.params.id);
      if (!order) throw new AppError(404, 'Order not found.', 'NOT_FOUND');
      if (order.userId !== req.user.id) {
        throw new AppError(403, 'You can only request returns for your own orders.', 'FORBIDDEN');
      }
      const ret = await repo.createReturnRequest({
        orderId: order.id,
        userId: req.user.id,
        reason: req.validatedBody.reason,
      });
      res.status(201).json({ returnRequest: ret, state: await buildClientState(req.user) });
    })
  );

  return router;
}
