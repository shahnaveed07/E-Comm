import {
  FREE_SHIPPING_THRESHOLD,
  STANDARD_SHIPPING_FEE,
  WEIGHT_OPTIONS,
} from '../data/catalog.js';

export function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(value) {
  return `$${roundCurrency(value).toFixed(2)}`;
}

export function calculateUnitPrice(basePrice16oz, weightSize) {
  const multiplier = WEIGHT_OPTIONS[weightSize]?.priceMultiplier ?? 1;
  return roundCurrency(basePrice16oz * multiplier);
}

export function calculateCartTotals(items, catalog) {
  let itemCount = 0;
  let subtotal = 0;

  for (const item of items) {
    const product = catalog.find((p) => p.id === item.productId);
    if (!product || item.quantity <= 0) continue;

    const activeUnit = calculateUnitPrice(product.basePrice16oz, item.weightSize);
    itemCount += item.quantity;
    subtotal += activeUnit * item.quantity;
  }

  subtotal = roundCurrency(subtotal);
  const qualifiesForFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
  const shippingFee = itemCount === 0 ? 0 : qualifiesForFreeShipping ? 0 : STANDARD_SHIPPING_FEE;
  const freeShippingRemaining =
    qualifiesForFreeShipping || itemCount === 0
      ? 0
      : roundCurrency(Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal));
  const total = roundCurrency(subtotal + shippingFee);

  return {
    itemCount,
    subtotal,
    shippingFee,
    freeShippingRemaining,
    total,
  };
}

