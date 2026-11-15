import { AppError } from '../../middleware/errorHandler.js';
import { sanitizePublicUser, serializeInvoice, serializeOrder } from '../../repositories/serialize.js';
import {
  generateRandomToken,
  hashPasswordBcrypt,
  sha256Hex,
  verifyPasswordAny,
} from '../../utils/crypto.js';

export function buildUserAccountPayload(user, { orders = [], invoices = [], returnRequests = [] } = {}) {
  const pref = user.preference || {
    preferredRoast: 'raw_sprouted',
    dietaryGoals: ['omega3', 'heart_healthy'],
    excludedAllergens: [],
    wishlistProductIds: [],
    emailUpdates: true,
    smsDeliveryAlerts: false,
  };
  const addresses = Array.isArray(user.addresses) ? user.addresses : [];
  const defaultAddress = addresses.find((a) => a.isDefault) || addresses[0] || {
    fullName: user.fullName || '',
    street: '',
    city: '',
    state: 'OR',
    postalCode: '',
    countryCode: 'US',
    phone: '',
  };

  const paymentMethods = (user.savedPaymentMethods || []).map((pm) => ({
    id: pm.id,
    brand: pm.brand,
    last4: pm.last4,
    expMonth: pm.expMonth,
    expYear: pm.expYear,
    cardholderName: pm.cardholderName,
    billingZip: pm.billingZip,
    isDefault: Boolean(pm.isDefault),
  }));

  return {
    user: sanitizePublicUser(user),
    preferences: {
      preferredRoast: pref.preferredRoast,
      dietaryGoals: Array.isArray(pref.dietaryGoals) ? pref.dietaryGoals : [],
      excludedAllergens: Array.isArray(pref.excludedAllergens) ? pref.excludedAllergens : [],
      wishlistProductIds: Array.isArray(pref.wishlistProductIds) ? pref.wishlistProductIds : [],
      emailUpdates: Boolean(pref.emailUpdates),
      smsDeliveryAlerts: Boolean(pref.smsDeliveryAlerts),
      shippingAddress: {
        id: defaultAddress.id || null,
        fullName: defaultAddress.fullName || user.fullName || '',
        street: defaultAddress.street || '',
        city: defaultAddress.city || '',
        state: defaultAddress.state || 'OR',
        postalCode: defaultAddress.postalCode || '',
        countryCode: defaultAddress.countryCode || 'US',
        phone: defaultAddress.phone || '',
      },
    },
    addresses,
    wishlistProductIds: Array.isArray(pref.wishlistProductIds) ? pref.wishlistProductIds : [],
    paymentMethods,
    invoices: invoices.map((inv) => (inv.invoiceNumber ? inv : serializeInvoice(inv))),
    orders: orders.map((o) => (o.orderNumber ? o : serializeOrder(o))),
    returnRequests,
  };
}

