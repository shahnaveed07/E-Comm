import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_CATALOG, INITIAL_REVIEWS, INITIAL_STORE_STATE } from '../data/catalog.js';
import {
  addCartItem,
  calculateAdminOrderMetrics,
  calculateCartTotals,
  calculateProductRatingSummary,
  calculateUnitPrice,
  canAccessAdminConsole,
  canAccessUserDashboard,
  canCheckout,
  detectCardBrand,
  filterAdminOrders,
  formatCurrency,
  getPersonalizedRecommendations,
  getVariantAvailableStock,
  hasUserPurchasedProduct,
  removeCartItem,
  updateCartItemQuantity,
  validatePaymentCard,
  validateProductReviewInput,
  validateRegistrationInput,
  validateUtrFormat,
} from './commerce.js';

test('calculateUnitPrice applies weight multiplier accurately', () => {
  assert.equal(calculateUnitPrice(20, '16oz'), 20.0);
  assert.equal(calculateUnitPrice(20, '8oz'), 11.2);
  assert.equal(calculateUnitPrice(20, '32oz'), 37.0);
});

test('calculateCartTotals computes free shipping at $65+ threshold', () => {
  const smallBag = calculateCartTotals(
    [{ productId: 'prod-chandler-walnuts', weightSize: '16oz', quantity: 1 }],
    INITIAL_CATALOG
  );
  assert.equal(smallBag.subtotal, 22.0);
  assert.equal(smallBag.shippingFee, 6.95);
  assert.equal(smallBag.freeShippingRemaining, 43.0);
  assert.equal(smallBag.total, 28.95);

  const freeShippingBag = calculateCartTotals(
    [{ productId: 'prod-chandler-walnuts', weightSize: '16oz', quantity: 3 }],
    INITIAL_CATALOG
  );
  assert.equal(freeShippingBag.subtotal, 66.0);
  assert.equal(freeShippingBag.shippingFee, 0);
  assert.equal(freeShippingBag.freeShippingRemaining, 0);
  assert.equal(freeShippingBag.total, 66.0);
});

test('calculateCartTotals applies promo discounts and storeConfig thresholds', () => {
  const discounted = calculateCartTotals(
    [{ productId: 'prod-chandler-walnuts', weightSize: '16oz', quantity: 3 }],
    INITIAL_CATALOG,
    6.6,
    { freeShippingThresholdMinor: 6500, standardShippingFeeMinor: 695 }
  );
  assert.equal(discounted.subtotal, 66.0);
  assert.equal(discounted.discount, 6.6);
  assert.equal(discounted.shippingFee, 6.95);
  assert.equal(discounted.total, 66.35);
});

test('cart item helpers add, update quantity, and remove items cleanly', () => {
  let items = addCartItem([], 'prod-chandler-walnuts', '16oz', 1);
  items = addCartItem(items, 'prod-chandler-walnuts', '16oz', 2);
  items = addCartItem(items, 'prod-nonpareil-almonds', '8oz', 1);
  assert.equal(items.length, 2);
  assert.equal(items[0].quantity, 3);

  items = updateCartItemQuantity(items, 'prod-chandler-walnuts', '16oz', -2);
  assert.equal(items[0].quantity, 1);

  items = updateCartItemQuantity(items, 'prod-chandler-walnuts', '16oz', -1);
  assert.equal(items.length, 1);
  assert.equal(items[0].productId, 'prod-nonpareil-almonds');

  items = removeCartItem(items, 'prod-nonpareil-almonds', '8oz');
  assert.equal(items.length, 0);
});

