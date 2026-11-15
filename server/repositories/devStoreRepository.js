import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  FREE_SHIPPING_THRESHOLD,
  INITIAL_CATALOG,
  INITIAL_REVIEWS,
  STANDARD_SHIPPING_FEE,
  WEIGHT_OPTIONS,
} from '../../src/data/catalog.js';
import { AppError } from '../middleware/errorHandler.js';
import { minorToDecimalString, toMinorUnits } from '../utils/money.js';
import {
  mapOrderStatusToDb,
  sanitizePublicUser,
  serializeInvoice,
  serializeOrder,
  serializePayment,
  serializeProduct,
} from './serialize.js';

const CATEGORY_MAP = {
  walnuts: { slug: 'walnuts', name: 'Walnuts' },
  almonds: { slug: 'almonds', name: 'Almonds' },
  pistachios_hazelnuts: { slug: 'pistachios_hazelnuts', name: 'Pistachios & Hazelnuts' },
  pecans_medleys: { slug: 'pecans_medleys', name: 'Pecans & Medleys' },
};

function genId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

function clone(val) {
  return structuredClone(val);
}

function buildSeededState(config) {
  const currency = config.storeCurrency || 'USD';
  const categories = Object.values(CATEGORY_MAP);
  const products = INITIAL_CATALOG.map((item) => {
    const variants = ['8oz', '16oz', '32oz'].map((sizeKey) => {
      const opt = WEIGHT_OPTIONS[sizeKey];
      const priceMinor = toMinorUnits(item.basePrice16oz * opt.priceMultiplier);
      return {
        id: `var-${item.id.replace('prod-', '')}-${sizeKey}`,
        productId: item.id,
        sku: `${item.id.replace('prod-', 'SG-').toUpperCase()}-${sizeKey.toUpperCase()}`,
        weightSize: sizeKey,
        weightLabel: opt.label,
        grams: opt.grams,
        currency,
        priceMinor,
        priceDecimal: minorToDecimalString(priceMinor),
        stockQuantity: 45,
        reservedStock: 0,
        lowStockThreshold: 8,
        isActive: item.inStock !== false,
      };
    });

    return {
      ...clone(item),
      categorySlug: item.category,
      categoryLabel: CATEGORY_MAP[item.category]?.name || item.categoryLabel,
      isVisible: true,
      isArchived: false,
      variants,
      images: [
        {
          id: `img-${item.id}`,
          productId: item.id,
          url: item.imageUrl,
          provider: 'local',
          altText: `${item.name} from ${item.origin}`,
          sortOrder: 0,
          isPrimary: true,
        },
      ],
    };
  });

  const reviews = INITIAL_REVIEWS.map((r) => ({ ...clone(r) }));

  const coupons = [
    {
      id: 'cpn-harvest10',
      code: 'HARVEST10',
      description: '10% off organic orchard harvests over minimum spend',
      discountType: 'PERCENT',
      discountValue: 10,
      currency,
      minOrderMinor: 4000,
      maxDiscountMinor: 2500,
      usageLimit: null,
      usedCount: 0,
      isActive: true,
      expiresAt: null,
      createdAt: new Date().toISOString(),
    },
  ];

  const storeSettings = {
    commerce_config: {
      currency,
      freeShippingThresholdMinor: config.freeShippingThresholdMinor,
      standardShippingFeeMinor: config.standardShippingFeeMinor,
      storeName: config.storeName,
    },
  };

  return {
    categories,
    products,
    reviews,
    users: [],
    sessions: [],
    addresses: [],
    savedPaymentMethods: [],
    preferences: [],
    orders: [],
    payments: [],
    webhookEvents: [],
    invoices: [],
    inventoryMovements: [],
    coupons,
    returnRequests: [],
    auditLogs: [],
    notificationJobs: [],
    storeSettings,
  };
}

