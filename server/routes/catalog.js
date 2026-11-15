import { Router } from 'express';
import { z } from 'zod';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';
import { hasUserPurchasedProduct, validateProductReviewInput } from '../../src/utils/commerce.js';

const couponPreviewSchema = z.object({
  code: z.string().trim().min(2).max(40),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        weightSize: z.string().optional(),
        quantity: z.number().int().min(1).max(25),
      })
    )
    .min(1),
});

export function createCatalogRouter({
  repo,
  catalogService,
  orderService,
  authMiddleware,
  buildClientState,
  broadcastEvent,
}) {
  const router = Router();
  const { requireAuth } = authMiddleware;

  router.get(
    '/catalog',
    asyncHandler(async (req, res) => {
      const { q, category, roast, dietary, minPrice, maxPrice, inStock } = req.query;
      let products = await catalogService.listPublicCatalog();

      if (q) {
        const needle = String(q).trim().toLowerCase();
        products = products.filter(
          (p) =>
            p.name.toLowerCase().includes(needle) ||
            p.origin.toLowerCase().includes(needle) ||
            p.shortDescription.toLowerCase().includes(needle) ||
            p.tastingNotes.toLowerCase().includes(needle)
        );
      }
      if (category && category !== 'all') {
        products = products.filter((p) => p.category === category);
      }
      if (roast && roast !== 'all') {
        products = products.filter((p) => p.roastProfile === roast);
      }
      if (dietary && dietary !== 'all') {
        products = products.filter((p) => (p.dietaryTags || []).includes(dietary));
      }
      if (minPrice != null && minPrice !== '') {
        products = products.filter((p) => Number(p.basePrice16oz) >= Number(minPrice));
      }
      if (maxPrice != null && maxPrice !== '') {
        products = products.filter((p) => Number(p.basePrice16oz) <= Number(maxPrice));
      }
      if (inStock === 'true') {
        products = products.filter((p) => p.inStock);
      }

      res.json({ products });
    })
  );

  router.get(
    '/products/:id',
    asyncHandler(async (req, res) => {
      const product = await catalogService.getProduct(req.params.id);
      res.json({ product });
    })
  );

  router.post(
    '/products/:productId/reviews',
    requireAuth,
    asyncHandler(async (req, res) => {
      const product = await repo.getProductById(req.params.productId);
      if (!product) throw new AppError(404, 'Product not found.', 'NOT_FOUND');

      const { rating, title = '', comment = '' } = req.body || {};
      const validation = validateProductReviewInput({ rating, title, comment });
      if (!validation.valid) {
        const firstErr =
          validation.errors.rating || validation.errors.title || validation.errors.comment;
        throw new AppError(400, firstErr, 'VALIDATION_ERROR', validation.errors);
      }

      const userOrders = await repo.listOrdersForUser(req.user.id);
      const verifiedPurchase = hasUserPurchasedProduct(userOrders, product.id, req.user.id);

      const review = await repo.createReview({
        productId: product.id,
        userId: req.user.id,
        authorName: req.user.fullName,
        rating: Number(rating),
        title: String(title).trim(),
        comment: String(comment).trim(),
        verifiedPurchase,
      });

      broadcastEvent?.('reviews:changed', { productId: product.id });
      res.status(201).json({ review, state: await buildClientState(req.user) });
    })
  );

  router.delete(
    '/reviews/:reviewId',
    requireAuth,
    asyncHandler(async (req, res) => {
      const target = await repo.findReviewById(req.params.reviewId);
      if (!target) throw new AppError(404, 'Review not found.', 'NOT_FOUND');
      if (target.userId !== req.user.id && String(req.user.role).toUpperCase() !== 'ADMIN') {
        throw new AppError(403, 'You can only delete your own reviews.', 'FORBIDDEN');
      }
      await repo.deleteReview(req.params.reviewId);
      broadcastEvent?.('reviews:changed', { productId: target.productId });
      res.json(await buildClientState(req.user));
    })
  );

  router.post(
    '/coupons/validate',
    validateBody(couponPreviewSchema),
    asyncHandler(async (req, res) => {
      const preview = await orderService.previewCoupon(req.validatedBody);
      res.json(preview);
    })
  );

  return router;
}