test('getPersonalizedRecommendations excludes allergens and prioritizes matching preferences', () => {
  const recsWithCashewExcluded = getPersonalizedRecommendations(
    INITIAL_CATALOG,
    {
      ...INITIAL_STORE_STATE.preferences,
      preferredRoast: 'raw_sprouted',
      dietaryGoals: ['keto', 'heart_healthy'],
      excludedAllergens: ['cashews', 'walnuts'],
    },
    INITIAL_STORE_STATE.orders,
    4
  );

  const ids = recsWithCashewExcluded.map((r) => r.product.id);
  assert.equal(ids.includes('prod-orchard-medley'), false);
  assert.equal(ids.includes('prod-chandler-walnuts'), false);
  assert.equal(ids[0], 'prod-georgia-pecans');
});

test('calculateAdminOrderMetrics excludes unpaid and cancelled orders from verified revenue', () => {
  const orders = [
    { id: '1', status: 'placed', paymentStatus: 'CAPTURED', isLive: true, total: 50 },
    { id: '2', status: 'in_transit', paymentStatus: 'CAPTURED', isLive: true, total: 75.5 },
    { id: '3', status: 'awaiting_payment', paymentStatus: 'PENDING_MANUAL_VERIFICATION', isLive: true, total: 99 },
    { id: '4', status: 'placed', isLive: false, total: 30 },
    { id: '5', status: 'cancelled', paymentStatus: 'REFUNDED', isLive: true, total: 100 },
  ];
  const metrics = calculateAdminOrderMetrics(orders);
  assert.equal(metrics.totalOrders, 5);
  assert.equal(metrics.liveCount, 3);
  assert.equal(metrics.draftCount, 1);
  assert.equal(metrics.awaitingPacking, 2);
  assert.equal(metrics.awaitingPayment, 1);
  assert.equal(metrics.inTransit, 1);
  assert.equal(metrics.revenue, 155.5);
});

test('filterAdminOrders filters by status, live state, and search text', () => {
  const orders = [
    ...INITIAL_STORE_STATE.orders,
    {
      id: 'ord-draft',
      orderNumber: 'SG-2026-1099',
      status: 'placed',
      isLive: false,
      trackingNumber: '1Z999AA1010000001',
      items: [{ productName: 'San Joaquin Roasted Pistachios' }],
      shippingAddress: { fullName: 'Marcus Chen', city: 'Seattle' },
    },
  ];

  assert.equal(filterAdminOrders(orders, 'all', 'live', '').length, 2);
  assert.equal(filterAdminOrders(orders, 'all', 'draft', '').length, 1);
  assert.equal(filterAdminOrders(orders, 'in_transit', 'all', '').length, 1);
  assert.equal(filterAdminOrders(orders, 'all', 'all', 'marcus').length, 1);
  assert.equal(filterAdminOrders(orders, 'all', 'all', '1042').length, 1);
});

test('access control helpers enforce guest, customer, and admin boundaries', () => {
  assert.equal(canAccessUserDashboard(null), false);
  assert.equal(canCheckout(null), false);
  assert.equal(canAccessAdminConsole(null), false);

  const customer = { id: 'usr-1', email: 'maya@example.com', role: 'customer' };
  assert.equal(canAccessUserDashboard(customer), true);
  assert.equal(canCheckout(customer), true);
  assert.equal(canAccessAdminConsole(customer), false);

  const admin = { id: 'usr-admin', email: 'admin@sylvangrove.com', role: 'admin' };
  assert.equal(canAccessUserDashboard(admin), true);
  assert.equal(canCheckout(admin), true);
  assert.equal(canAccessAdminConsole(admin), true);
});

test('validateRegistrationInput validates name, email, and password strength', () => {
  const bad = validateRegistrationInput({ fullName: 'A', email: 'bad', password: '123' });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.fullName);
  assert.ok(bad.errors.email);
  assert.ok(bad.errors.password);

  const good = validateRegistrationInput({
    fullName: 'Maya Lin',
    email: 'Maya@Example.com',
    password: 'HarvestPassword9!',
  });
  assert.equal(good.valid, true);
  assert.equal(good.normalizedEmail, 'maya@example.com');
});