export function createDevStoreRepository(config, options = {}) {
  const inMemoryOnly = Boolean(options.inMemoryOnly);
  const persistFilePath =
    options.persistFilePath || path.join(process.cwd(), '.data', 'dev-store.v2.json');

  let state = buildSeededState(config);

  if (!inMemoryOnly && fs.existsSync(persistFilePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(persistFilePath, 'utf-8'));
      if (parsed && Array.isArray(parsed.products)) {
        state = { ...state, ...parsed };
      }
    } catch {
      // Fall back cleanly to fresh seeded dev state
    }
  }

  function persist() {
    if (inMemoryOnly) return;
    try {
      fs.mkdirSync(path.dirname(persistFilePath), { recursive: true });
      fs.writeFileSync(persistFilePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch {
      // Non-fatal in dev mode
    }
  }

  function hydrateUser(user) {
    if (!user) return null;
    const pref = state.preferences.find((p) => p.userId === user.id) || {
      userId: user.id,
      preferredRoast: 'raw_sprouted',
      dietaryGoals: ['omega3', 'heart_healthy'],
      excludedAllergens: [],
      wishlistProductIds: [],
      emailUpdates: true,
      smsDeliveryAlerts: false,
    };
    const addresses = state.addresses
      .filter((a) => a.userId === user.id)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    const savedPaymentMethods = state.savedPaymentMethods
      .filter((pm) => pm.userId === user.id)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    return {
      ...clone(user),
      preference: clone(pref),
      addresses: clone(addresses),
      savedPaymentMethods: clone(savedPaymentMethods),
    };
  }

  function hydrateOrder(ord) {
    if (!ord) return null;
    const payments = state.payments.filter((p) => p.orderId === ord.id);
    return serializeOrder({
      ...ord,
      payments,
    });
  }

  return {
    mode: inMemoryOnly ? 'memory-test' : 'local-dev-store',
    prisma: null,

    async getCatalog({ includeArchived = false, includeHidden = false } = {}) {
      return state.products
        .filter(
          (p) =>
            (includeArchived || !p.isArchived) &&
            (includeHidden || p.isVisible !== false)
        )
        .map((p) => serializeProduct(p));
    },

    async getProductById(id) {
      const p = state.products.find((item) => item.id === id);
      return p ? serializeProduct(p) : null;
    },

    async createProduct(input, actorUserId) {
      if (!CATEGORY_MAP[input.category]) {
        throw new AppError(400, 'Invalid product category.', 'INVALID_CATEGORY');
      }
      const id = input.id || `prod-${Date.now()}`;
      if (state.products.some((p) => p.slug === input.slug || p.id === id)) {
        throw new AppError(409, 'Product with that ID or slug already exists.', 'UNIQUE_CONSTRAINT');
      }
      const variants = ['8oz', '16oz', '32oz'].map((sizeKey) => {
        const opt = WEIGHT_OPTIONS[sizeKey];
        const vInput = input.variants?.[sizeKey] || {};
        const priceMinor =
          vInput.priceMinor != null
            ? Number(vInput.priceMinor)
            : toMinorUnits(Number(input.basePrice16oz) * opt.priceMultiplier);
        return {
          id: genId('var'),
          productId: id,
          sku: vInput.sku || `${id.toUpperCase()}-${sizeKey.toUpperCase()}`,
          weightSize: sizeKey,
          weightLabel: opt.label,
          grams: opt.grams,
          currency: config.storeCurrency,
          priceMinor,
          priceDecimal: minorToDecimalString(priceMinor),
          stockQuantity: vInput.stockQuantity != null ? Number(vInput.stockQuantity) : 40,
          reservedStock: 0,
          lowStockThreshold: Number(vInput.lowStockThreshold ?? 8),
          isActive: true,
        };
      });

      const product = {
        id,
        slug: input.slug,
        name: input.name,
        categorySlug: input.category,
        categoryLabel: CATEGORY_MAP[input.category].name,
        origin: input.origin,
        harvestBatch: input.harvestBatch,
        roastProfile: input.roastProfile,
        roastLabel: input.roastLabel,
        basePrice16oz: Number(input.basePrice16oz),
        shortDescription: input.shortDescription,
        tastingNotes: input.tastingNotes,
        nutritionPerServing: input.nutritionPerServing,
        dietaryTags: input.dietaryTags || [],
        allergens: input.allergens || [],
        featuredTag: input.featuredTag || null,
        isVisible: input.isVisible !== false,
        isArchived: false,
        variants,
        images: input.imageUrl
          ? [
              {
                id: genId('img'),
                productId: id,
                url: input.imageUrl,
                provider: 'local',
                altText: input.name,
                sortOrder: 0,
                isPrimary: true,
              },
            ]
          : [],
      };

      state.products.push(product);
      state.auditLogs.unshift({
        id: genId('aud'),
        actorUserId,
        actorRole: 'ADMIN',
        action: 'PRODUCT_CREATED',
        entityType: 'Product',
        entityId: id,
        metadata: { name: product.name },
        createdAt: new Date().toISOString(),
      });
      persist();
      return serializeProduct(product);
    },

    async updateProduct(id, patch, actorUserId) {
      const idx = state.products.findIndex((p) => p.id === id);
      if (idx === -1) throw new AppError(404, 'Product not found.', 'NOT_FOUND');
      const prod = state.products[idx];

      if (patch.category && !CATEGORY_MAP[patch.category]) {
        throw new AppError(400, 'Invalid category.', 'INVALID_CATEGORY');
      }

      Object.assign(prod, {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.category
          ? { categorySlug: patch.category, categoryLabel: CATEGORY_MAP[patch.category].name }
          : {}),
        ...(patch.origin !== undefined ? { origin: patch.origin } : {}),
        ...(patch.harvestBatch !== undefined ? { harvestBatch: patch.harvestBatch } : {}),
        ...(patch.roastProfile !== undefined ? { roastProfile: patch.roastProfile } : {}),
        ...(patch.roastLabel !== undefined ? { roastLabel: patch.roastLabel } : {}),
        ...(patch.shortDescription !== undefined ? { shortDescription: patch.shortDescription } : {}),
        ...(patch.tastingNotes !== undefined ? { tastingNotes: patch.tastingNotes } : {}),
        ...(patch.featuredTag !== undefined ? { featuredTag: patch.featuredTag || null } : {}),
        ...(typeof patch.isVisible === 'boolean' ? { isVisible: patch.isVisible } : {}),
        ...(typeof patch.isArchived === 'boolean' ? { isArchived: patch.isArchived } : {}),
      });

      if (patch.basePrice16oz != null) {
        prod.basePrice16oz = Number(patch.basePrice16oz);
        for (const variant of prod.variants) {
          const opt = WEIGHT_OPTIONS[variant.weightSize];
          if (!opt) continue;
          variant.priceMinor = toMinorUnits(Number(patch.basePrice16oz) * opt.priceMultiplier);
          variant.priceDecimal = minorToDecimalString(variant.priceMinor);
        }
      }

      state.auditLogs.unshift({
        id: genId('aud'),
        actorUserId,
        actorRole: 'ADMIN',
        action: 'PRODUCT_UPDATED',
        entityType: 'Product',
        entityId: id,
        metadata: { fields: Object.keys(patch) },
        createdAt: new Date().toISOString(),
      });
      persist();
      return serializeProduct(prod);
    },

    async addProductImage(productId, img, actorUserId) {
      const prod = state.products.find((p) => p.id === productId);
      if (!prod) throw new AppError(404, 'Product not found.', 'NOT_FOUND');
      if (img.isPrimary) {
        for (const existing of prod.images) existing.isPrimary = false;
      }
      const created = {
        id: genId('img'),
        productId,
        url: img.url,
        storageKey: img.storageKey || null,
        provider: img.provider || 'local',
        altText: img.altText || `${prod.name} harvest photo`,
        sortOrder: img.sortOrder ?? prod.images.length,
        isPrimary: Boolean(img.isPrimary || prod.images.length === 0),
      };
      prod.images.push(created);
      state.auditLogs.unshift({
        id: genId('aud'),
        actorUserId,
        actorRole: 'ADMIN',
        action: 'PRODUCT_IMAGE_ADDED',
        entityType: 'ProductImage',
        entityId: created.id,
        metadata: { productId, url: img.url },
        createdAt: new Date().toISOString(),
      });
      persist();
      return clone(created);
    },

    async deleteProductImage(imageId, actorUserId) {
      for (const prod of state.products) {
        const idx = prod.images.findIndex((i) => i.id === imageId);
        if (idx !== -1) {
          const [removed] = prod.images.splice(idx, 1);
          if (removed.isPrimary && prod.images.length > 0) {
            prod.images[0].isPrimary = true;
          }
          state.auditLogs.unshift({
            id: genId('aud'),
            actorUserId,
            actorRole: 'ADMIN',
            action: 'PRODUCT_IMAGE_DELETED',
            entityType: 'ProductImage',
            entityId: imageId,
            metadata: { productId: prod.id },
            createdAt: new Date().toISOString(),
          });
          persist();
          return removed;
        }
      }
      throw new AppError(404, 'Product image not found.', 'NOT_FOUND');
    },

    async adjustVariantInventory(
      variantId,
      { delta, setQuantity, lowStockThreshold, priceMinor, reason, actorUserId }
    ) {
      let target = null;
      for (const prod of state.products) {
        target = prod.variants.find((v) => v.id === variantId);
        if (target) break;
      }
      if (!target) throw new AppError(404, 'Product variant not found.', 'NOT_FOUND');

      const nextStock =
        setQuantity != null ? Number(setQuantity) : target.stockQuantity + Number(delta || 0);
      if (nextStock < target.reservedStock) {
        throw new AppError(
          409,
          `Stock quantity (${nextStock}) cannot be below reserved stock (${target.reservedStock}).`,
          'INVALID_STOCK_LEVEL'
        );
      }
      if (nextStock < 0) {
        throw new AppError(409, 'Stock quantity cannot be negative.', 'NEGATIVE_STOCK');
      }

      const quantityDelta = nextStock - target.stockQuantity;
      target.stockQuantity = nextStock;
      if (lowStockThreshold != null) target.lowStockThreshold = Number(lowStockThreshold);
      if (priceMinor != null) {
        target.priceMinor = Number(priceMinor);
        target.priceDecimal = minorToDecimalString(priceMinor);
      }

      if (quantityDelta !== 0) {
        state.inventoryMovements.push({
          id: genId('invmov'),
          variantId,
          actorUserId,
          type: quantityDelta > 0 ? 'RESTOCK' : 'ADJUSTMENT',
          quantityDelta,
          balanceAfter: nextStock,
          reservedAfter: target.reservedStock,
          reason: reason || 'Admin inventory adjustment',
          createdAt: new Date().toISOString(),
        });
      }

      state.auditLogs.unshift({
        id: genId('aud'),
        actorUserId,
        actorRole: 'ADMIN',
        action: 'INVENTORY_ADJUSTED',
        entityType: 'ProductVariant',
        entityId: variantId,
        metadata: { sku: target.sku, quantityDelta, nextStock, reason },
        createdAt: new Date().toISOString(),
      });
      persist();
      return clone(target);
    },

    async listReviews() {
      return clone(state.reviews).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    },

    async createReview(data) {
      const review = {
        id: genId('rev'),
        ...data,
        createdAt: new Date().toISOString(),
      };
      state.reviews.unshift(review);
      persist();
      return clone(review);
    },

    async findReviewById(id) {
      const found = state.reviews.find((r) => r.id === id);
      return found ? clone(found) : null;
    },

    async deleteReview(id) {
      state.reviews = state.reviews.filter((r) => r.id !== id);
      persist();
    },

    async findUserById(id) {
      const user = state.users.find((u) => u.id === id);
      return hydrateUser(user);
    },

    async findUserByEmail(email) {
      const norm = String(email).trim().toLowerCase();
      const user = state.users.find((u) => u.email.toLowerCase() === norm);
      return hydrateUser(user);
    },

    async findUserByVerifyTokenHash(verifyTokenHash) {
      const user = state.users.find((u) => u.verifyTokenHash === verifyTokenHash);
      return hydrateUser(user);
    },

    async findUserByResetTokenHash(resetTokenHash) {
      const user = state.users.find((u) => u.resetTokenHash === resetTokenHash);
      return hydrateUser(user);
    },

    async createUser(data) {
      const normEmail = String(data.email).trim().toLowerCase();
      if (state.users.some((u) => u.email.toLowerCase() === normEmail)) {
        throw new AppError(409, 'An account with this email already exists.', 'UNIQUE_CONSTRAINT');
      }
      const id = genId('usr');
      const now = new Date().toISOString();
      const user = {
        id,
        email: normEmail,
        fullName: data.fullName,
        role: data.role || 'CUSTOMER',
        status: 'ACTIVE',
        passwordHash: data.passwordHash,
        passwordAlgo: data.passwordAlgo || 'bcrypt',
        passwordSalt: data.passwordSalt || null,
        emailVerifiedAt: data.emailVerifiedAt || null,
        verifyTokenHash: data.verifyTokenHash || null,
        verifyTokenExpiresAt: data.verifyTokenExpiresAt || null,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        createdAt: now,
        updatedAt: now,
      };
      state.users.push(user);
      state.preferences.push({
        id: genId('pref'),
        userId: id,
        preferredRoast: 'raw_sprouted',
        dietaryGoals: ['omega3', 'heart_healthy'],
        excludedAllergens: [],
        wishlistProductIds: [],
        emailUpdates: true,
        smsDeliveryAlerts: false,
      });
      persist();
      return hydrateUser(user);
    },

    async updateUser(id, patch) {
      const idx = state.users.findIndex((u) => u.id === id);
      if (idx === -1) throw new AppError(404, 'User not found.', 'NOT_FOUND');
      state.users[idx] = {
        ...state.users[idx],
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      persist();
      return hydrateUser(state.users[idx]);
    },

    async listUsers({ search = '', page = 1, pageSize = 25 } = {}) {
      const q = search.trim().toLowerCase();
      const filtered = state.users
        .filter((u) => {
          if (!q) return true;
          return u.email.toLowerCase().includes(q) || u.fullName.toLowerCase().includes(q);
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
      return {
        users: paged.map((u) => ({
          ...sanitizePublicUser(u),
          orderCount: state.orders.filter((o) => o.userId === u.id && !o.archivedAt).length,
        })),
        total: filtered.length,
        page,
        pageSize,
      };
    },

    async createSession(data) {
      const sess = {
        id: genId('sess'),
        ...data,
        lastSeenAt: new Date().toISOString(),
        revokedAt: null,
        createdAt: new Date().toISOString(),
      };
      state.sessions.push(sess);
      persist();
      return clone(sess);
    },

    async findActiveSessionByTokenHash(sessionTokenHash) {
      const sess = state.sessions.find(
        (s) => s.sessionTokenHash === sessionTokenHash && !s.revokedAt
      );
      if (!sess) return null;
      const user = await this.findUserById(sess.userId);
      return { ...clone(sess), user };
    },

    async touchSession(id) {
      const sess = state.sessions.find((s) => s.id === id);
      if (sess) sess.lastSeenAt = new Date().toISOString();
    },

    async revokeSessionById(id) {
      const sess = state.sessions.find((s) => s.id === id && !s.revokedAt);
      if (sess) {
        sess.revokedAt = new Date().toISOString();
        persist();
      }
    },

    async revokeAllUserSessions(userId) {
      const now = new Date().toISOString();
      for (const sess of state.sessions) {
        if (sess.userId === userId && !sess.revokedAt) {
          sess.revokedAt = now;
        }
      }
      persist();
    },

    async updateUserPreferences(userId, patch) {
      let pref = state.preferences.find((p) => p.userId === userId);
      if (!pref) {
        pref = {
          id: genId('pref'),
          userId,
          preferredRoast: 'raw_sprouted',
          dietaryGoals: ['omega3', 'heart_healthy'],
          excludedAllergens: [],
          wishlistProductIds: [],
          emailUpdates: true,
          smsDeliveryAlerts: false,
        };
        state.preferences.push(pref);
      }
      if (patch.preferredRoast !== undefined) pref.preferredRoast = patch.preferredRoast;
      if (patch.dietaryGoals !== undefined) pref.dietaryGoals = patch.dietaryGoals;
      if (patch.excludedAllergens !== undefined) pref.excludedAllergens = patch.excludedAllergens;
      if (patch.wishlistProductIds !== undefined) pref.wishlistProductIds = patch.wishlistProductIds;
      if (typeof patch.emailUpdates === 'boolean') pref.emailUpdates = patch.emailUpdates;
      if (typeof patch.smsDeliveryAlerts === 'boolean') pref.smsDeliveryAlerts = patch.smsDeliveryAlerts;

      if (patch.shippingAddress && patch.shippingAddress.street) {
        const existingDefault = state.addresses.find((a) => a.userId === userId && a.isDefault);
        if (existingDefault) {
          Object.assign(existingDefault, {
            fullName: patch.shippingAddress.fullName || existingDefault.fullName,
            street: patch.shippingAddress.street,
            city: patch.shippingAddress.city || '',
            state: patch.shippingAddress.state || 'OR',
            postalCode: patch.shippingAddress.postalCode || '',
            phone: patch.shippingAddress.phone || '',
          });
        } else {
          state.addresses.push({
            id: genId('addr'),
            userId,
            label: 'Primary',
            fullName: patch.shippingAddress.fullName || '',
            street: patch.shippingAddress.street,
            city: patch.shippingAddress.city || '',
            state: patch.shippingAddress.state || 'OR',
            postalCode: patch.shippingAddress.postalCode || '',
            countryCode: patch.shippingAddress.countryCode || 'US',
            phone: patch.shippingAddress.phone || '',
            isDefault: true,
          });
        }
      }
      persist();
      return this.findUserById(userId);
    },

    async listAddresses(userId) {
      return clone(
        state.addresses
          .filter((a) => a.userId === userId)
          .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
      );
    },

    async createAddress(userId, addr) {
      const userAddrs = state.addresses.filter((a) => a.userId === userId);
      const makeDefault = Boolean(addr.isDefault) || userAddrs.length === 0;
      if (makeDefault) {
        for (const a of userAddrs) a.isDefault = false;
      }
      const created = {
        id: genId('addr'),
        userId,
        label: addr.label || 'Home',
        fullName: addr.fullName,
        street: addr.street,
        city: addr.city,
        state: addr.state || '',
        postalCode: addr.postalCode,
        countryCode: addr.countryCode || 'US',
        phone: addr.phone || '',
        isDefault: makeDefault,
        createdAt: new Date().toISOString(),
      };
      state.addresses.push(created);
      persist();
      return clone(created);
    },

    async setDefaultAddress(userId, addressId) {
      const target = state.addresses.find((a) => a.id === addressId && a.userId === userId);
      if (!target) throw new AppError(404, 'Address not found.', 'NOT_FOUND');
      for (const a of state.addresses) {
        if (a.userId === userId) a.isDefault = a.id === addressId;
      }
      persist();
      return clone(target);
    },

    async deleteAddress(userId, addressId) {
      const idx = state.addresses.findIndex((a) => a.id === addressId && a.userId === userId);
      if (idx === -1) throw new AppError(404, 'Address not found.', 'NOT_FOUND');
      state.addresses.splice(idx, 1);
      persist();
    },

    async addSavedPaymentMethod(userId, card) {
      const userCards = state.savedPaymentMethods.filter((c) => c.userId === userId);
      const isDefault = Boolean(card.setAsDefault) || userCards.length === 0;
      if (isDefault) {
        for (const c of userCards) c.isDefault = false;
      }
      const created = {
        id: genId('pm'),
        userId,
        provider: 'CARD_TOKEN',
        tokenRef: card.tokenRef,
        brand: card.brand,
        last4: card.last4,
        expMonth: card.expMonth,
        expYear: card.expYear,
        cardholderName: card.cardholderName,
        billingZip: card.billingZip,
        isDefault,
        createdAt: new Date().toISOString(),
      };
      state.savedPaymentMethods.push(created);
      persist();
      return clone(created);
    },

    async setDefaultSavedPaymentMethod(userId, cardId) {
      const target = state.savedPaymentMethods.find((c) => c.id === cardId && c.userId === userId);
      if (!target) throw new AppError(404, 'Payment method not found.', 'NOT_FOUND');
      for (const c of state.savedPaymentMethods) {
        if (c.userId === userId) c.isDefault = c.id === cardId;
      }
      persist();
      return clone(target);
    },

    async deleteSavedPaymentMethod(userId, cardId) {
      const userCards = state.savedPaymentMethods.filter((c) => c.userId === userId);
      const target = userCards.find((c) => c.id === cardId);
      if (!target) throw new AppError(404, 'Payment method not found.', 'NOT_FOUND');
      if (target.isDefault || userCards.length <= 1) {
        throw new AppError(400, 'Cannot remove your active default payment method.', 'DEFAULT_CARD_LOCKED');
      }
      state.savedPaymentMethods = state.savedPaymentMethods.filter((c) => c.id !== cardId);
      persist();
    },

    async findCouponByCode(code) {
      if (!code) return null;
      const norm = String(code).trim().toUpperCase();
      const cpn = state.coupons.find((c) => c.code === norm);
      return cpn ? clone(cpn) : null;
    },

    async listCoupons() {
      return clone(state.coupons);
    },

    async createCoupon(data, actorUserId) {
      const code = String(data.code).trim().toUpperCase();
      if (state.coupons.some((c) => c.code === code)) {
        throw new AppError(409, 'Coupon code already exists.', 'UNIQUE_CONSTRAINT');
      }
      const cpn = {
        id: genId('cpn'),
        ...data,
        code,
        usedCount: 0,
        createdAt: new Date().toISOString(),
      };
      state.coupons.unshift(cpn);
      state.auditLogs.unshift({
        id: genId('aud'),
        actorUserId,
        actorRole: 'ADMIN',
        action: 'COUPON_CREATED',
        entityType: 'Coupon',
        entityId: cpn.id,
        metadata: { code: cpn.code },
        createdAt: new Date().toISOString(),
      });
      persist();
      return clone(cpn);
    },

    async getStoreSettings() {
      return clone(state.storeSettings);
    },

    async updateStoreSetting(key, value, actorUserId) {
      state.storeSettings[key] = value;
      state.auditLogs.unshift({
        id: genId('aud'),
        actorUserId,
        actorRole: 'ADMIN',
        action: 'STORE_SETTING_UPDATED',
        entityType: 'StoreSetting',
        entityId: key,
        metadata: value,
        createdAt: new Date().toISOString(),
      });
      persist();
      return { key, value };
    },

    async listOrdersForUser(userId) {
      return state.orders
        .filter((o) => o.userId === userId && o.isLive !== false && !o.archivedAt)
        .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
        .map(hydrateOrder);
    },

    async listAllOrders({ page = 1, pageSize = 100 } = {}) {
      return state.orders
        .filter((o) => !o.archivedAt)
        .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
        .slice((page - 1) * pageSize, page * pageSize)
        .map(hydrateOrder);
    },

    async findOrderById(id) {
      const ord = state.orders.find((o) => o.id === id);
      return hydrateOrder(ord);
    },

    async createOrderWithReservation({
      orderData,
      orderItemsData,
      paymentData,
      invoiceData,
      couponId,
      reserveStock = true,
      commitStock = false,
      actorUserId,
    }) {
      // Phase 1: Validate all stock before mutating (atomic semantics)
      const matchedVariants = [];
      if (reserveStock || commitStock) {
        for (const line of orderItemsData) {
          if (!line.variantId) continue;
          let foundVar = null;
          for (const p of state.products) {
            foundVar = p.variants.find((v) => v.id === line.variantId);
            if (foundVar) break;
          }
          if (!foundVar || !foundVar.isActive) {
            throw new AppError(400, `Variant unavailable for ${line.productNameSnapshot}.`, 'VARIANT_UNAVAILABLE');
          }
          const available = foundVar.stockQuantity - foundVar.reservedStock;
          if (available < line.quantity) {
            throw new AppError(
              409,
              `Insufficient inventory for ${line.productNameSnapshot} (${line.weightSize}). Available: ${available}.`,
              'INSUFFICIENT_STOCK'
            );
          }
          matchedVariants.push({ variant: foundVar, line });
        }
      }

      // Phase 2: Mutate stock, order, payment, invoice, audit
      const orderId = genId('ord');
      const now = new Date().toISOString();

      for (const { variant, line } of matchedVariants) {
        if (commitStock) {
          variant.stockQuantity -= line.quantity;
          state.inventoryMovements.push({
            id: genId('invmov'),
            variantId: variant.id,
            orderId,
            actorUserId,
            type: 'COMMIT',
            quantityDelta: -line.quantity,
            balanceAfter: variant.stockQuantity,
            reservedAfter: variant.reservedStock,
            reason: `Committed on order ${orderData.orderNumber}`,
            createdAt: now,
          });
        } else {
          variant.reservedStock += line.quantity;
          state.inventoryMovements.push({
            id: genId('invmov'),
            variantId: variant.id,
            orderId,
            actorUserId,
            type: 'RESERVE',
            quantityDelta: 0,
            balanceAfter: variant.stockQuantity,
            reservedAfter: variant.reservedStock,
            reason: `Reserved for order ${orderData.orderNumber}`,
            createdAt: now,
          });
        }
      }

      if (couponId) {
        const cpn = state.coupons.find((c) => c.id === couponId);
        if (cpn) cpn.usedCount = (cpn.usedCount || 0) + 1;
      }

      const order = {
        id: orderId,
        ...orderData,
        placedAt: now,
        archivedAt: null,
        items: orderItemsData.map((line) => ({ id: genId('oi'), orderId, ...line })),
        statusHistory: [
          {
            id: genId('sh'),
            orderId,
            fromStatus: null,
            toStatus: orderData.status,
            actorUserId,
            note: orderData.source === 'admin' ? 'Created in Admin Console' : 'Order created',
            createdAt: now,
          },
        ],
      };
      state.orders.unshift(order);

      let payment = null;
      if (paymentData) {
        payment = {
          id: genId('pay'),
          ...paymentData,
          orderId,
          refundedMinor: 0,
          createdAt: now,
          updatedAt: now,
        };
        state.payments.unshift(payment);
      }

      let invoice = null;
      if (invoiceData) {
        invoice = {
          id: genId('inv'),
          ...invoiceData,
          orderId,
          issuedAt: now,
          paidAt: invoiceData.paidAt || null,
        };
        state.invoices.unshift(invoice);
      }

      state.auditLogs.unshift({
        id: genId('aud'),
        actorUserId,
        actorRole: orderData.source === 'admin' ? 'ADMIN' : 'CUSTOMER',
        action: 'ORDER_CREATED',
        entityType: 'Order',
        entityId: orderId,
        metadata: {
          orderNumber: order.orderNumber,
          totalMinor: order.totalMinor,
          currency: order.currency,
        },
        createdAt: now,
      });

      persist();
      return {
        order: hydrateOrder(order),
        payment: payment ? serializePayment(payment) : null,
        invoice: invoice ? serializeInvoice(invoice) : null,
      };
    },

    async updateOrder(orderId, patch, actorUserId) {
      const ord = state.orders.find((o) => o.id === orderId);
      if (!ord) throw new AppError(404, 'Order not found.', 'NOT_FOUND');

      const nextStatus = patch.status ? mapOrderStatusToDb(patch.status) : ord.status;
      if (nextStatus === 'CANCELLED' && ord.status !== 'CANCELLED') {
        const wasCommitted = state.inventoryMovements.some(
          (m) => m.orderId === orderId && m.type === 'COMMIT'
        );
        for (const line of ord.items) {
          if (!line.variantId) continue;
          let variant = null;
          for (const p of state.products) {
            variant = p.variants.find((v) => v.id === line.variantId);
            if (variant) break;
          }
          if (!variant) continue;
          if (wasCommitted) {
            variant.stockQuantity += line.quantity;
            state.inventoryMovements.push({
              id: genId('invmov'),
              variantId: variant.id,
              orderId,
              actorUserId,
              type: 'RETURN',
              quantityDelta: line.quantity,
              balanceAfter: variant.stockQuantity,
              reservedAfter: variant.reservedStock,
              reason: `Returned on cancellation of ${ord.orderNumber}`,
              createdAt: new Date().toISOString(),
            });
          } else {
            const releaseQty = Math.min(variant.reservedStock, line.quantity);
            if (releaseQty > 0) {
              variant.reservedStock -= releaseQty;
              state.inventoryMovements.push({
                id: genId('invmov'),
                variantId: variant.id,
                orderId,
                actorUserId,
                type: 'RELEASE',
                quantityDelta: 0,
                balanceAfter: variant.stockQuantity,
                reservedAfter: variant.reservedStock,
                reason: `Released on cancellation of ${ord.orderNumber}`,
                createdAt: new Date().toISOString(),
              });
            }
          }
        }
      }

      if (patch.status !== undefined && nextStatus !== ord.status) {
        ord.statusHistory.push({
          id: genId('sh'),
          orderId,
          fromStatus: ord.status,
          toStatus: nextStatus,
          actorUserId,
          note: patch.statusNote || 'Updated by admin',
          createdAt: new Date().toISOString(),
        });
      }

      Object.assign(ord, {
        ...(patch.status !== undefined ? { status: nextStatus } : {}),
        ...(patch.paymentStatus !== undefined ? { paymentStatus: patch.paymentStatus } : {}),
        ...(typeof patch.isLive === 'boolean' ? { isLive: patch.isLive } : {}),
        ...(patch.trackingNumber !== undefined ? { trackingNumber: patch.trackingNumber } : {}),
        ...(patch.estimatedDelivery !== undefined ? { estimatedDelivery: patch.estimatedDelivery } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      });

      state.auditLogs.unshift({
        id: genId('aud'),
        actorUserId,
        actorRole: 'ADMIN',
        action: 'ORDER_UPDATED',
        entityType: 'Order',
        entityId: orderId,
        metadata: patch,
        createdAt: new Date().toISOString(),
      });
      persist();
      return hydrateOrder(ord);
    },

    async archiveOrder(orderId, actorUserId) {
      const ord = state.orders.find((o) => o.id === orderId);
      if (!ord) throw new AppError(404, 'Order not found.', 'NOT_FOUND');

      if (ord.status === 'AWAITING_PAYMENT') {
        for (const line of ord.items) {
          if (!line.variantId) continue;
          for (const p of state.products) {
            const v = p.variants.find((vr) => vr.id === line.variantId);
            if (v) {
              v.reservedStock = Math.max(0, v.reservedStock - line.quantity);
            }
          }
        }
      }

      ord.archivedAt = new Date().toISOString();
      ord.isLive = false;
      state.auditLogs.unshift({
        id: genId('aud'),
        actorUserId,
        actorRole: 'ADMIN',
        action: 'ORDER_ARCHIVED',
        entityType: 'Order',
        entityId: orderId,
        metadata: { orderNumber: ord.orderNumber },
        createdAt: new Date().toISOString(),
      });
      persist();
    },

    async findPaymentById(id) {
      const p = state.payments.find((item) => item.id === id);
      return serializePayment(p);
    },

    async findPaymentByReference(paymentReference) {
      const p = state.payments.find((item) => item.paymentReference === paymentReference);
      return serializePayment(p);
    },

    async findPaymentByExternalOrderId(externalOrderId) {
      const p = state.payments.find((item) => item.externalOrderId === externalOrderId);
      return serializePayment(p);
    },

    async findPaymentsByUtr(utrNumber) {
      return state.payments
        .filter((item) => item.utrNumber === utrNumber)
        .map(serializePayment);
    },

    async listPayments({ status, provider } = {}) {
      return state.payments
        .filter((p) => (!status || p.status === status) && (!provider || p.provider === provider))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((p) => {
          const ord = state.orders.find((o) => o.id === p.orderId);
          const usr = state.users.find((u) => u.id === p.userId);
          return {
            ...serializePayment(p),
            orderNumber: ord?.orderNumber || '',
            customerName: usr?.fullName || ord?.shippingAddress?.fullName || 'Guest',
            customerEmail: usr?.email || '',
          };
        });
    },

    async createPaymentRecord(data) {
      const now = new Date().toISOString();
      const payment = {
        id: genId('pay'),
        ...data,
        refundedMinor: 0,
        createdAt: now,
        updatedAt: now,
      };
      state.payments.unshift(payment);
      persist();
      return serializePayment(payment);
    },

    async updatePaymentRecord(id, patch) {
      const p = state.payments.find((item) => item.id === id);
      if (!p) throw new AppError(404, 'Payment not found.', 'NOT_FOUND');
      Object.assign(p, patch, { updatedAt: new Date().toISOString() });
      persist();
      return serializePayment(p);
    },

    async confirmPaymentAndCommitOrder({
      paymentId,
      externalPaymentId = null,
      verifiedByUserId = null,
      verificationNotes = null,
      actorRole = 'SYSTEM',
    }) {
      const payment = state.payments.find((p) => p.id === paymentId);
      if (!payment) throw new AppError(404, 'Payment record not found.', 'NOT_FOUND');

      if (payment.status === 'CAPTURED') {
        const ord = state.orders.find((o) => o.id === payment.orderId);
        return { payment: serializePayment(payment), order: hydrateOrder(ord) };
      }

      const order = state.orders.find((o) => o.id === payment.orderId);
      if (!order) throw new AppError(404, 'Order not found.', 'NOT_FOUND');

      if (payment.amountMinor !== order.totalMinor || payment.currency !== order.currency) {
        throw new AppError(400, 'Payment amount/currency mismatch with order total.', 'AMOUNT_MISMATCH');
      }

      const existingCommits = state.inventoryMovements.some(
        (m) => m.orderId === order.id && m.type === 'COMMIT'
      );

      // Verify stock before mutating
      const stockTargets = [];
      if (!existingCommits) {
        for (const line of order.items) {
          if (!line.variantId) continue;
          let variant = null;
          for (const prod of state.products) {
            variant = prod.variants.find((v) => v.id === line.variantId);
            if (variant) break;
          }
          if (!variant) continue;
          if (variant.stockQuantity < line.quantity) {
            throw new AppError(
              409,
              `Insufficient stock to commit ${line.productNameSnapshot}.`,
              'INSUFFICIENT_STOCK'
            );
          }
          stockTargets.push({ variant, line });
        }
      }

      const now = new Date().toISOString();
      for (const { variant, line } of stockTargets) {
        const releaseReserved = Math.min(variant.reservedStock, line.quantity);
        variant.stockQuantity -= line.quantity;
        variant.reservedStock -= releaseReserved;
        state.inventoryMovements.push({
          id: genId('invmov'),
          variantId: variant.id,
          orderId: order.id,
          actorUserId: verifiedByUserId,
          type: 'COMMIT',
          quantityDelta: -line.quantity,
          balanceAfter: variant.stockQuantity,
          reservedAfter: variant.reservedStock,
          reason: `Payment verified for ${order.orderNumber}`,
          createdAt: now,
        });
      }

      Object.assign(payment, {
        status: 'CAPTURED',
        ...(externalPaymentId ? { externalPaymentId } : {}),
        ...(verifiedByUserId ? { verifiedByUserId } : {}),
        verifiedAt: now,
        ...(verificationNotes ? { verificationNotes } : {}),
        updatedAt: now,
      });

      const nextStatus = order.status === 'AWAITING_PAYMENT' ? 'PLACED' : order.status;
      if (nextStatus !== order.status) {
        order.statusHistory.push({
          id: genId('sh'),
          orderId: order.id,
          fromStatus: order.status,
          toStatus: nextStatus,
          actorUserId: verifiedByUserId,
          note: `Payment verified (${payment.provider})`,
          createdAt: now,
        });
      }
      order.status = nextStatus;
      order.paymentStatus = 'CAPTURED';
      order.isLive = true;

      for (const inv of state.invoices) {
        if (inv.orderId === order.id) {
          inv.status = 'PAID';
          inv.paidAt = now;
        }
      }

      state.auditLogs.unshift({
        id: genId('aud'),
        actorUserId: verifiedByUserId,
        actorRole,
        action: 'PAYMENT_VERIFIED',
        entityType: 'Payment',
        entityId: payment.id,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          provider: payment.provider,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          utrNumber: payment.utrNumber,
          verificationNotes,
        },
        createdAt: now,
      });

      persist();
      return { payment: serializePayment(payment), order: hydrateOrder(order) };
    },

    async rejectPaymentRecord({ paymentId, verifiedByUserId, rejectionReason, verificationNotes }) {
      const payment = state.payments.find((p) => p.id === paymentId);
      if (!payment) throw new AppError(404, 'Payment not found.', 'NOT_FOUND');

      const now = new Date().toISOString();
      Object.assign(payment, {
        status: 'REJECTED',
        verifiedByUserId,
        verifiedAt: now,
        rejectionReason: rejectionReason || 'Transaction could not be verified.',
        verificationNotes: verificationNotes || null,
        updatedAt: now,
      });

      const order = state.orders.find((o) => o.id === payment.orderId);
      if (order) order.paymentStatus = 'REJECTED';

      state.auditLogs.unshift({
        id: genId('aud'),
        actorUserId: verifiedByUserId,
        actorRole: 'ADMIN',
        action: 'PAYMENT_REJECTED',
        entityType: 'Payment',
        entityId: payment.id,
        metadata: { orderId: payment.orderId, rejectionReason, utrNumber: payment.utrNumber },
        createdAt: now,
      });
      persist();
      return serializePayment(payment);
    },

    async markPaymentRefunded({ paymentId, refundMinor, refundStatus, actorUserId, reason }) {
      const payment = state.payments.find((p) => p.id === paymentId);
      if (!payment) throw new AppError(404, 'Payment not found.', 'NOT_FOUND');

      const nextRefunded = Math.min(payment.amountMinor, (payment.refundedMinor || 0) + Number(refundMinor));
      const nextStatus =
        refundStatus || (nextRefunded >= payment.amountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED');
      payment.refundedMinor = nextRefunded;
      payment.status = nextStatus;
      payment.updatedAt = new Date().toISOString();

      const order = state.orders.find((o) => o.id === payment.orderId);
      if (order) order.paymentStatus = nextStatus;

      if (nextStatus === 'REFUNDED') {
        for (const inv of state.invoices) {
          if (inv.orderId === payment.orderId) inv.status = 'REFUNDED';
        }
      }

      state.auditLogs.unshift({
        id: genId('aud'),
        actorUserId,
        actorRole: 'ADMIN',
        action: 'PAYMENT_REFUNDED',
        entityType: 'Payment',
        entityId: paymentId,
        metadata: { refundMinor, nextRefunded, nextStatus, reason },
        createdAt: new Date().toISOString(),
      });
      persist();
      return serializePayment(payment);
    },

    async recordWebhookEventIfNew({ provider, eventId, eventType, signatureValid, payload }) {
      const existing = state.webhookEvents.find(
        (e) => e.provider === provider && e.eventId === eventId
      );
      if (existing) {
        return { duplicate: true, event: null };
      }
      const evt = {
        id: genId('whk'),
        provider,
        eventId,
        eventType,
        signatureValid,
        payload,
        processedAt: new Date().toISOString(),
      };
      state.webhookEvents.push(evt);
      persist();
      return { duplicate: false, event: evt };
    },

    async listInvoicesForUser(userId) {
      return state.invoices
        .filter((i) => i.userId === userId)
        .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())
        .map(serializeInvoice);
    },

    async listAllInvoices() {
      return state.invoices
        .slice()
        .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())
        .map(serializeInvoice);
    },

    async findInvoiceByOrderId(orderId) {
      const inv = state.invoices.find((i) => i.orderId === orderId);
      return inv ? serializeInvoice(inv) : null;
    },

    async createReturnRequest({ orderId, userId, reason }) {
      const req = {
        id: genId('ret'),
        orderId,
        userId,
        reason,
        status: 'REQUESTED',
        adminNote: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.returnRequests.unshift(req);
      persist();
      return clone(req);
    },

    async listReturnRequests({ userId } = {}) {
      return state.returnRequests
        .filter((r) => !userId || r.userId === userId)
        .map((r) => {
          const ord = state.orders.find((o) => o.id === r.orderId);
          return {
            ...clone(r),
            order: ord
              ? { orderNumber: ord.orderNumber, totalMinor: ord.totalMinor, currency: ord.currency }
              : null,
          };
        });
    },

    async updateReturnRequest(id, patch, actorUserId) {
      const req = state.returnRequests.find((r) => r.id === id);
      if (!req) throw new AppError(404, 'Return request not found.', 'NOT_FOUND');
      Object.assign(req, patch, { updatedAt: new Date().toISOString() });
      state.auditLogs.unshift({
        id: genId('aud'),
        actorUserId,
        actorRole: 'ADMIN',
        action: 'RETURN_REQUEST_UPDATED',
        entityType: 'ReturnRequest',
        entityId: id,
        metadata: patch,
        createdAt: new Date().toISOString(),
      });
      persist();
      return clone(req);
    },

    async createAuditLog(entry) {
      const log = {
        id: genId('aud'),
        ...entry,
        createdAt: new Date().toISOString(),
      };
      state.auditLogs.unshift(log);
      persist();
      return clone(log);
    },

    async listAuditLogs({ limit = 50 } = {}) {
      return clone(state.auditLogs.slice(0, limit));
    },

    async createNotificationJob(job) {
      const record = {
        id: genId('ntf'),
        ...job,
        status: job.status || 'PENDING',
        attempts: 0,
        createdAt: new Date().toISOString(),
      };
      state.notificationJobs.unshift(record);
      persist();
      return clone(record);
    },

    async updateNotificationJob(id, patch) {
      const job = state.notificationJobs.find((j) => j.id === id);
      if (!job) return null;
      Object.assign(job, patch);
      persist();
      return clone(job);
    },
  };
}
