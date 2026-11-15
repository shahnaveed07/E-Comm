const CURRENCY_SYMBOLS = {
  USD: '$',
  INR: '₹',
  EUR: '€',
  GBP: '£',
};

export function toMinorUnits(amountDecimal) {
  const num = Number(amountDecimal);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100);
}

export function minorToDecimal(minorUnits) {
  return Number((Number(minorUnits || 0) / 100).toFixed(2));
}

export function minorToDecimalString(minorUnits) {
  return (Number(minorUnits || 0) / 100).toFixed(2);
}

export function formatMinorCurrency(minorUnits, currency = 'USD') {
  const code = String(currency || 'USD').toUpperCase();
  const sym = CURRENCY_SYMBOLS[code] || `${code} `;
  return `${sym}${minorToDecimalString(minorUnits)}`;
}

export function calculateCouponDiscountMinor(subtotalMinor, coupon) {
  if (!coupon || !coupon.isActive) return 0;
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) return 0;
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) return 0;
  if (subtotalMinor < (coupon.minOrderMinor || 0)) return 0;

  let discount = 0;
  if (coupon.discountType === 'PERCENT') {
    discount = Math.floor((subtotalMinor * Number(coupon.discountValue || 0)) / 100);
  } else {
    discount = Number(coupon.discountValue || 0);
  }
  if (coupon.maxDiscountMinor != null) {
    discount = Math.min(discount, coupon.maxDiscountMinor);
  }
  return Math.max(0, Math.min(subtotalMinor, discount));
}

export function calculateOrderTotalsMinor({
  lineItems,
  freeShippingThresholdMinor,
  standardShippingFeeMinor,
  coupon = null,
}) {
  const subtotalMinor = lineItems.reduce(
    (sum, item) => sum + Number(item.unitPriceMinor) * Number(item.quantity),
    0
  );
  const discountMinor = calculateCouponDiscountMinor(subtotalMinor, coupon);
  const discountedSubtotal = Math.max(0, subtotalMinor - discountMinor);
  const shippingFeeMinor =
    lineItems.length === 0
      ? 0
      : discountedSubtotal >= freeShippingThresholdMinor
        ? 0
        : standardShippingFeeMinor;
  const totalMinor = discountedSubtotal + shippingFeeMinor;

  return {
    subtotalMinor,
    discountMinor,
    shippingFeeMinor,
    totalMinor,
  };
}
