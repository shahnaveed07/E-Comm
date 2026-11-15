import { Router } from 'express';
import { z } from 'zod';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';
import { minorToDecimal } from '../utils/money.js';

const verifyPaymentSchema = z.object({
  confirmVerified: z.literal(true, {
    errorMap: () => ({ message: 'Explicit confirmation flag (confirmVerified: true) is required.' }),
  }),
  notes: z.string().max(400).optional(),
});

const rejectPaymentSchema = z.object({
  reason: z.string().trim().min(4, 'Provide a rejection reason (min 4 characters).').max(300),
  notes: z.string().max(400).optional(),
});

const refundPaymentSchema = z.object({
  amountMinor: z.number().int().positive().optional(),
  reason: z.string().trim().min(4).max(300).optional(),
});

const adjustInventorySchema = z.object({
  delta: z.number().int().optional(),
  setQuantity: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  priceMinor: z.number().int().positive().optional(),
  reason: z.string().max(200).optional(),
});

const couponCreateSchema = z.object({
  code: z.string().trim().min(3).max(40),
  description: z.string().trim().max(200).optional(),
  discountType: z.enum(['PERCENT', 'FIXED']).default('PERCENT'),
  discountValue: z.number().int().positive(),
  minOrderMinor: z.number().int().min(0).default(0),
  maxDiscountMinor: z.number().int().positive().optional().nullable(),
  usageLimit: z.number().int().positive().optional().nullable(),
  isActive: z.boolean().default(true),
});

