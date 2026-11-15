import { minorToDecimal } from '../utils/money.js';

export function mapOrderStatusToFrontend(status) {
  return String(status || 'PLACED').toLowerCase();
}

export function mapOrderStatusToDb(status) {
  const s = String(status || 'PLACED').trim().toUpperCase();
  const valid = new Set(['AWAITING_PAYMENT', 'PLACED', 'PACKED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']);
  return valid.has(s) ? s : 'PLACED';
}

export function sanitizePublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: String(user.role || 'CUSTOMER').toLowerCase(),
    status: String(user.status || 'ACTIVE').toLowerCase(),
    emailVerified: Boolean(user.emailVerifiedAt),
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
  };
}

export function serializeProduct(product) {
  const variants = (product.variants || []).map((v) => {
    const availableStock = Math.max(0, Number(v.stockQuantity || 0) - Number(v.reservedStock || 0));
    return {
      id: v.id,
      sku: v.sku,
      weightSize: v.weightSize,
      weightLabel: v.weightLabel,
      grams: v.grams,
      currency: v.currency || 'USD',
      priceMinor: v.priceMinor,
      price: minorToDecimal(v.priceMinor),
      stockQuantity: v.stockQuantity,
      reservedStock: v.reservedStock,
      availableStock,
      lowStockThreshold: v.lowStockThreshold,
      isLowStock: availableStock <= v.lowStockThreshold,
      isActive: v.isActive !== false,
    };
  });

  const variant16 = variants.find((v) => v.weightSize === '16oz') || variants[0];
  const images = (product.images || [])
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((img) => ({
      id: img.id,
      url: img.url,
      altText: img.altText,
      isPrimary: Boolean(img.isPrimary),
      sortOrder: img.sortOrder ?? 0,
    }));

  const primaryImage = images.find((i) => i.isPrimary)?.url || images[0]?.url || '';
  const anyAvailable = variants.some((v) => v.isActive && v.availableStock > 0);

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category?.slug || product.categorySlug || product.category || 'walnuts',
    categoryLabel: product.category?.name || product.categoryLabel || 'Walnuts',
    origin: product.origin,
    harvestBatch: product.harvestBatch,
    roastProfile: product.roastProfile,
    roastLabel: product.roastLabel,
    basePrice16oz: variant16 ? variant16.price : Number(product.basePrice16oz || 0),
    basePrice16ozMinor: variant16 ? variant16.priceMinor : Math.round(Number(product.basePrice16oz || 0) * 100),
    currency: variant16?.currency || 'USD',
    imageUrl: primaryImage || product.imageUrl || '',
    images,
    variants,
    shortDescription: product.shortDescription,
    tastingNotes: product.tastingNotes,
    nutritionPerServing: product.nutritionPerServing,
    dietaryTags: Array.isArray(product.dietaryTags) ? product.dietaryTags : [],
    allergens: Array.isArray(product.allergens) ? product.allergens : [],
    featuredTag: product.featuredTag || undefined,
    isVisible: product.isVisible !== false,
    isArchived: Boolean(product.isArchived),
    inStock: anyAvailable && !product.isArchived,
  };
}

export function serializePayment(p) {
  if (!p) return null;
  return {
    id: p.id,
    orderId: p.orderId,
    userId: p.userId || null,
    provider: p.provider,
    status: p.status,
    currency: p.currency,
    amountMinor: p.amountMinor,
    amount: minorToDecimal(p.amountMinor),
    refundedMinor: p.refundedMinor || 0,
    paymentReference: p.paymentReference,
    externalOrderId: p.externalOrderId || null,
    externalPaymentId: p.externalPaymentId || null,
    upiUri: p.upiUri || null,
    qrExpiresAt: p.qrExpiresAt instanceof Date ? p.qrExpiresAt.toISOString() : p.qrExpiresAt || null,
    utrNumber: p.utrNumber || null,
    utrSubmittedAt:
      p.utrSubmittedAt instanceof Date ? p.utrSubmittedAt.toISOString() : p.utrSubmittedAt || null,
    verifiedByUserId: p.verifiedByUserId || null,
    verifiedAt: p.verifiedAt instanceof Date ? p.verifiedAt.toISOString() : p.verifiedAt || null,
    verificationNotes: p.verificationNotes || null,
    rejectionReason: p.rejectionReason || null,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
  };
}