export function createAuthService({ repo, config, emailService, onTokenIssued }) {
  async function createUserSession(userId, reqMeta = {}) {
    const rawToken = generateRandomToken(32);
    const sessionTokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + config.sessionTtlMs);
    const session = await repo.createSession({
      userId,
      sessionTokenHash,
      ipAddress: reqMeta.ip || null,
      userAgent: String(reqMeta.userAgent || '').slice(0, 250) || null,
      expiresAt,
    });
    return { rawToken, session };
  }

  return {
    async register({ email, fullName, password, reqMeta = {} }) {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        throw new AppError(400, 'Please enter a valid email address.', 'INVALID_EMAIL');
      }
      if (!fullName || String(fullName).trim().length < 2) {
        throw new AppError(400, 'Please enter your full name.', 'INVALID_NAME');
      }
      if (!password || String(password).length < 8) {
        throw new AppError(400, 'Password must be at least 8 characters long.', 'WEAK_PASSWORD');
      }

      const existing = await repo.findUserByEmail(normalizedEmail);
      if (existing) {
        throw new AppError(409, 'An account with this email already exists.', 'EMAIL_EXISTS');
      }

      const passwordHash = await hashPasswordBcrypt(password, config.bcryptRounds);
      const rawVerifyToken = generateRandomToken(24);
      const verifyTokenHash = sha256Hex(rawVerifyToken);
      const verifyTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const user = await repo.createUser({
        email: normalizedEmail,
        fullName: String(fullName).trim(),
        role: 'CUSTOMER',
        passwordHash,
        passwordAlgo: 'bcrypt',
        verifyTokenHash,
        verifyTokenExpiresAt,
      });

      const { rawToken, session } = await createUserSession(user.id, reqMeta);

      await repo.createAuditLog({
        actorUserId: user.id,
        actorRole: 'CUSTOMER',
        action: 'USER_REGISTERED',
        entityType: 'User',
        entityId: user.id,
        metadata: { email: user.email },
      });

      onTokenIssued?.({ type: 'verify', email: user.email, token: rawVerifyToken });
      emailService?.sendVerificationEmail(user, rawVerifyToken).catch(() => {});

      return { user, rawToken, session };
    },

    async login({ email, password, reqMeta = {} }) {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!normalizedEmail || !password) {
        throw new AppError(400, 'Email and password are required.', 'VALIDATION_ERROR');
      }

      const user = await repo.findUserByEmail(normalizedEmail);
      if (!user) {
        throw new AppError(401, 'Invalid email or password.', 'INVALID_CREDENTIALS');
      }
      if (user.status === 'SUSPENDED') {
        throw new AppError(403, 'This account is suspended. Contact support.', 'ACCOUNT_SUSPENDED');
      }

      const ok = await verifyPasswordAny(password, user);
      if (!ok) {
        throw new AppError(401, 'Invalid email or password.', 'INVALID_CREDENTIALS');
      }

      // Transparently upgrade scrypt-legacy passwords to bcrypt
      if (user.passwordAlgo === 'scrypt-legacy') {
        const nextHash = await hashPasswordBcrypt(password, config.bcryptRounds);
        await repo.updateUser(user.id, {
          passwordHash: nextHash,
          passwordAlgo: 'bcrypt',
          passwordSalt: null,
        });
      }

      const { rawToken, session } = await createUserSession(user.id, reqMeta);
      await repo.createAuditLog({
        actorUserId: user.id,
        actorRole: user.role,
        action: 'USER_LOGGED_IN',
        entityType: 'User',
        entityId: user.id,
        metadata: { ip: reqMeta.ip || null },
      });

      const freshUser = await repo.findUserById(user.id);
      return { user: freshUser, rawToken, session };
    },

    async logout(session, user) {
      if (session?.id) {
        await repo.revokeSessionById(session.id);
      }
      if (user?.id) {
        await repo
          .createAuditLog({
            actorUserId: user.id,
            actorRole: user.role,
            action: 'USER_LOGGED_OUT',
            entityType: 'User',
            entityId: user.id,
          })
          .catch(() => {});
      }
    },

    async verifyEmail(rawToken) {
      if (!rawToken) throw new AppError(400, 'Verification token is required.', 'VALIDATION_ERROR');
      const tokenHash = sha256Hex(rawToken);
      const user = await repo.findUserByVerifyTokenHash(tokenHash);
      if (!user) {
        throw new AppError(400, 'Invalid or expired verification link.', 'INVALID_TOKEN');
      }
      if (user.verifyTokenExpiresAt && new Date(user.verifyTokenExpiresAt).getTime() < Date.now()) {
        throw new AppError(400, 'Verification link has expired.', 'TOKEN_EXPIRED');
      }
      const updated = await repo.updateUser(user.id, {
        emailVerifiedAt: new Date(),
        verifyTokenHash: null,
        verifyTokenExpiresAt: null,
      });
      await repo.createAuditLog({
        actorUserId: user.id,
        actorRole: user.role,
        action: 'EMAIL_VERIFIED',
        entityType: 'User',
        entityId: user.id,
      });
      return updated;
    },

    async requestPasswordReset(email) {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const user = await repo.findUserByEmail(normalizedEmail);
      if (!user || user.status === 'SUSPENDED') {
        return { message: 'If an account matches that email, a reset link has been sent.' };
      }
      const rawResetToken = generateRandomToken(24);
      const resetTokenHash = sha256Hex(rawResetToken);
      const resetTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await repo.updateUser(user.id, {
        resetTokenHash,
        resetTokenExpiresAt,
      });

      onTokenIssued?.({ type: 'reset', email: user.email, token: rawResetToken });
      emailService?.sendPasswordResetEmail(user, rawResetToken).catch(() => {});

      await repo.createAuditLog({
        actorUserId: user.id,
        actorRole: user.role,
        action: 'PASSWORD_RESET_REQUESTED',
        entityType: 'User',
        entityId: user.id,
      });

      return { message: 'If an account matches that email, a reset link has been sent.' };
    },

    async resetPassword({ token, newPassword }) {
      if (!token) throw new AppError(400, 'Reset token is required.', 'VALIDATION_ERROR');
      if (!newPassword || String(newPassword).length < 8) {
        throw new AppError(400, 'New password must be at least 8 characters.', 'WEAK_PASSWORD');
      }
      const tokenHash = sha256Hex(token);
      const user = await repo.findUserByResetTokenHash(tokenHash);
      if (!user) {
        throw new AppError(400, 'Invalid or expired password reset token.', 'INVALID_TOKEN');
      }
      if (!user.resetTokenExpiresAt || new Date(user.resetTokenExpiresAt).getTime() < Date.now()) {
        throw new AppError(400, 'Password reset token has expired.', 'TOKEN_EXPIRED');
      }

      const passwordHash = await hashPasswordBcrypt(newPassword, config.bcryptRounds);
      await repo.updateUser(user.id, {
        passwordHash,
        passwordAlgo: 'bcrypt',
        passwordSalt: null,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
      });

      // Security requirement: revoke all existing sessions on password reset
      await repo.revokeAllUserSessions(user.id);

      await repo.createAuditLog({
        actorUserId: user.id,
        actorRole: user.role,
        action: 'PASSWORD_RESET_COMPLETED',
        entityType: 'User',
        entityId: user.id,
      });

      return { ok: true, message: 'Password updated. Please sign in with your new password.' };
    },
  };
}