export function createAdminRouter({
  repo,
  config,
  catalogService,
  inventoryService,
  orderService,
  paymentVerificationService,
  paymentService,
  authMiddleware,
  buildClientState,
  broadcastEvent,
}) {
  const router = Router();
  const { requireAdmin } = authMiddleware;

  router.use(requireAdmin);

  // Orders
  router.get(
    '/orders',
    asyncHandler(async (_req, res) => {
      const orders = await repo.listAllOrders({ pageSize: 200 });
      res.json({ orders });
    })
  );

  router.post(
    '/orders',
    asyncHandler(async (req, res) => {
      const body = req.body || {};
      if (!Array.isArray(body.items) || body.items.length === 0) {
        throw new AppError(400, 'Add at least one product to publish an order.', 'EMPTY_ORDER');
      }
      const order = await orderService.createAdminOrder({ actorUser: req.user, body });
      res.status(201).json({ order, state: await buildClientState(req.user) });
    })
  );

  router.patch(
    '/orders/:id',
    asyncHandler(async (req, res) => {
      const order = await orderService.updateAdminOrder(req.params.id, req.body || {}, req.user);
      res.json({ order, state: await buildClientState(req.user) });
    })
  );

  // Safe soft-archive instead of destructive hard delete
  router.delete(
    '/orders/:id',
    asyncHandler(async (req, res) => {
      await orderService.archiveAdminOrder(req.params.id, req.user);
      res.json(await buildClientState(req.user));
    })
  );

  // Payments & UPI QR Manual Verification
  router.get(
    '/payments',
    asyncHandler(async (req, res) => {
      const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
      const provider = req.query.provider ? String(req.query.provider).toUpperCase() : undefined;
      const payments = await paymentVerificationService.listVerificationQueue({ status, provider });
      res.json({ payments });
    })
  );

  router.post(
    '/payments/:id/verify',
    validateBody(verifyPaymentSchema),
    asyncHandler(async (req, res) => {
      const result = await paymentVerificationService.adminVerifyPayment({
        paymentId: req.params.id,
        adminUser: req.user,
        confirmVerified: req.validatedBody.confirmVerified,
        notes: req.validatedBody.notes,
      });
      res.json({ ...result, state: await buildClientState(req.user) });
    })
  );

  router.post(
    '/payments/:id/reject',
    validateBody(rejectPaymentSchema),
    asyncHandler(async (req, res) => {
      const payment = await paymentVerificationService.adminRejectPayment({
        paymentId: req.params.id,
        adminUser: req.user,
        reason: req.validatedBody.reason,
        notes: req.validatedBody.notes,
      });
      res.json({ payment, state: await buildClientState(req.user) });
    })
  );

  router.post(
    '/payments/:id/refund',
    validateBody(refundPaymentSchema),
    asyncHandler(async (req, res) => {
      const payment = await paymentService.refundPayment({
        paymentId: req.params.id,
        amountMinor: req.validatedBody.amountMinor,
        reason: req.validatedBody.reason,
        actorUser: req.user,
      });
      broadcastEvent?.('payments:changed', { paymentId: payment.id, action: 'refunded' });
      res.json({ payment, state: await buildClientState(req.user) });
    })
  );

  // Products & Inventory
  router.get(
    '/products',
    asyncHandler(async (_req, res) => {
      const products = await catalogService.listAdminCatalog();
      res.json({ products });
    })
  );

  router.post(
    '/products',
    asyncHandler(async (req, res) => {
      const product = await catalogService.createProduct(req.body || {}, req.user.id);
      broadcastEvent?.('catalog:changed', { productId: product.id });
      res.status(201).json({ product, state: await buildClientState(req.user) });
    })
  );

  router.patch(
    '/products/:id',
    asyncHandler(async (req, res) => {
      const product = await catalogService.updateProduct(req.params.id, req.body || {}, req.user.id);
      broadcastEvent?.('catalog:changed', { productId: product.id });
      res.json({ product, state: await buildClientState(req.user) });
    })
  );

  router.post(
    '/products/:id/images',
    asyncHandler(async (req, res) => {
      const image = await catalogService.uploadAndAttachImage(
        req.params.id,
        req.body || {},
        req.user.id
      );
      broadcastEvent?.('catalog:changed', { productId: req.params.id });
      res.status(201).json({ image });
    })
  );

  router.delete(
    '/products/images/:imageId',
    asyncHandler(async (req, res) => {
      await catalogService.removeProductImage(req.params.imageId, req.user.id);
      broadcastEvent?.('catalog:changed', {});
      res.json({ ok: true });
    })
  );

  router.patch(
    '/variants/:id/inventory',
    validateBody(adjustInventorySchema),
    asyncHandler(async (req, res) => {
      const variant = await inventoryService.adjustVariantStock(
        req.params.id,
        req.validatedBody,
        req.user.id
      );
      broadcastEvent?.('catalog:changed', { variantId: variant.id });
      res.json({ variant, state: await buildClientState(req.user) });
    })
  );

  router.get(
    '/inventory/low-stock',
    asyncHandler(async (_req, res) => {
      const lowStock = await inventoryService.listLowStockVariants();
      res.json({ lowStock });
    })
  );

  // Customers
  router.get(
    '/customers',
    asyncHandler(async (req, res) => {
      const result = await repo.listUsers({
        search: String(req.query.q || ''),
        page: Number(req.query.page || 1),
        pageSize: Number(req.query.pageSize || 25),
      });
      res.json(result);
    })
  );

  router.patch(
    '/customers/:id/status',
    asyncHandler(async (req, res) => {
      const nextStatus = String(req.body?.status || '').toUpperCase();
      if (nextStatus !== 'ACTIVE' && nextStatus !== 'SUSPENDED') {
        throw new AppError(400, 'Status must be ACTIVE or SUSPENDED.', 'VALIDATION_ERROR');
      }
      if (req.params.id === req.user.id) {
        throw new AppError(400, 'You cannot suspend your own administrator account.', 'SELF_ACTION_BLOCKED');
      }
      const updated = await repo.updateUser(req.params.id, { status: nextStatus });
      if (nextStatus === 'SUSPENDED') {
        await repo.revokeAllUserSessions(req.params.id);
      }
      await repo.createAuditLog({
        actorUserId: req.user.id,
        actorRole: 'ADMIN',
        action: 'CUSTOMER_STATUS_CHANGED',
        entityType: 'User',
        entityId: req.params.id,
        metadata: { status: nextStatus },
      });
      res.json({ user: updated });
    })
  );

  // Coupons
  router.get(
    '/coupons',
    asyncHandler(async (_req, res) => {
      const coupons = await repo.listCoupons();
      res.json({ coupons });
    })
  );

  router.post(
    '/coupons',
    validateBody(couponCreateSchema),
    asyncHandler(async (req, res) => {
      const coupon = await repo.createCoupon(
        { ...req.validatedBody, currency: config.storeCurrency },
        req.user.id
      );
      res.status(201).json({ coupon });
    })
  );

  // Returns
  router.get(
    '/returns',
    asyncHandler(async (_req, res) => {
      const returns = await repo.listReturnRequests({});
      res.json({ returns });
    })
  );

  router.patch(
    '/returns/:id',
    asyncHandler(async (req, res) => {
      const { status, adminNote } = req.body || {};
      const updated = await repo.updateReturnRequest(
        req.params.id,
        {
          ...(status ? { status: String(status).toUpperCase() } : {}),
          ...(adminNote !== undefined ? { adminNote: String(adminNote) } : {}),
        },
        req.user.id
      );
      res.json({ returnRequest: updated });
    })
  );

  // Store Settings
  router.get(
    '/settings',
    asyncHandler(async (_req, res) => {
      const settings = await repo.getStoreSettings();
      res.json({ settings });
    })
  );

  router.put(
    '/settings',
    asyncHandler(async (req, res) => {
      const { key = 'commerce_config', value } = req.body || {};
      if (!value || typeof value !== 'object') {
        throw new AppError(400, 'Setting value object is required.', 'VALIDATION_ERROR');
      }
      const saved = await repo.updateStoreSetting(key, value, req.user.id);
      res.json({ setting: saved });
    })
  );

  // Financial Reports & Audit Logs
  router.get(
    '/reports',
    asyncHandler(async (_req, res) => {
      const [orders, payments, lowStock] = await Promise.all([
        repo.listAllOrders({ pageSize: 500 }),
        repo.listPayments({}),
        inventoryService.listLowStockVariants(),
      ]);

      // Only count verified CAPTURED orders that are not cancelled toward verified revenue
      const paidOrders = orders.filter(
        (o) => o.paymentStatus === 'CAPTURED' && o.status !== 'cancelled'
      );
      const verifiedRevenueMinor = paidOrders.reduce((s, o) => s + Number(o.totalMinor || 0), 0);

      const pendingPayments = payments.filter(
        (p) => p.status === 'PENDING' || p.status === 'PENDING_MANUAL_VERIFICATION'
      );
      const failedOrRejectedPayments = payments.filter(
        (p) => p.status === 'FAILED' || p.status === 'REJECTED'
      );
      const refundedPayments = payments.filter(
        (p) => p.status === 'REFUNDED' || p.status === 'PARTIALLY_REFUNDED'
      );

      const productSalesMap = new Map();
      for (const ord of paidOrders) {
        for (const item of ord.items || []) {
          const prev = productSalesMap.get(item.productId) || {
            productId: item.productId,
            productName: item.productName,
            unitsSold: 0,
            revenueMinor: 0,
          };
          prev.unitsSold += Number(item.quantity || 0);
          prev.revenueMinor +=
            item.lineTotalMinor ?? Math.round(Number(item.unitPrice || 0) * 100) * Number(item.quantity || 0);
          productSalesMap.set(item.productId, prev);
        }
      }

      const topProducts = Array.from(productSalesMap.values())
        .sort((a, b) => b.revenueMinor - a.revenueMinor)
        .map((p) => ({ ...p, revenue: minorToDecimal(p.revenueMinor) }));

      res.json({
        currency: config.storeCurrency,
        metrics: {
          verifiedRevenueMinor,
          verifiedRevenue: minorToDecimal(verifiedRevenueMinor),
          paidOrderCount: paidOrders.length,
          totalOrderCount: orders.length,
          pendingVerificationCount: pendingPayments.filter(
            (p) => p.status === 'PENDING_MANUAL_VERIFICATION'
          ).length,
          pendingPaymentCount: pendingPayments.length,
          failedPaymentCount: failedOrRejectedPayments.length,
          refundedTotalMinor: refundedPayments.reduce((s, p) => s + Number(p.refundedMinor || 0), 0),
          lowStockVariantCount: lowStock.length,
        },
        topProducts,
        lowStock,
      });
    })
  );

  router.get(
    '/audit-logs',
    asyncHandler(async (req, res) => {
      const limit = Math.min(200, Math.max(10, Number(req.query.limit || 60)));
      const logs = await repo.listAuditLogs({ limit });
      res.json({ logs });
    })
  );

  return router;
}
