import { WEIGHT_OPTIONS } from '../../../src/data/catalog.js';
import { AppError } from '../../middleware/errorHandler.js';
import { calculateCouponDiscountMinor, calculateOrderTotalsMinor } from '../../utils/money.js';

export function createOrderService({ repo, config, emailService, broadcastEvent }) {
  async function validateCoupon(code, subtotalMinor) {
    if (!code) return null;
    const coupon = await repo.findCouponByCode(code);
    if (!coupon || !coupon.isActive) {
      throw new AppError(400, 'Promo code is invalid or inactive.', 'INVALID_COUPON');
    }
    if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
      throw new AppError(400, 'Promo code has expired.', 'COUPON_EXPIRED');
    }
    if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
      throw new AppError(400, 'Promo code usage limit has been reached.', 'COUPON_EXHAUSTED');
    }
    if (subtotalMinor < (coupon.minOrderMinor || 0)) {
      throw new AppError(
        400,
        `Minimum order of ${(coupon.minOrderMinor / 100).toFixed(2)} required for code ${coupon.code}.`,
        'COUPON_MIN_NOT_MET'
      );
    }
    return coupon;
  }

  async function resolveOrderLines(rawItems) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new AppError(400, 'Order must contain at least one harvest item.', 'EMPTY_ORDER');
    }
    const catalog = await repo.getCatalog({ includeArchived: false, includeHidden: true });
    const byProductId = new Map(catalog.map((p) => [p.id, p]));

    const resolved = [];
    for (const raw of rawItems) {
      const product = byProductId.get(raw.productId);
      if (!product) {
        throw new AppError(400, `Unknown product: ${raw.productId}`, 'PRODUCT_NOT_FOUND');
      }
      const weightSize = WEIGHT_OPTIONS[raw.weightSize] ? raw.weightSize : '16oz';
      const variant = (product.variants || []).find((v) => v.weightSize === weightSize);
      if (!variant) {
        throw new AppError(400, `Variant ${weightSize} unavailable for ${product.name}.`, 'VARIANT_UNAVAILABLE');
      }
      const quantity = Math.max(1, Math.min(25, Math.floor(Number(raw.quantity || 1))));
      if (variant.availableStock < quantity) {
        throw new AppError(
          409,
          `Only ${variant.availableStock} left in stock for ${product.name} (${variant.weightLabel}).`,
          'INSUFFICIENT_STOCK'
        );
      }

      resolved.push({
        productId: product.id,
        variantId: variant.id,
        skuSnapshot: variant.sku,
        productNameSnapshot: product.name,
        weightSize: variant.weightSize,
        weightLabel: variant.weightLabel,
        currency: variant.currency || config.storeCurrency,
        unitPriceMinor: variant.priceMinor,
        quantity,
        lineTotalMinor: variant.priceMinor * quantity,
      });
    }
    return resolved;
  }

  return {
    async previewCoupon({ code, items }) {
      const resolved = await resolveOrderLines(items);
      const subtotalMinor = resolved.reduce((sum, i) => sum + i.lineTotalMinor, 0);
      const coupon = await validateCoupon(code, subtotalMinor);
      const discountMinor = calculateCouponDiscountMinor(subtotalMinor, coupon);
      return {
        valid: true,
        code: coupon.code,
        description: coupon.description,
        discountMinor,
        discount: Number((discountMinor / 100).toFixed(2)),
      };
    },

    async placeCustomerOrder({
      user,
      items,
      shippingAddress,
      paymentMethodId,
      paymentProvider = 'CARD_TOKEN',
      couponCode = null,
      notes = '',
    }) {
      if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.street || !shippingAddress.city || !shippingAddress.postalCode) {
        throw new AppError(400, 'Complete shipping address details are required.', 'INVALID_ADDRESS');
      }

      const resolvedItems = await resolveOrderLines(items);
      const initialSubtotal = resolvedItems.reduce((sum, i) => sum + i.lineTotalMinor, 0);
      const coupon = couponCode ? await validateCoupon(couponCode, initialSubtotal) : null;

      const settings = await repo.getStoreSettings();
      const commerceCfg = settings.commerce_config || {};
      const freeShippingThresholdMinor =
        commerceCfg.freeShippingThresholdMinor ?? config.freeShippingThresholdMinor;
      const standardShippingFeeMinor =
        commerceCfg.standardShippingFeeMinor ?? config.standardShippingFeeMinor;

      const totals = calculateOrderTotalsMinor({
        lineItems: resolvedItems,
        freeShippingThresholdMinor,
        standardShippingFeeMinor,
        coupon,
      });

      const orderNum = `SG-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
      const invNum = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      const currency = config.storeCurrency;

      const providerNorm = String(paymentProvider || 'CARD_TOKEN').toUpperCase();
      let paymentSummary = 'Pending payment';
      let orderStatus = 'AWAITING_PAYMENT';
      let paymentStatus = 'PENDING';
      let invoiceStatus = 'UNPAID';
      let reserveStock = true;
      let commitStock = false;

      if (providerNorm === 'CARD_TOKEN') {
        const savedCards = user.savedPaymentMethods || [];
        const selectedCard =
          savedCards.find((c) => c.id === paymentMethodId) ||
          savedCards.find((c) => c.isDefault) ||
          savedCards[0];
        if (!selectedCard) {
          throw new AppError(
            400,
            'Please add a saved card in Billing or choose another payment method.',
            'NO_SAVED_CARD'
          );
        }
        paymentSummary = `${selectedCard.brand} •••• ${selectedCard.last4}`;
        orderStatus = 'PLACED';
        paymentStatus = 'CAPTURED';
        invoiceStatus = 'PAID';
        commitStock = true;
        reserveStock = false;
      } else if (providerNorm === 'UPI_QR') {
        paymentSummary = 'UPI QR (Pending Verification)';
        orderStatus = 'AWAITING_PAYMENT';
        paymentStatus = 'PENDING';
        invoiceStatus = 'UNPAID';
      } else if (providerNorm === 'RAZORPAY') {
        paymentSummary = 'Razorpay Checkout (Pending)';
      } else if (providerNorm === 'STRIPE') {
        paymentSummary = 'Stripe Checkout (Pending)';
      } else {
        throw new AppError(400, 'Unsupported payment method selected.', 'INVALID_PAYMENT_PROVIDER');
      }

      const eta = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const paymentReference = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

      const result = await repo.createOrderWithReservation({
        orderData: {
          userId: user.id,
          orderNumber: orderNum,
          status: orderStatus,
          paymentStatus,
          isLive: true,
          source: 'storefront',
          currency,
          ...totals,
          couponCode: coupon?.code || null,
          paymentSummary,
          trackingNumber:
            orderStatus === 'PLACED'
              ? `1Z999AA1${String(Math.floor(100000000 + Math.random() * 900000000))}`
              : 'Pending payment verification',
          estimatedDelivery: eta,
          notes: String(notes || '').slice(0, 500),
          shippingAddress: {
            fullName: shippingAddress.fullName,
            street: shippingAddress.street,
            city: shippingAddress.city,
            state: shippingAddress.state || '',
            postalCode: shippingAddress.postalCode,
            countryCode: shippingAddress.countryCode || 'US',
            phone: shippingAddress.phone || '',
          },
        },
        orderItemsData: resolvedItems,
        paymentData: {
          userId: user.id,
          provider: providerNorm,
          status: paymentStatus,
          currency,
          amountMinor: totals.totalMinor,
          paymentReference,
          ...(paymentStatus === 'CAPTURED' ? { verifiedAt: new Date() } : {}),
        },
        invoiceData: {
          userId: user.id,
          invoiceNumber: invNum,
          description: `Order ${orderNum} · ${resolvedItems.reduce((s, i) => s + i.quantity, 0)} Item(s)`,
          currency,
          ...totals,
          status: invoiceStatus,
          paymentMethodSummary: paymentSummary,
          ...(invoiceStatus === 'PAID' ? { paidAt: new Date() } : {}),
        },
        couponId: coupon?.id || null,
        reserveStock,
        commitStock,
        actorUserId: user.id,
      });

      broadcastEvent?.('orders:changed', { orderId: result.order.id, action: 'created' });
      emailService?.sendOrderPlacedEmail(user, result.order).catch(() => {});

      return result;
    },

    async createAdminOrder({ actorUser, body }) {
      const resolvedItems = await resolveOrderLines(body.items);
      const subtotalMinor = resolvedItems.reduce((s, i) => s + i.lineTotalMinor, 0);
      const totals = calculateOrderTotalsMinor({
        lineItems: resolvedItems,
        freeShippingThresholdMinor: config.freeShippingThresholdMinor,
        standardShippingFeeMinor: config.standardShippingFeeMinor,
      });

      const isLive = body.isLive !== false;
      const orderNum = `SG-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
      const invNum = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

      let targetUserId = body.userId || null;
      if (!targetUserId && body.customerEmail) {
        const matched = await repo.findUserByEmail(body.customerEmail);
        if (matched) targetUserId = matched.id;
      }

      const dbStatus = String(body.status || 'PLACED').toUpperCase();
      const paymentStatus = isLive && dbStatus !== 'AWAITING_PAYMENT' ? 'CAPTURED' : 'PENDING';

      const result = await repo.createOrderWithReservation({
        orderData: {
          userId: targetUserId,
          orderNumber: orderNum,
          status: dbStatus,
          paymentStatus,
          isLive,
          source: 'admin',
          currency: config.storeCurrency,
          subtotalMinor: totals.subtotalMinor || subtotalMinor,
          discountMinor: 0,
          shippingFeeMinor: totals.shippingFeeMinor,
          totalMinor: totals.totalMinor,
          paymentSummary: body.paymentSummary || 'Admin Invoice / Offline Settlement',
          trackingNumber: body.trackingNumber || 'Pending fulfillment scan',
          estimatedDelivery:
            body.estimatedDelivery || new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          notes: body.notes || '',
          shippingAddress: body.shippingAddress || {
            fullName: body.customerName || 'Orchard Customer',
            street: '',
            city: '',
            state: 'OR',
            postalCode: '',
            phone: '',
          },
        },
        orderItemsData: resolvedItems,
        paymentData: {
          userId: targetUserId,
          provider: 'ADMIN_INVOICE',
          status: paymentStatus,
          currency: config.storeCurrency,
          amountMinor: totals.totalMinor,
          paymentReference: `ADM-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        },
        invoiceData: {
          userId: targetUserId,
          invoiceNumber: invNum,
          description: `Order ${orderNum} · ${resolvedItems.reduce((s, i) => s + i.quantity, 0)} Item(s)`,
          currency: config.storeCurrency,
          ...totals,
          status: paymentStatus === 'CAPTURED' ? 'PAID' : 'UNPAID',
          paymentMethodSummary: body.paymentSummary || 'Admin Invoice',
          ...(paymentStatus === 'CAPTURED' ? { paidAt: new Date() } : {}),
        },
        reserveStock: !isLive,
        commitStock: isLive,
        actorUserId: actorUser.id,
      });

      broadcastEvent?.('orders:changed', { orderId: result.order.id, action: 'admin_created' });
      return result.order;
    },

    async updateAdminOrder(orderId, patch, actorUser) {
      const updated = await repo.updateOrder(orderId, patch, actorUser.id);
      if (updated.userId) {
        const customer = await repo.findUserById(updated.userId);
        if (customer && patch.status) {
          emailService?.sendOrderStatusUpdateEmail(customer, updated).catch(() => {});
        }
      }
      broadcastEvent?.('orders:changed', { orderId: updated.id, action: 'updated' });
      return updated;
    },

    async archiveAdminOrder(orderId, actorUser) {
      await repo.archiveOrder(orderId, actorUser.id);
      broadcastEvent?.('orders:changed', { orderId, action: 'archived' });
    },
  };
}