test('validatePaymentCard and validateUtrFormat enforce payment validation rules', () => {
  const invalid = validatePaymentCard({
    cardNumber: '4111 1111 1111 1112',
    cardholderName: 'A',
    expMonth: '01',
    expYear: '2025',
    cvc: '12',
    billingZip: 'abc',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.cardNumber);
  assert.ok(invalid.errors.cardholderName);
  assert.ok(invalid.errors.expiry);
  assert.ok(invalid.errors.cvc);
  assert.ok(invalid.errors.billingZip);

  const valid = validatePaymentCard({
    cardNumber: '4242 4242 4242 4242',
    cardholderName: 'Clara Vance',
    expMonth: '12',
    expYear: '2028',
    cvc: '482',
    billingZip: '97205',
  });
  assert.equal(valid.valid, true);
  assert.equal(detectCardBrand('4242 4242 4242 4242'), 'Visa');
  assert.equal(detectCardBrand('5500 0000 0000 0004'), 'Mastercard');

  assert.equal(validateUtrFormat('431987654321'), true);
  assert.equal(validateUtrFormat('UTR99182736455'), true);
  assert.equal(validateUtrFormat('12345'), false);
  assert.equal(validateUtrFormat('INVALID-UTR!'), false);
});

test('getVariantAvailableStock and formatCurrency handle stock math and multi-currency symbols', () => {
  const sampleProduct = {
    id: 'p-test',
    inStock: true,
    variants: [
      { weightSize: '8oz', stockQuantity: 10, reservedStock: 4 },
      { weightSize: '16oz', stockQuantity: 2, reservedStock: 2 },
    ],
  };
  assert.equal(getVariantAvailableStock(sampleProduct, '8oz'), 6);
  assert.equal(getVariantAvailableStock(sampleProduct, '16oz'), 0);
  assert.equal(formatCurrency(1499.5, 'INR'), '₹1499.50');
  assert.equal(formatCurrency(22, 'USD'), '$22.00');
});

test('calculateProductRatingSummary computes average, count, and star distribution', () => {
  const summary = calculateProductRatingSummary(INITIAL_REVIEWS, 'prod-chandler-walnuts');
  assert.equal(summary.totalReviews, 2);
  assert.equal(summary.averageRating, 5);
  assert.equal(summary.distribution[5], 2);

  const mixed = calculateProductRatingSummary(
    [
      { productId: 'p1', rating: 5 },
      { productId: 'p1', rating: 4 },
      { productId: 'p1', rating: 4 },
    ],
    'p1'
  );
  assert.equal(mixed.totalReviews, 3);
  assert.equal(mixed.averageRating, 4.3);
  assert.equal(mixed.distribution[4], 2);
});

test('hasUserPurchasedProduct detects non-cancelled live orders for a product', () => {
  const orders = [
    {
      userId: 'usr-clara',
      isLive: true,
      status: 'delivered',
      items: [{ productId: 'prod-chandler-walnuts' }],
    },
    {
      userId: 'usr-clara',
      isLive: true,
      status: 'cancelled',
      items: [{ productId: 'prod-georgia-pecans' }],
    },
  ];
  assert.equal(hasUserPurchasedProduct(orders, 'prod-chandler-walnuts', 'usr-clara'), true);
  assert.equal(hasUserPurchasedProduct(orders, 'prod-georgia-pecans', 'usr-clara'), false);
  assert.equal(hasUserPurchasedProduct(orders, 'prod-chandler-walnuts', 'usr-other'), false);
});

test('validateProductReviewInput validates rating range, headline, and comment length', () => {
  const bad = validateProductReviewInput({ rating: 6, title: 'A', comment: 'short' });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.rating);
  assert.ok(bad.errors.title);
  assert.ok(bad.errors.comment);

  const good = validateProductReviewInput({
    rating: 5,
    title: 'Crisp and buttery halves',
    comment: 'Super fresh cold-shelled walnuts, zero bitterness.',
  });
  assert.equal(good.valid, true);
});
