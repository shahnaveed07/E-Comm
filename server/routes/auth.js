import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validate.js';
import { clearSessionCookie, setSessionCookie } from '../middleware/auth.js';
import { sanitizePublicUser } from '../repositories/serialize.js';

const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Please enter your full name.').max(120),
  email: z.string().trim().email('Please enter a valid email address.').max(180),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

const forgotSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
});

const resetSchema = z.object({
  token: z.string().trim().min(8, 'Valid reset token is required.'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters.').max(128),
});

export function createAuthRouter({
  authService,
  authRateLimiter,
  passwordResetLimiter,
  buildClientState,
  config,
}) {
  const router = Router();

  router.get('/me', (req, res) => {
    res.json({ user: sanitizePublicUser(req.user) });
  });

  router.post(
    '/register',
    authRateLimiter,
    validateBody(registerSchema),
    asyncHandler(async (req, res) => {
      const { user, rawToken } = await authService.register({
        ...req.validatedBody,
        reqMeta: { ip: req.ip, userAgent: req.get('user-agent') },
      });
      setSessionCookie(req, res, rawToken, config);
      const clientState = await buildClientState(user);
      res.status(201).json({
        user: sanitizePublicUser(user),
        state: clientState,
      });
    })
  );

  router.post(
    '/login',
    authRateLimiter,
    validateBody(loginSchema),
    asyncHandler(async (req, res) => {
      const { user, rawToken } = await authService.login({
        ...req.validatedBody,
        reqMeta: { ip: req.ip, userAgent: req.get('user-agent') },
      });
      setSessionCookie(req, res, rawToken, config);
      const clientState = await buildClientState(user);
      res.json({
        user: sanitizePublicUser(user),
        state: clientState,
      });
    })
  );

  router.post(
    '/logout',
    asyncHandler(async (req, res) => {
      await authService.logout(req.session, req.user);
      clearSessionCookie(req, res, config);
      const clientState = await buildClientState(null);
      res.json({ user: null, state: clientState });
    })
  );

  router.post(
    '/verify-email',
    asyncHandler(async (req, res) => {
      const token = req.body?.token || req.query?.token;
      const user = await authService.verifyEmail(token);
      res.json({ ok: true, user: sanitizePublicUser(user) });
    })
  );

  router.post(
    '/forgot-password',
    passwordResetLimiter,
    validateBody(forgotSchema),
    asyncHandler(async (req, res) => {
      const result = await authService.requestPasswordReset(req.validatedBody.email);
      res.json(result);
    })
  );

  router.post(
    '/reset-password',
    passwordResetLimiter,
    validateBody(resetSchema),
    asyncHandler(async (req, res) => {
      const result = await authService.resetPassword(req.validatedBody);
      clearSessionCookie(req, res, config);
      res.json(result);
    })
  );

  return router;
}