export function serializeOrder(ord) {
  const latestPayment = Array.isArray(ord.payments) && ord.payments.length > 0
    ? ord.payments.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
    : null;

  return {
    id: ord.id,
    userId: ord.userId || null,
    orderNumber: ord.orderNumber,
    placedAt: ord.placedAt instanceof Date ? ord.placedAt.toISOString() : ord.placedAt,
    status: mapOrderStatusToFrontend(ord.status),
    paymentStatus: ord.paymentStatus || 'PENDING',
    isLive: ord.isLive !== false,
    source: ord.source || 'storefront',
    currency: ord.currency || 'USD',
    subtotalMinor: ord.subtotalMinor,
    shippingFeeMinor: ord.shippingFeeMinor,
    discountMinor: ord.discountMinor || 0,
    totalMinor: ord.totalMinor,
    subtotal: minorToDecimal(ord.subtotalMinor),
    shippingFee: minorToDecimal(ord.shippingFeeMinor),
    discount: minorToDecimal(ord.discountMinor || 0),
    total: minorToDecimal(ord.totalMinor),
    couponCode: ord.couponCode || null,
    paymentSummary: ord.paymentSummary,
    trackingNumber: ord.trackingNumber,
    estimatedDelivery: ord.estimatedDelivery || '',
    notes: ord.notes || '',
    shippingAddress: ord.shippingAddress || {},
    archivedAt: ord.archivedAt instanceof Date ? ord.archivedAt.toISOString() : ord.archivedAt || null,
    items: (ord.items || []).map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId || null,
      sku: item.skuSnapshot || item.sku || '',
      productName: item.productNameSnapshot || item.productName,
      weightSize: item.weightSize,
      weightLabel: item.weightLabel,
      currency: item.currency || ord.currency || 'USD',
      unitPriceMinor: item.unitPriceMinor,
      unitPrice: minorToDecimal(item.unitPriceMinor),
      quantity: item.quantity,
      lineTotalMinor: item.lineTotalMinor,
    })),
    payments: (ord.payments || []).map(serializePayment),
    latestPayment: latestPayment ? serializePayment(latestPayment) : null,
    statusHistory: (ord.statusHistory || []).map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus ? mapOrderStatusToFrontend(h.fromStatus) : null,
      toStatus: mapOrderStatusToFrontend(h.toStatus),
      note: h.note || '',
      createdAt: h.createdAt instanceof Date ? h.createdAt.toISOString() : h.createdAt,
    })),
  };
}

export function serializeInvoice(inv) {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    orderId: inv.orderId,
    userId: inv.userId || null,
    date:
      inv.issuedAt instanceof Date
        ? inv.issuedAt.toISOString().slice(0, 10)
        : String(inv.issuedAt || inv.date || '').slice(0, 10),
    description: inv.description,
    currency: inv.currency || 'USD',
    subtotalMinor: inv.subtotalMinor,
    shippingFeeMinor: inv.shippingFeeMinor,
    discountMinor: inv.discountMinor || 0,
    totalMinor: inv.totalMinor,
    amount: minorToDecimal(inv.totalMinor ?? Math.round(Number(inv.amount || 0) * 100)),
    status: String(inv.status || 'UNPAID').toLowerCase(),
    paymentMethodSummary: inv.paymentMethodSummary,
    paidAt: inv.paidAt instanceof Date ? inv.paidAt.toISOString() : inv.paidAt || null,
  };
}