export function formatReadableDate(dateInput) {
  if (!dateInput) return '—';
  const clean = dateInput.slice(0, 10);
  const [y, m, d] = clean.split('-').map(Number);
  if (!y || !m || !d) return dateInput;
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function getPersonalizedRecommendations(
  catalog,
  preferences,
  orders,
  limit = 3
) {
  const orderedIds = new Set(
    orders.flatMap((order) => order.items.map((item) => item.productId))
  );

  const scored = [];

  for (const product of catalog) {
    const hasExcludedAllergen = product.allergens.some((allergen) =>
      preferences.excludedAllergens.includes(allergen)
    );
    if (hasExcludedAllergen || !product.inStock) {
      continue;
    }

    let score = 0;
    const reasons = [];

    if (product.roastProfile === preferences.preferredRoast) {
      score += 35;
      reasons.push(`Matches your ${product.roastLabel.toLowerCase()} roast preference`);
    }

    const matchingGoals = product.dietaryTags.filter((tag) =>
      preferences.dietaryGoals.includes(tag)
    );
    if (matchingGoals.length > 0) {
      score += matchingGoals.length * 22;
      const goalLabels = {
        omega3: 'Omega-3 ALA',
        high_protein: 'high-protein',
        keto: 'low-carb keto',
        heart_healthy: 'heart-healthy fats',
      };
      reasons.push(`Supports your ${goalLabels[matchingGoals[0]]} focus`);
    }

    if (!orderedIds.has(product.id)) {
      score += 20;
      if (reasons.length === 0) {
        reasons.push('Fresh seasonal variety to explore');
      }
    } else {
      score += 8;
      if (reasons.length === 0) {
        reasons.push('Previously enjoyed in your order history');
      }
    }

    scored.push({
      product,
      score,
      matchReason: reasons[0] || `Single-origin harvest from ${product.origin}`,
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function calculateAdminOrderMetrics(orders) {
  let liveCount = 0;
  let draftCount = 0;
  let awaitingPacking = 0;
  let inTransit = 0;
  let delivered = 0;
  let revenue = 0;

  for (const order of orders) {
    if (order.status === 'cancelled') continue;
    revenue += Number(order.total) || 0;

    if (order.isLive === false) {
      draftCount += 1;
    } else {
      liveCount += 1;
    }

    if (order.status === 'placed') awaitingPacking += 1;
    if (order.status === 'in_transit') inTransit += 1;
    if (order.status === 'delivered') delivered += 1;
  }

  return {
    totalOrders: orders.length,
    liveCount,
    draftCount,
    awaitingPacking,
    inTransit,
    delivered,
    revenue: roundCurrency(revenue),
  };
}

export function filterAdminOrders(orders, statusFilter, liveFilter, query) {
  const q = (query || '').trim().toLowerCase();
  return orders.filter((order) => {
    if (statusFilter !== 'all' && order.status !== statusFilter) return false;
    if (liveFilter === 'live' && order.isLive === false) return false;
    if (liveFilter === 'draft' && order.isLive !== false) return false;
    if (q) {
      const hay = `${order.orderNumber} ${order.trackingNumber} ${
        order.shippingAddress?.fullName || ''
      } ${order.shippingAddress?.city || ''} ${order.items
        .map((i) => i.productName)
        .join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function detectCardBrand(rawNumber) {
  const digits = rawNumber.replace(/\D/g, '');
  if (digits.startsWith('4')) return 'Visa';
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'Amex';
  return 'Discover';
}

export function passesLuhnCheck(digits) {
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function validatePaymentCard(input, referenceYear = 2026, referenceMonth = 11) {
  const errors = {};
  const digits = input.cardNumber.replace(/\D/g, '');

  if (digits.length < 15 || digits.length > 16 || !passesLuhnCheck(digits)) {
    errors.cardNumber = 'Enter a valid 15 or 16-digit card number.';
  }

  if (input.cardholderName.trim().length < 2) {
    errors.cardholderName = 'Enter the full name printed on the card.';
  }

  const month = parseInt(input.expMonth, 10);
  const year = parseInt(input.expYear.length === 2 ? `20${input.expYear}` : input.expYear, 10);
  if (
    isNaN(month) ||
    month < 1 ||
    month > 12 ||
    isNaN(year) ||
    year < referenceYear ||
    (year === referenceYear && month < referenceMonth)
  ) {
    errors.expiry = 'Enter a valid future expiration date.';
  }

  const cvcDigits = input.cvc.replace(/\D/g, '');
  if (cvcDigits.length < 3 || cvcDigits.length > 4) {
    errors.cvc = 'Enter a 3 or 4-digit security code.';
  }

  if (!/^\d{5}(-\d{4})?$/.test(input.billingZip.trim())) {
    errors.billingZip = 'Enter a valid 5-digit billing ZIP code.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function addCartItem(items, productId, weightSize, qty = 1) {
  const safeQty = Math.max(1, Number(qty) || 1);
  const idx = items.findIndex(
    (i) => i.productId === productId && i.weightSize === weightSize
  );
  if (idx >= 0) {
    return items.map((item, i) =>
      i === idx ? { ...item, quantity: item.quantity + safeQty } : item
    );
  }
  return [...items, { productId, weightSize, quantity: safeQty }];
}

export function updateCartItemQuantity(items, productId, weightSize, delta) {
  return items
    .map((item) =>
      item.productId === productId && item.weightSize === weightSize
        ? { ...item, quantity: item.quantity + delta }
        : item
    )
    .filter((item) => item.quantity > 0);
}

export function removeCartItem(items, productId, weightSize) {
  return items.filter(
    (item) => !(item.productId === productId && item.weightSize === weightSize)
  );
}

export function canAccessUserDashboard(user) {
  return Boolean(user && user.id);
}

export function canCheckout(user) {
  return Boolean(user && user.id);
}

export function canAccessAdminConsole(user) {
  return Boolean(user && user.role === 'admin');
}

export function validateRegistrationInput({ fullName = '', email = '', password = '' }) {
  const errors = {};
  if (fullName.trim().length < 2) {
    errors.fullName = 'Enter your full name (at least 2 characters).';
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    errors.email = 'Enter a valid email address.';
  }
  if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters long.';
  }
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalizedEmail,
  };
}

export function calculateProductRatingSummary(reviews, productId) {
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const productReviews = (reviews || []).filter((r) => r.productId === productId);
  if (productReviews.length === 0) {
    return { averageRating: 0, totalReviews: 0, distribution };
  }

  let sum = 0;
  for (const rev of productReviews) {
    const score = Math.min(5, Math.max(1, Math.round(Number(rev.rating) || 0)));
    distribution[score] += 1;
    sum += score;
  }

  return {
    averageRating: Math.round((sum / productReviews.length) * 10) / 10,
    totalReviews: productReviews.length,
    distribution,
  };
}

export function hasUserPurchasedProduct(orders, productId, userId) {
  return (orders || []).some(
    (order) =>
      order.isLive !== false &&
      order.status !== 'cancelled' &&
      (!userId || order.userId === userId) &&
      Array.isArray(order.items) &&
      order.items.some((item) => item.productId === productId)
  );
}

export function validateProductReviewInput({ rating, title = '', comment = '' }) {
  const errors = {};
  const numericRating = Number(rating);
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    errors.rating = 'Select a star rating between 1 and 5.';
  }
  if (String(title).trim().length < 2) {
    errors.title = 'Enter a short review headline (at least 2 characters).';
  }
  if (String(comment).trim().length < 8) {
    errors.comment = 'Share at least 8 characters about taste, freshness, or packaging.';
  }
  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
