import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';
import { detectCardBrand } from '../../src/utils/commerce.js';
import { generateRandomToken } from '../utils/crypto.js';

const addressSchema = z.object({
  label: z.string().trim().max(40).optional(),
  fullName: z.string().trim().min(2, 'Recipient name is required.').max(120),
  street: z.string().trim().min(3, 'Street address is required.').max(200),
  city: z.string().trim().min(2, 'City is required.').max(100),
  state: z.string().trim().max(60).optional(),
  postalCode: z.string().trim().min(3, 'Postal/ZIP code is required.').max(20),
  countryCode: z.string().trim().length(2).optional(),
  phone: z.string().trim().max(30).optional(),
  isDefault: z.boolean().optional(),
});

const cardSchema = z.object({
  cardNumber: z.string().min(13).max(25),
  cardholderName: z.string().trim().min(2, 'Cardholder name is required.').max(120),
  expMonth: z.union([z.string(), z.number()]),
  expYear: z.union([z.string(), z.number()]),
  billingZip: z.string().trim().min(3).max(20),
  setAsDefault: z.boolean().optional(),
});

export function createAccountRouter({
  repo,
  authMiddleware,
  buildClientState,
  subscribeSse,
  broadcastEvent,
}) {
  const router = Router();
  const { requireAuth } = authMiddleware;

  router.get(
    '/state',
    asyncHandler(async (req, res) => {
      const state = await buildClientState(req.user);
      res.json(state);
    })
  );

  router.get('/events', (req, res) => {
    subscribeSse(req, res);
  });

  router.put(
    '/preferences',
    requireAuth,
    asyncHandler(async (req, res) => {
      const updatedUser = await repo.updateUserPreferences(req.user.id, req.body || {});
      broadcastEvent?.('preferences:updated', { userId: req.user.id });
      const clientState = await buildClientState(updatedUser);
      res.json(clientState);
    })
  );

  router.get(
    '/addresses',
    requireAuth,
    asyncHandler(async (req, res) => {
      const addresses = await repo.listAddresses(req.user.id);
      res.json({ addresses });
    })
  );

  router.post(
    '/addresses',
    requireAuth,
    validateBody(addressSchema),
    asyncHandler(async (req, res) => {
      const address = await repo.createAddress(req.user.id, req.validatedBody);
      const freshUser = await repo.findUserById(req.user.id);
      res.status(201).json({ address, state: await buildClientState(freshUser) });
    })
  );

  router.patch(
    '/addresses/:id/default',
    requireAuth,
    asyncHandler(async (req, res) => {
      await repo.setDefaultAddress(req.user.id, req.params.id);
      const freshUser = await repo.findUserById(req.user.id);
      res.json(await buildClientState(freshUser));
    })
  );

  router.delete(
    '/addresses/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      await repo.deleteAddress(req.user.id, req.params.id);
      const freshUser = await repo.findUserById(req.user.id);
      res.json(await buildClientState(freshUser));
    })
  );

  router.post(
    '/wishlist/:productId',
    requireAuth,
    asyncHandler(async (req, res) => {
      const current = req.user.preference?.wishlistProductIds || [];
      const next = Array.from(new Set([...current, req.params.productId]));
      const updatedUser = await repo.updateUserPreferences(req.user.id, { wishlistProductIds: next });
      res.json(await buildClientState(updatedUser));
    })
  );

  router.delete(
    '/wishlist/:productId',
    requireAuth,
    asyncHandler(async (req, res) => {
      const current = req.user.preference?.wishlistProductIds || [];
      const next = current.filter((id) => id !== req.params.productId);
      const updatedUser = await repo.updateUserPreferences(req.user.id, { wishlistProductIds: next });
      res.json(await buildClientState(updatedUser));
    })
  );

  router.post(
    '/payment-methods',
    requireAuth,
    validateBody(cardSchema),
    asyncHandler(async (req, res) => {
      const { cardNumber, cardholderName, expMonth, expYear, billingZip, setAsDefault } =
        req.validatedBody;
      const digits = cardNumber.replace(/\D/g, '');
      if (digits.length < 15 || digits.length > 16) {
        throw new AppError(400, 'Enter a valid 15 or 16 digit card number.', 'INVALID_CARD');
      }
      // Security: Never store raw card number or CVV — only brand, last4, expiry & tokenized ref
      const newCard = await repo.addSavedPaymentMethod(req.user.id, {
        tokenRef: `tok_${generateRandomToken(12)}`,
        brand: detectCardBrand(digits),
        last4: digits.slice(-4),
        expMonth: String(expMonth).padStart(2, '0'),
        expYear: String(expYear).length === 2 ? `20${expYear}` : String(expYear),
        cardholderName,
        billingZip,
        setAsDefault: Boolean(setAsDefault),
      });
      const freshUser = await repo.findUserById(req.user.id);
      broadcastEvent?.('payment_methods:updated', { userId: req.user.id });
      res.status(201).json({ card: newCard, state: await buildClientState(freshUser) });
    })
  );

  router.patch(
    '/payment-methods/:id/default',
    requireAuth,
    asyncHandler(async (req, res) => {
      await repo.setDefaultSavedPaymentMethod(req.user.id, req.params.id);
      const freshUser = await repo.findUserById(req.user.id);
      res.json(await buildClientState(freshUser));
    })
  );

  router.delete(
    '/payment-methods/:id',
    requireAuth,
    asyncHandler(async (req, res) => {
      await repo.deleteSavedPaymentMethod(req.user.id, req.params.id);
      const freshUser = await repo.findUserById(req.user.id);
      res.json(await buildClientState(freshUser));
    })
  );

  return router;
}
