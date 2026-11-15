import {
  mapOrderStatusToDb,
  sanitizePublicUser,
  serializeInvoice,
  serializeOrder,
  serializePayment,
  serializeProduct,
} from './serialize.js';
import { minorToDecimalString } from '../utils/money.js';
import { WEIGHT_OPTIONS } from '../../src/data/catalog.js';
import { AppError } from '../middleware/errorHandler.js';

export function createPrismaStoreRepository(prisma, config) {
  return {
    mode: 'mysql-prisma',
    prisma,

    async getCatalog({ includeArchived = false, includeHidden = false } = {}) {
      const products = await prisma.product.findMany({
        where: {
          ...(includeArchived ? {} : { isArchived: false }),
          ...(includeHidden ? {} : { isVisible: true }),
        },
        include: {
          category: true,
          variants: { orderBy: { grams: 'asc' } },
          images: { orderBy: { sortOrder: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
      });
      return products.map(serializeProduct);
    },

    async getProductById(id) {
      const p = await prisma.product.findUnique({
        where: { id },
        include: {
          category: true,
          variants: { orderBy: { grams: 'asc' } },
          images: { orderBy: { sortOrder: 'asc' } },
        },
      });
      return p ? serializeProduct(p) : null;
    },

    async createProduct(input, actorUserId) {
      const category = await prisma.category.findUnique({ where: { slug: input.category } });
      if (!category) throw new AppError(400, 'Invalid product category.', 'INVALID_CATEGORY');

      const productId = input.id || `prod-${Date.now()}`;
      const created = await prisma.$transaction(async (tx) => {
        const prod = await tx.product.create({
          data: {
            id: productId,
            slug: input.slug,
            name: input.name,
            categoryId: category.id,
            origin: input.origin,
            harvestBatch: input.harvestBatch,
            roastProfile: input.roastProfile,
            roastLabel: input.roastLabel,
            shortDescription: input.shortDescription,
            tastingNotes: input.tastingNotes,
            nutritionPerServing: input.nutritionPerServing,
            dietaryTags: input.dietaryTags || [],
            allergens: input.allergens || [],
            featuredTag: input.featuredTag || null,
            isVisible: input.isVisible !== false,
            isArchived: false,
          },
        });

        for (const sizeKey of ['8oz', '16oz', '32oz']) {
          const opt = WEIGHT_OPTIONS[sizeKey];
          const vInput = input.variants?.[sizeKey] || {};
          const priceMinor =
            vInput.priceMinor != null
              ? Number(vInput.priceMinor)
              : Math.round(Number(input.basePrice16oz) * opt.priceMultiplier * 100);
          const stockQty = vInput.stockQuantity != null ? Number(vInput.stockQuantity) : 40;
          await tx.productVariant.create({
            data: {
              productId: prod.id,
              sku: vInput.sku || `${prod.id.toUpperCase()}-${sizeKey.toUpperCase()}`,
              weightSize: sizeKey,
              weightLabel: opt.label,
              grams: opt.grams,
              currency: config.storeCurrency,
              priceMinor,
              priceDecimal: minorToDecimalString(priceMinor),
              stockQuantity: stockQty,
              reservedStock: 0,
              lowStockThreshold: Number(vInput.lowStockThreshold ?? 8),
              isActive: true,
            },
          });
        }

        if (input.imageUrl) {
          await tx.productImage.create({
            data: {
              productId: prod.id,
              url: input.imageUrl,
              provider: 'local',
              altText: input.name,
              sortOrder: 0,
              isPrimary: true,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            actorUserId,
            actorRole: 'ADMIN',
            action: 'PRODUCT_CREATED',
            entityType: 'Product',
            entityId: prod.id,
            metadata: { name: prod.name },
          },
        });

        return tx.product.findUnique({
          where: { id: prod.id },
          include: { category: true, variants: true, images: true },
        });
      });

      return serializeProduct(created);
    },

    async updateProduct(id, patch, actorUserId) {
      const updated = await prisma.$transaction(async (tx) => {
        let categoryId;
        if (patch.category) {
          const cat = await tx.category.findUnique({ where: { slug: patch.category } });
          if (!cat) throw new AppError(400, 'Invalid category.', 'INVALID_CATEGORY');
          categoryId = cat.id;
        }

        await tx.product.update({
          where: { id },
          data: {
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(categoryId ? { categoryId } : {}),
            ...(patch.origin !== undefined ? { origin: patch.origin } : {}),
            ...(patch.harvestBatch !== undefined ? { harvestBatch: patch.harvestBatch } : {}),
            ...(patch.roastProfile !== undefined ? { roastProfile: patch.roastProfile } : {}),
            ...(patch.roastLabel !== undefined ? { roastLabel: patch.roastLabel } : {}),
            ...(patch.shortDescription !== undefined ? { shortDescription: patch.shortDescription } : {}),
            ...(patch.tastingNotes !== undefined ? { tastingNotes: patch.tastingNotes } : {}),
            ...(patch.featuredTag !== undefined ? { featuredTag: patch.featuredTag || null } : {}),
            ...(typeof patch.isVisible === 'boolean' ? { isVisible: patch.isVisible } : {}),
            ...(typeof patch.isArchived === 'boolean' ? { isArchived: patch.isArchived } : {}),
          },
        });

        if (patch.basePrice16oz != null) {
          for (const sizeKey of ['8oz', '16oz', '32oz']) {
            const opt = WEIGHT_OPTIONS[sizeKey];
            const priceMinor = Math.round(Number(patch.basePrice16oz) * opt.priceMultiplier * 100);
            await tx.productVariant.updateMany({
              where: { productId: id, weightSize: sizeKey },
              data: { priceMinor, priceDecimal: minorToDecimalString(priceMinor) },
            });
          }
        }

        await tx.auditLog.create({
          data: {
            actorUserId,
            actorRole: 'ADMIN',
            action: 'PRODUCT_UPDATED',
            entityType: 'Product',
            entityId: id,
            metadata: { fields: Object.keys(patch) },
          },
        });

        return tx.product.findUnique({
          where: { id },
          include: { category: true, variants: true, images: true },
        });
      });
      return serializeProduct(updated);
    },

    async addProductImage(productId, img, actorUserId) {
      return prisma.$transaction(async (tx) => {
        if (img.isPrimary) {
          await tx.productImage.updateMany({
            where: { productId },
            data: { isPrimary: false },
          });
        }
        const created = await tx.productImage.create({
          data: {
            productId,
            url: img.url,
            storageKey: img.storageKey || null,
            provider: img.provider || 'local',
            altText: img.altText || 'Product harvest photo',
            sortOrder: img.sortOrder ?? 0,
            isPrimary: Boolean(img.isPrimary),
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId,
            actorRole: 'ADMIN',
            action: 'PRODUCT_IMAGE_ADDED',
            entityType: 'ProductImage',
            entityId: created.id,
            metadata: { productId, url: img.url },
          },
        });
        return created;
      });
    },

    async deleteProductImage(imageId, actorUserId) {
      return prisma.$transaction(async (tx) => {
        const img = await tx.productImage.delete({ where: { id: imageId } });
        await tx.auditLog.create({
          data: {
            actorUserId,
            actorRole: 'ADMIN',
            action: 'PRODUCT_IMAGE_DELETED',
            entityType: 'ProductImage',
            entityId: imageId,
            metadata: { productId: img.productId },
          },
        });
        return img;
      });
    },

    async adjustVariantInventory(variantId, { delta, setQuantity, lowStockThreshold, priceMinor, reason, actorUserId }) {
      return prisma.$transaction(async (tx) => {
        const variant = await tx.productVariant.findUnique({ where: { id: variantId } });
        if (!variant) throw new AppError(404, 'Product variant not found.', 'NOT_FOUND');

        const nextStock =
          setQuantity != null ? Number(setQuantity) : variant.stockQuantity + Number(delta || 0);
        if (nextStock < variant.reservedStock) {
          throw new AppError(
            409,
            `Stock quantity (${nextStock}) cannot be below reserved stock (${variant.reservedStock}).`,
            'INVALID_STOCK_LEVEL'
          );
        }
        if (nextStock < 0) {
          throw new AppError(409, 'Stock quantity cannot be negative.', 'NEGATIVE_STOCK');
        }

        const quantityDelta = nextStock - variant.stockQuantity;
        const updated = await tx.productVariant.update({
          where: { id: variantId },
          data: {
            stockQuantity: nextStock,
            ...(lowStockThreshold != null ? { lowStockThreshold: Number(lowStockThreshold) } : {}),
            ...(priceMinor != null
              ? { priceMinor: Number(priceMinor), priceDecimal: minorToDecimalString(priceMinor) }
              : {}),
          },
        });

        if (quantityDelta !== 0) {
          await tx.inventoryMovement.create({
            data: {
              variantId,
              actorUserId,
              type: quantityDelta > 0 ? 'RESTOCK' : 'ADJUSTMENT',
              quantityDelta,
              balanceAfter: nextStock,
              reservedAfter: variant.reservedStock,
              reason: reason || 'Admin inventory adjustment',
            },
          });
        }

        await tx.auditLog.create({
          data: {
            actorUserId,
            actorRole: 'ADMIN',
            action: 'INVENTORY_ADJUSTED',
            entityType: 'ProductVariant',
            entityId: variantId,
            metadata: { sku: variant.sku, quantityDelta, nextStock, reason },
          },
        });

        return updated;
      });
    },

    async listReviews() {
      const reviews = await prisma.review.findMany({ orderBy: { createdAt: 'desc' } });
      return reviews.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      }));
    },

    async createReview(data) {
      const created = await prisma.review.create({ data });
      return { ...created, createdAt: created.createdAt.toISOString() };
    },

    async findReviewById(id) {
      return prisma.review.findUnique({ where: { id } });
    },

    async deleteReview(id) {
      await prisma.review.delete({ where: { id } });
    },

    async findUserById(id) {
      return prisma.user.findUnique({
        where: { id },
        include: {
          preference: true,
          addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
          savedPaymentMethods: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
        },
      });
    },

    async findUserByEmail(email) {
      return prisma.user.findUnique({
        where: { email: String(email).trim().toLowerCase() },
        include: {
          preference: true,
          addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
          savedPaymentMethods: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
        },
      });
    },

    async findUserByVerifyTokenHash(verifyTokenHash) {
      return prisma.user.findFirst({ where: { verifyTokenHash } });
    },

    async findUserByResetTokenHash(resetTokenHash) {
      return prisma.user.findFirst({ where: { resetTokenHash } });
    },

    async createUser(data) {
      return prisma.user.create({
        data: {
          email: data.email,
          fullName: data.fullName,
          role: data.role || 'CUSTOMER',
          status: 'ACTIVE',
          passwordHash: data.passwordHash,
          passwordAlgo: data.passwordAlgo || 'bcrypt',
          passwordSalt: data.passwordSalt || null,
          verifyTokenHash: data.verifyTokenHash || null,
          verifyTokenExpiresAt: data.verifyTokenExpiresAt || null,
          preference: {
            create: {
              preferredRoast: 'raw_sprouted',
              dietaryGoals: ['omega3', 'heart_healthy'],
              excludedAllergens: [],
              wishlistProductIds: [],
              emailUpdates: true,
              smsDeliveryAlerts: false,
            },
          },
        },
        include: { preference: true, addresses: true, savedPaymentMethods: true },
      });
    },

    async updateUser(id, patch) {
      return prisma.user.update({
        where: { id },
        data: patch,
        include: { preference: true, addresses: true, savedPaymentMethods: true },
      });
    },

    async listUsers({ search = '', page = 1, pageSize = 25 } = {}) {
      const q = search.trim();
      const where = q
        ? {
            OR: [{ email: { contains: q } }, { fullName: { contains: q } }],
          }
        : {};
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          include: { _count: { select: { orders: true } } },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.user.count({ where }),
      ]);
      return {
        users: users.map((u) => ({ ...sanitizePublicUser(u), orderCount: u._count.orders })),
        total,
        page,
        pageSize,
      };
    },

    async createSession(data) {
      return prisma.userSession.create({ data });
    },

    async findActiveSessionByTokenHash(sessionTokenHash) {
      return prisma.userSession.findFirst({
        where: { sessionTokenHash, revokedAt: null },
        include: {
          user: {
            include: {
              preference: true,
              addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
              savedPaymentMethods: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
            },
          },
        },
      });
    },

    async touchSession(id) {
      await prisma.userSession.update({ where: { id }, data: { lastSeenAt: new Date() } });
    },

    async revokeSessionById(id) {
      await prisma.userSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
    },

    async revokeAllUserSessions(userId) {
      await prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },

    async updateUserPreferences(userId, patch) {
      const prefData = {};
      if (patch.preferredRoast !== undefined) prefData.preferredRoast = patch.preferredRoast;
      if (patch.dietaryGoals !== undefined) prefData.dietaryGoals = patch.dietaryGoals;
      if (patch.excludedAllergens !== undefined) prefData.excludedAllergens = patch.excludedAllergens;
      if (patch.wishlistProductIds !== undefined) prefData.wishlistProductIds = patch.wishlistProductIds;
      if (typeof patch.emailUpdates === 'boolean') prefData.emailUpdates = patch.emailUpdates;
      if (typeof patch.smsDeliveryAlerts === 'boolean') prefData.smsDeliveryAlerts = patch.smsDeliveryAlerts;

      await prisma.customerPreference.upsert({
        where: { userId },
        update: prefData,
        create: {
          userId,
          preferredRoast: prefData.preferredRoast || 'raw_sprouted',
          dietaryGoals: prefData.dietaryGoals || ['omega3', 'heart_healthy'],
          excludedAllergens: prefData.excludedAllergens || [],
          wishlistProductIds: prefData.wishlistProductIds || [],
          emailUpdates: prefData.emailUpdates ?? true,
          smsDeliveryAlerts: prefData.smsDeliveryAlerts ?? false,
        },
      });

      if (patch.shippingAddress && patch.shippingAddress.street) {
        const existingDefault = await prisma.address.findFirst({ where: { userId, isDefault: true } });
        if (existingDefault) {
          await prisma.address.update({
            where: { id: existingDefault.id },
            data: {
              fullName: patch.shippingAddress.fullName || existingDefault.fullName,
              street: patch.shippingAddress.street,
              city: patch.shippingAddress.city || '',
              state: patch.shippingAddress.state || 'OR',
              postalCode: patch.shippingAddress.postalCode || '',
              phone: patch.shippingAddress.phone || '',
            },
          });
        } else {
          await prisma.address.create({
            data: {
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
            },
          });
        }
      }

      return this.findUserById(userId);
    },

    async listAddresses(userId) {
      return prisma.address.findMany({
        where: { userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });
    },

    async createAddress(userId, addr) {
      return prisma.$transaction(async (tx) => {
        const count = await tx.address.count({ where: { userId } });
        const makeDefault = Boolean(addr.isDefault) || count === 0;
        if (makeDefault) {
          await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
        }
        return tx.address.create({
          data: {
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
          },
        });
      });
    },

    async setDefaultAddress(userId, addressId) {
      return prisma.$transaction(async (tx) => {
        const target = await tx.address.findFirst({ where: { id: addressId, userId } });
        if (!target) throw new AppError(404, 'Address not found.', 'NOT_FOUND');
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
        return tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
      });
    },

    async deleteAddress(userId, addressId) {
      const target = await prisma.address.findFirst({ where: { id: addressId, userId } });
      if (!target) throw new AppError(404, 'Address not found.', 'NOT_FOUND');
      await prisma.address.delete({ where: { id: addressId } });
    },

    async addSavedPaymentMethod(userId, card) {
      return prisma.$transaction(async (tx) => {
        const count = await tx.savedPaymentMethod.count({ where: { userId } });
        const isDefault = Boolean(card.setAsDefault) || count === 0;
        if (isDefault) {
          await tx.savedPaymentMethod.updateMany({ where: { userId }, data: { isDefault: false } });
        }
        return tx.savedPaymentMethod.create({
          data: {
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
          },
        });
      });
    },

    async setDefaultSavedPaymentMethod(userId, cardId) {
      return prisma.$transaction(async (tx) => {
        const exists = await tx.savedPaymentMethod.findFirst({ where: { id: cardId, userId } });
        if (!exists) throw new AppError(404, 'Payment method not found.', 'NOT_FOUND');
        await tx.savedPaymentMethod.updateMany({ where: { userId }, data: { isDefault: false } });
        return tx.savedPaymentMethod.update({ where: { id: cardId }, data: { isDefault: true } });
      });
    },

    async deleteSavedPaymentMethod(userId, cardId) {
      const card = await prisma.savedPaymentMethod.findFirst({ where: { id: cardId, userId } });
      if (!card) throw new AppError(404, 'Payment method not found.', 'NOT_FOUND');
      const count = await prisma.savedPaymentMethod.count({ where: { userId } });
      if (card.isDefault || count <= 1) {
        throw new AppError(400, 'Cannot remove your active default payment method.', 'DEFAULT_CARD_LOCKED');
      }
      await prisma.savedPaymentMethod.delete({ where: { id: cardId } });
    },

    async findCouponByCode(code) {
      if (!code) return null;
      return prisma.coupon.findUnique({ where: { code: String(code).trim().toUpperCase() } });
    },

    async listCoupons() {
      return prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    },

    async createCoupon(data, actorUserId) {
      const coupon = await prisma.coupon.create({ data });
      await prisma.auditLog.create({
        data: {
          actorUserId,
          actorRole: 'ADMIN',
          action: 'COUPON_CREATED',
          entityType: 'Coupon',
          entityId: coupon.id,
          metadata: { code: coupon.code },
        },
      });
      return coupon;
    },

    async getStoreSettings() {
      const rows = await prisma.storeSetting.findMany();
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },

    async updateStoreSetting(key, value, actorUserId) {
      return prisma.storeSetting.upsert({
        where: { key },
        update: { value, updatedByUserId: actorUserId },
        create: { key, value, updatedByUserId: actorUserId },
      });
    },

    async listOrdersForUser(userId) {
      const orders = await prisma.order.findMany({
        where: { userId, isLive: true, archivedAt: null },
        include: { items: true, payments: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
        orderBy: { placedAt: 'desc' },
      });
      return orders.map(serializeOrder);
    },

    async listAllOrders({ page = 1, pageSize = 100 } = {}) {
      const orders = await prisma.order.findMany({
        where: { archivedAt: null },
        include: { items: true, payments: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
        orderBy: { placedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });
      return orders.map(serializeOrder);
    },

    async findOrderById(id) {
      const ord = await prisma.order.findUnique({
        where: { id },
        include: { items: true, payments: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
      });
      return ord ? serializeOrder(ord) : null;
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
      return prisma.$transaction(async (tx) => {
        if (reserveStock || commitStock) {
          for (const line of orderItemsData) {
            if (!line.variantId) continue;
            const variant = await tx.productVariant.findUnique({ where: { id: line.variantId } });
            if (!variant || !variant.isActive) {
              throw new AppError(400, `Variant unavailable for ${line.productNameSnapshot}.`, 'VARIANT_UNAVAILABLE');
            }
            const available = variant.stockQuantity - variant.reservedStock;
            if (available < line.quantity) {
              throw new AppError(
                409,
                `Insufficient inventory for ${line.productNameSnapshot} (${line.weightSize}). Available: ${available}.`,
                'INSUFFICIENT_STOCK'
              );
            }
            if (commitStock) {
              const nextStock = variant.stockQuantity - line.quantity;
              await tx.productVariant.update({
                where: { id: variant.id },
                data: { stockQuantity: nextStock },
              });
              await tx.inventoryMovement.create({
                data: {
                  variantId: variant.id,
                  actorUserId,
                  type: 'COMMIT',
                  quantityDelta: -line.quantity,
                  balanceAfter: nextStock,
                  reservedAfter: variant.reservedStock,
                  reason: `Committed on order ${orderData.orderNumber}`,
                },
              });
            } else {
              const nextReserved = variant.reservedStock + line.quantity;
              await tx.productVariant.update({
                where: { id: variant.id },
                data: { reservedStock: nextReserved },
              });
              await tx.inventoryMovement.create({
                data: {
                  variantId: variant.id,
                  actorUserId,
                  type: 'RESERVE',
                  quantityDelta: 0,
                  balanceAfter: variant.stockQuantity,
                  reservedAfter: nextReserved,
                  reason: `Reserved for order ${orderData.orderNumber}`,
                },
              });
            }
          }
        }

        if (couponId) {
          await tx.coupon.update({
            where: { id: couponId },
            data: { usedCount: { increment: 1 } },
          });
        }

        const createdOrder = await tx.order.create({
          data: {
            ...orderData,
            items: { create: orderItemsData },
            statusHistory: {
              create: {
                fromStatus: null,
                toStatus: orderData.status,
                actorUserId,
                note: orderData.source === 'admin' ? 'Created in Admin Console' : 'Order created',
              },
            },
          },
          include: { items: true, payments: true, statusHistory: true },
        });

        let createdPayment = null;
        if (paymentData) {
          createdPayment = await tx.payment.create({
            data: {
              ...paymentData,
              orderId: createdOrder.id,
            },
          });
        }

        let createdInvoice = null;
        if (invoiceData) {
          createdInvoice = await tx.invoice.create({
            data: {
              ...invoiceData,
              orderId: createdOrder.id,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            actorUserId,
            actorRole: orderData.source === 'admin' ? 'ADMIN' : 'CUSTOMER',
            action: 'ORDER_CREATED',
            entityType: 'Order',
            entityId: createdOrder.id,
            metadata: {
              orderNumber: createdOrder.orderNumber,
              totalMinor: createdOrder.totalMinor,
              currency: createdOrder.currency,
            },
          },
        });

        const reloaded = await tx.order.findUnique({
          where: { id: createdOrder.id },
          include: { items: true, payments: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
        });

        return {
          order: serializeOrder(reloaded),
          payment: createdPayment ? serializePayment(createdPayment) : null,
          invoice: createdInvoice ? serializeInvoice(createdInvoice) : null,
        };
      });
    },

    async updateOrder(orderId, patch, actorUserId) {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.order.findUnique({
          where: { id: orderId },
          include: { items: true },
        });
        if (!existing) throw new AppError(404, 'Order not found.', 'NOT_FOUND');

        const nextStatus = patch.status ? mapOrderStatusToDb(patch.status) : existing.status;

        if (nextStatus === 'CANCELLED' && existing.status !== 'CANCELLED') {
          const movements = await tx.inventoryMovement.findMany({ where: { orderId } });
          const wasCommitted = movements.some((m) => m.type === 'COMMIT');
          for (const line of existing.items) {
            if (!line.variantId) continue;
            const variant = await tx.productVariant.findUnique({ where: { id: line.variantId } });
            if (!variant) continue;
            if (wasCommitted) {
              const nextStock = variant.stockQuantity + line.quantity;
              await tx.productVariant.update({
                where: { id: variant.id },
                data: { stockQuantity: nextStock },
              });
              await tx.inventoryMovement.create({
                data: {
                  variantId: variant.id,
                  orderId,
                  actorUserId,
                  type: 'RETURN',
                  quantityDelta: line.quantity,
                  balanceAfter: nextStock,
                  reservedAfter: variant.reservedStock,
                  reason: `Returned on cancellation of ${existing.orderNumber}`,
                },
              });
            } else {
              const releaseQty = Math.min(variant.reservedStock, line.quantity);
              if (releaseQty > 0) {
                const nextReserved = variant.reservedStock - releaseQty;
                await tx.productVariant.update({
                  where: { id: variant.id },
                  data: { reservedStock: nextReserved },
                });
                await tx.inventoryMovement.create({
                  data: {
                    variantId: variant.id,
                    orderId,
                    actorUserId,
                    type: 'RELEASE',
                    quantityDelta: 0,
                    balanceAfter: variant.stockQuantity,
                    reservedAfter: nextReserved,
                    reason: `Released on cancellation of ${existing.orderNumber}`,
                  },
                });
              }
            }
          }
        }

        await tx.order.update({
          where: { id: orderId },
          data: {
            ...(patch.status !== undefined ? { status: nextStatus } : {}),
            ...(patch.paymentStatus !== undefined ? { paymentStatus: patch.paymentStatus } : {}),
            ...(typeof patch.isLive === 'boolean' ? { isLive: patch.isLive } : {}),
            ...(patch.trackingNumber !== undefined ? { trackingNumber: patch.trackingNumber } : {}),
            ...(patch.estimatedDelivery !== undefined ? { estimatedDelivery: patch.estimatedDelivery } : {}),
            ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          },
        });

        if (patch.status !== undefined && nextStatus !== existing.status) {
          await tx.orderStatusHistory.create({
            data: {
              orderId,
              fromStatus: existing.status,
              toStatus: nextStatus,
              actorUserId,
              note: patch.statusNote || 'Updated by admin',
            },
          });
        }

        await tx.auditLog.create({
          data: {
            actorUserId,
            actorRole: 'ADMIN',
            action: 'ORDER_UPDATED',
            entityType: 'Order',
            entityId: orderId,
            metadata: patch,
          },
        });

        const reloaded = await tx.order.findUnique({
          where: { id: orderId },
          include: { items: true, payments: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
        });
        return serializeOrder(reloaded);
      });
    },

    async archiveOrder(orderId, actorUserId) {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
        if (!existing) throw new AppError(404, 'Order not found.', 'NOT_FOUND');

        if (existing.status === 'AWAITING_PAYMENT') {
          for (const line of existing.items) {
            if (!line.variantId) continue;
            const variant = await tx.productVariant.findUnique({ where: { id: line.variantId } });
            if (!variant) continue;
            const releaseQty = Math.min(variant.reservedStock, line.quantity);
            if (releaseQty > 0) {
              await tx.productVariant.update({
                where: { id: variant.id },
                data: { reservedStock: variant.reservedStock - releaseQty },
              });
            }
          }
        }

        await tx.order.update({
          where: { id: orderId },
          data: { archivedAt: new Date(), isLive: false },
        });

        await tx.auditLog.create({
          data: {
            actorUserId,
            actorRole: 'ADMIN',
            action: 'ORDER_ARCHIVED',
            entityType: 'Order',
            entityId: orderId,
            metadata: { orderNumber: existing.orderNumber },
          },
        });
      });
    },

    async findPaymentById(id) {
      const p = await prisma.payment.findUnique({ where: { id } });
      return serializePayment(p);
    },

    async findPaymentByReference(paymentReference) {
      const p = await prisma.payment.findUnique({ where: { paymentReference } });
      return serializePayment(p);
    },

    async findPaymentByExternalOrderId(externalOrderId) {
      const p = await prisma.payment.findFirst({ where: { externalOrderId } });
      return serializePayment(p);
    },

    async findPaymentsByUtr(utrNumber) {
      const rows = await prisma.payment.findMany({
        where: { utrNumber },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(serializePayment);
    },

    async listPayments({ status, provider } = {}) {
      const rows = await prisma.payment.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(provider ? { provider } : {}),
        },
        include: {
          order: { select: { orderNumber: true, shippingAddress: true, userId: true, status: true } },
          user: { select: { id: true, email: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((p) => ({
        ...serializePayment(p),
        orderNumber: p.order?.orderNumber || '',
        customerName: p.user?.fullName || p.order?.shippingAddress?.fullName || 'Guest',
        customerEmail: p.user?.email || '',
      }));
    },

    async createPaymentRecord(data) {
      const created = await prisma.payment.create({ data });
      return serializePayment(created);
    },

    async updatePaymentRecord(id, patch) {
      const updated = await prisma.payment.update({ where: { id }, data: patch });
      return serializePayment(updated);
    },

    async confirmPaymentAndCommitOrder({
      paymentId,
      externalPaymentId = null,
      verifiedByUserId = null,
      verificationNotes = null,
      actorRole = 'SYSTEM',
    }) {
      return prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({ where: { id: paymentId } });
        if (!payment) throw new AppError(404, 'Payment record not found.', 'NOT_FOUND');

        if (payment.status === 'CAPTURED') {
          const ord = await tx.order.findUnique({
            where: { id: payment.orderId },
            include: { items: true, payments: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
          });
          return { payment: serializePayment(payment), order: serializeOrder(ord) };
        }

        const order = await tx.order.findUnique({
          where: { id: payment.orderId },
          include: { items: true },
        });
        if (!order) throw new AppError(404, 'Order not found.', 'NOT_FOUND');

        if (payment.amountMinor !== order.totalMinor || payment.currency !== order.currency) {
          throw new AppError(400, 'Payment amount/currency mismatch with order total.', 'AMOUNT_MISMATCH');
        }

        const updatedPayment = await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: 'CAPTURED',
            ...(externalPaymentId ? { externalPaymentId } : {}),
            ...(verifiedByUserId ? { verifiedByUserId } : {}),
            verifiedAt: new Date(),
            ...(verificationNotes ? { verificationNotes } : {}),
          },
        });

        // Commit reserved stock (or deduct if not yet reserved)
        const existingCommits = await tx.inventoryMovement.findMany({
          where: { orderId: order.id, type: 'COMMIT' },
        });
        if (existingCommits.length === 0) {
          for (const line of order.items) {
            if (!line.variantId) continue;
            const variant = await tx.productVariant.findUnique({ where: { id: line.variantId } });
            if (!variant) continue;
            const releaseReserved = Math.min(variant.reservedStock, line.quantity);
            const nextStock = variant.stockQuantity - line.quantity;
            if (nextStock < 0) {
              throw new AppError(409, `Insufficient stock to commit ${line.productNameSnapshot}.`, 'INSUFFICIENT_STOCK');
            }
            const nextReserved = variant.reservedStock - releaseReserved;
            await tx.productVariant.update({
              where: { id: variant.id },
              data: { stockQuantity: nextStock, reservedStock: nextReserved },
            });
            await tx.inventoryMovement.create({
              data: {
                variantId: variant.id,
                orderId: order.id,
                actorUserId: verifiedByUserId,
                type: 'COMMIT',
                quantityDelta: -line.quantity,
                balanceAfter: nextStock,
                reservedAfter: nextReserved,
                reason: `Payment verified for ${order.orderNumber}`,
              },
            });
          }
        }

        const nextOrderStatus = order.status === 'AWAITING_PAYMENT' ? 'PLACED' : order.status;
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: nextOrderStatus,
            paymentStatus: 'CAPTURED',
            isLive: true,
          },
        });

        if (nextOrderStatus !== order.status) {
          await tx.orderStatusHistory.create({
            data: {
              orderId: order.id,
              fromStatus: order.status,
              toStatus: nextOrderStatus,
              actorUserId: verifiedByUserId,
              note: `Payment verified (${payment.provider})`,
            },
          });
        }

        await tx.invoice.updateMany({
          where: { orderId: order.id },
          data: { status: 'PAID', paidAt: new Date() },
        });

        await tx.auditLog.create({
          data: {
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
          },
        });

        const reloadedOrder = await tx.order.findUnique({
          where: { id: order.id },
          include: { items: true, payments: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
        });

        return {
          payment: serializePayment(updatedPayment),
          order: serializeOrder(reloadedOrder),
        };
      });
    },

    async rejectPaymentRecord({ paymentId, verifiedByUserId, rejectionReason, verificationNotes }) {
      return prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({ where: { id: paymentId } });
        if (!payment) throw new AppError(404, 'Payment not found.', 'NOT_FOUND');

        const updatedPayment = await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: 'REJECTED',
            verifiedByUserId,
            verifiedAt: new Date(),
            rejectionReason: rejectionReason || 'Transaction could not be verified.',
            verificationNotes: verificationNotes || null,
          },
        });

        await tx.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: 'REJECTED' },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: verifiedByUserId,
            actorRole: 'ADMIN',
            action: 'PAYMENT_REJECTED',
            entityType: 'Payment',
            entityId: payment.id,
            metadata: {
              orderId: payment.orderId,
              rejectionReason,
              utrNumber: payment.utrNumber,
            },
          },
        });

        return serializePayment(updatedPayment);
      });
    },

    async markPaymentRefunded({ paymentId, refundMinor, refundStatus, actorUserId, reason }) {
      return prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({ where: { id: paymentId } });
        if (!payment) throw new AppError(404, 'Payment not found.', 'NOT_FOUND');

        const nextRefunded = Math.min(payment.amountMinor, (payment.refundedMinor || 0) + Number(refundMinor));
        const nextStatus = refundStatus || (nextRefunded >= payment.amountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED');

        const updatedPayment = await tx.payment.update({
          where: { id: paymentId },
          data: { refundedMinor: nextRefunded, status: nextStatus },
        });

        await tx.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: nextStatus },
        });

        if (nextStatus === 'REFUNDED') {
          await tx.invoice.updateMany({
            where: { orderId: payment.orderId },
            data: { status: 'REFUNDED' },
          });
        }

        await tx.auditLog.create({
          data: {
            actorUserId,
            actorRole: 'ADMIN',
            action: 'PAYMENT_REFUNDED',
            entityType: 'Payment',
            entityId: paymentId,
            metadata: { refundMinor, nextRefunded, nextStatus, reason },
          },
        });

        return serializePayment(updatedPayment);
      });
    },

    async recordWebhookEventIfNew({ provider, eventId, eventType, signatureValid, payload }) {
      try {
        const evt = await prisma.paymentWebhookEvent.create({
          data: { provider, eventId, eventType, signatureValid, payload },
        });
        return { duplicate: false, event: evt };
      } catch (err) {
        if (err?.code === 'P2002') {
          return { duplicate: true, event: null };
        }
        throw err;
      }
    },

    async listInvoicesForUser(userId) {
      const rows = await prisma.invoice.findMany({
        where: { userId },
        orderBy: { issuedAt: 'desc' },
      });
      return rows.map(serializeInvoice);
    },

    async listAllInvoices() {
      const rows = await prisma.invoice.findMany({ orderBy: { issuedAt: 'desc' } });
      return rows.map(serializeInvoice);
    },

    async findInvoiceByOrderId(orderId) {
      const inv = await prisma.invoice.findFirst({ where: { orderId } });
      return inv ? serializeInvoice(inv) : null;
    },

    async createReturnRequest({ orderId, userId, reason }) {
      return prisma.returnRequest.create({
        data: { orderId, userId, reason, status: 'REQUESTED' },
      });
    },

    async listReturnRequests({ userId } = {}) {
      return prisma.returnRequest.findMany({
        where: userId ? { userId } : {},
        include: { order: { select: { orderNumber: true, totalMinor: true, currency: true } } },
        orderBy: { createdAt: 'desc' },
      });
    },

    async updateReturnRequest(id, patch, actorUserId) {
      const updated = await prisma.returnRequest.update({
        where: { id },
        data: patch,
      });
      await prisma.auditLog.create({
        data: {
          actorUserId,
          actorRole: 'ADMIN',
          action: 'RETURN_REQUEST_UPDATED',
          entityType: 'ReturnRequest',
          entityId: id,
          metadata: patch,
        },
      });
      return updated;
    },

    async createAuditLog(entry) {
      return prisma.auditLog.create({ data: entry });
    },

    async listAuditLogs({ limit = 50 } = {}) {
      return prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
    },

    async createNotificationJob(job) {
      return prisma.notificationJob.create({ data: job });
    },

    async updateNotificationJob(id, patch) {
      return prisma.notificationJob.update({ where: { id }, data: patch });
    },
  };
}
