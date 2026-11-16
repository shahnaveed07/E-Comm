import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../app.js';
import { hashPasswordBcrypt } from '../utils/crypto.js';

function createAgentWithCsrf(app) {
  const agent = request.agent(app);
  return {
    agent,
    async getCsrf() {
      const res = await agent.get('/api/csrf-token');
      assert.equal(res.status, 200);
      assert.ok(res.body.csrfToken);
      return res.body.csrfToken;
    },
  };
}

async function createSeededAdmin(ctx, email = 'ops-admin@sylvangrove.test', password = 'AdminStrongPassword!99') {
  const passwordHash = await hashPasswordBcrypt(password, 4);
  const admin = await ctx.repo.createUser({
    email,
    fullName: 'Orchard Ops Admin',
    role: 'ADMIN',
    passwordHash,
    passwordAlgo: 'bcrypt',
  });
  return { admin, email, password };
}

test('Security: CSRF double-submit enforcement, auth sessions, password reset session revocation & legacy scrypt upgrade', async (t) => {
  const issuedTokens = [];
  const ctx = createApp({
    forceInMemory: true,
    onTokenIssued: (ev) => issuedTokens.push(ev),
    env: { NODE_ENV: 'test', SESSION_SECRET: 'test-session-secret-min-32-chars-ok' },
  });
  t.after(() => ctx.closeAll());

  const { agent, getCsrf } = createAgentWithCsrf(ctx.app);

  // 1. CSRF check fails without X-CSRF-Token header
  const noCsrf = await agent.post('/api/auth/register').send({
    fullName: 'Maya Lin',
    email: 'maya@example.test',
    password: 'OrchardPassword!8',
  });
  assert.equal(noCsrf.status, 403);
  assert.equal(noCsrf.body.code, 'CSRF_INVALID');

  const csrf = await getCsrf();

  // 2. Register sets HTTP-only sg_session cookie and returns safe sanitized user
  const regRes = await agent
    .post('/api/auth/register')
    .set('X-CSRF-Token', csrf)
    .send({
      fullName: 'Maya Lin',
      email: 'maya@example.test',
      password: 'OrchardPassword!8',
    });
  assert.equal(regRes.status, 201);
  assert.equal(regRes.body.user.email, 'maya@example.test');
  assert.equal(regRes.body.user.passwordHash, undefined);
  const cookies = regRes.headers['set-cookie'] || [];
  assert.ok(cookies.some((c) => c.startsWith('sg_session=') && c.includes('HttpOnly')));

  // 3. Logout revokes session
  const logoutRes = await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf);
  assert.equal(logoutRes.status, 200);
  const afterLogout = await agent
    .put('/api/preferences')
    .set('X-CSRF-Token', csrf)
    .send({ preferredRoast: 'lightly_salted' });
  assert.equal(afterLogout.status, 401);

  // 4. Legacy scrypt-legacy password upgrades cleanly to bcrypt on login
  const salt = '00112233445566778899aabbccddeeff';
  const legacyPass = 'LegacyOrchardPass123!';
  const legacyHash = crypto.scryptSync(legacyPass, salt, 64).toString('hex');
  await ctx.repo.createUser({
    email: 'legacy@example.test',
    fullName: 'Legacy User',
    role: 'CUSTOMER',
    passwordHash: legacyHash,
    passwordSalt: salt,
    passwordAlgo: 'scrypt-legacy',
  });
  const legacyLogin = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrf)
    .send({ email: 'legacy@example.test', password: legacyPass });
  assert.equal(legacyLogin.status, 200);
  const upgradedUser = await ctx.repo.findUserByEmail('legacy@example.test');
  assert.equal(upgradedUser.passwordAlgo, 'bcrypt');
  assert.equal(upgradedUser.passwordSalt, null);

  // 5. Forgot + reset password revokes existing sessions
  await agent
    .post('/api/auth/forgot-password')
    .set('X-CSRF-Token', csrf)
    .send({ email: 'legacy@example.test' });
  const resetEv = issuedTokens.find((e) => e.type === 'reset' && e.email === 'legacy@example.test');
  assert.ok(resetEv?.token);

  const resetRes = await agent
    .post('/api/auth/reset-password')
    .set('X-CSRF-Token', csrf)
    .send({ token: resetEv.token, newPassword: 'NewOrchardPassword!99' });
  assert.equal(resetRes.status, 200);

  // Existing session revoked -> unauthenticated on protected endpoint
  const revokedCheck = await agent
    .put('/api/preferences')
    .set('X-CSRF-Token', csrf)
    .send({ preferredRoast: 'lightly_salted' });
  assert.equal(revokedCheck.status, 401);

  // Customer cannot access /api/admin/*
  const reLogin = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrf)
    .send({ email: 'legacy@example.test', password: 'NewOrchardPassword!99' });
  assert.equal(reLogin.status, 200);
  const forbiddenAdmin = await agent.get('/api/admin/orders');
  assert.equal(forbiddenAdmin.status, 403);
});

test('Rate limiter returns 429 on excessive auth attempts', async (t) => {
  const ctx = createApp({
    forceInMemory: true,
    rateLimitOverrides: { authMax: 2 },
    env: { NODE_ENV: 'test', SESSION_SECRET: 'test-session-secret-min-32-chars-ok' },
  });
  t.after(() => ctx.closeAll());

  const { agent, getCsrf } = createAgentWithCsrf(ctx.app);
  const csrf = await getCsrf();

  await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ email: 'a@b.com', password: '123' });
  await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ email: 'a@b.com', password: '123' });
  const third = await agent
    .post('/api/auth/login')
    .set('X-CSRF-Token', csrf)
    .send({ email: 'a@b.com', password: '123' });
  assert.equal(third.status, 429);
  assert.equal(third.body.code, 'RATE_LIMITED');
});

test('Inventory, server-authoritative pricing, promo code & PDF invoice generation', async (t) => {
  const ctx = createApp({
    forceInMemory: true,
    env: { NODE_ENV: 'test', SESSION_SECRET: 'test-session-secret-min-32-chars-ok' },
  });
  t.after(() => ctx.closeAll());

  const { email: adminEmail, password: adminPassword } = await createSeededAdmin(ctx);
  const cust = createAgentWithCsrf(ctx.app);
  const custCsrf = await cust.getCsrf();

  await cust.agent.post('/api/auth/register').set('X-CSRF-Token', custCsrf).send({
    fullName: 'Clara Vance',
    email: 'clara-order@example.test',
    password: 'StrongPassword!42',
  });

  await cust.agent
    .post('/api/payment-methods')
    .set('X-CSRF-Token', custCsrf)
    .send({
      cardNumber: '4242424242424242',
      cardholderName: 'Clara Vance',
      expMonth: '12',
      expYear: '2028',
      billingZip: '97205',
      setAsDefault: true,
    });

  // Set stock of Chandler Walnuts 16oz to 3
  const catalogBefore = await ctx.repo.getCatalog({});
  const walnut = catalogBefore.find((p) => p.id === 'prod-chandler-walnuts');
  const v16 = walnut.variants.find((v) => v.weightSize === '16oz');
  await ctx.repo.adjustVariantInventory(v16.id, { setQuantity: 3, actorUserId: 'test' });

  // Oversell attempt fails with 409
  const oversell = await cust.agent
    .post('/api/orders')
    .set('X-CSRF-Token', custCsrf)
    .send({
      items: [{ productId: 'prod-chandler-walnuts', weightSize: '16oz', quantity: 5 }],
      shippingAddress: {
        fullName: 'Clara Vance',
        street: '100 Orchard Ln',
        city: 'Portland',
        state: 'OR',
        postalCode: '97205',
      },
      paymentProvider: 'CARD_TOKEN',
    });
  assert.equal(oversell.status, 409);

  // Valid order with HARVEST10 promo code & spoofed price field (server must ignore client prices)
  const orderRes = await cust.agent
    .post('/api/orders')
    .set('X-CSRF-Token', custCsrf)
    .send({
      items: [{ productId: 'prod-chandler-walnuts', weightSize: '16oz', quantity: 2, unitPrice: 0.01 }],
      couponCode: 'HARVEST10',
      shippingAddress: {
        fullName: 'Clara Vance',
        street: '100 Orchard Ln',
        city: 'Portland',
        state: 'OR',
        postalCode: '97205',
      },
      paymentProvider: 'CARD_TOKEN',
    });
  assert.equal(orderRes.status, 201);
  // 2 * $22 = $44 subtotal; 10% HARVEST10 discount = $4.40; net = $39.60 (<$65 -> +$6.95 shipping) = $46.55
  assert.equal(orderRes.body.order.subtotal, 44);
  assert.equal(orderRes.body.order.discount, 4.4);
  assert.equal(orderRes.body.order.shippingFee, 6.95);
  assert.equal(orderRes.body.order.total, 46.55);

  // Invoice PDF downloads cleanly
  const pdfRes = await cust.agent.get(`/api/orders/${orderRes.body.order.id}/invoice.pdf`);
  assert.equal(pdfRes.status, 200);
  assert.ok(pdfRes.headers['content-type'].includes('application/pdf'));

  // Admin cancels order -> stock is restored
  const adm = createAgentWithCsrf(ctx.app);
  const admCsrf = await adm.getCsrf();
  await adm.agent.post('/api/auth/login').set('X-CSRF-Token', admCsrf).send({
    email: adminEmail,
    password: adminPassword,
  });
  const cancelRes = await adm.agent
    .patch(`/api/admin/orders/${orderRes.body.order.id}`)
    .set('X-CSRF-Token', admCsrf)
    .send({ status: 'cancelled' });
  assert.equal(cancelRes.status, 200);

  const catalogAfter = await ctx.repo.getCatalog({});
  const walnutAfter = catalogAfter.find((p) => p.id === 'prod-chandler-walnuts');
  const v16After = walnutAfter.variants.find((v) => v.weightSize === '16oz');
  assert.equal(v16After.availableStock, 3);
});

test('UPI QR currency enforcement (rejected in USD, full manual verification lifecycle in INR)', async (t) => {
  // 1. Rejected in USD
  const usdCtx = createApp({
    forceInMemory: true,
    env: {
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-min-32-chars-ok',
      STORE_CURRENCY: 'USD',
      UPI_QR_ENABLED: 'true',
      UPI_MERCHANT_VPA: 'sylvangrove@upi',
    },
  });
  t.after(() => usdCtx.closeAll());

  const usdCust = createAgentWithCsrf(usdCtx.app);
  const usdCsrf = await usdCust.getCsrf();
  await usdCust.agent.post('/api/auth/register').set('X-CSRF-Token', usdCsrf).send({
    fullName: 'USD Shopper',
    email: 'usd@example.test',
    password: 'StrongPassword!42',
  });
  const usdRejected = await usdCust.agent
    .post('/api/orders')
    .set('X-CSRF-Token', usdCsrf)
    .send({
      items: [{ productId: 'prod-chandler-walnuts', weightSize: '16oz', quantity: 1 }],
      shippingAddress: {
        fullName: 'USD Shopper',
        street: '1 Main St',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
      },
      paymentProvider: 'UPI_QR',
    });
  assert.equal(usdRejected.status, 400);
  assert.equal(usdRejected.body.code, 'UPI_QR_UNAVAILABLE');

  // 2. Full INR UPI QR workflow
  const inrCtx = createApp({
    forceInMemory: true,
    env: {
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-min-32-chars-ok',
      STORE_CURRENCY: 'INR',
      UPI_QR_ENABLED: 'true',
      UPI_MERCHANT_VPA: 'sylvangrove@icici',
      UPI_MERCHANT_NAME: 'Sylvan Grove Orchard',
    },
  });
  t.after(() => inrCtx.closeAll());

  const { email: adminEmail, password: adminPassword } = await createSeededAdmin(inrCtx);
  const cust = createAgentWithCsrf(inrCtx.app);
  const custCsrf = await cust.getCsrf();
  await cust.agent.post('/api/auth/register').set('X-CSRF-Token', custCsrf).send({
    fullName: 'Aarav Mehta',
    email: 'aarav@example.test',
    password: 'StrongPassword!42',
  });

  // Place order with UPI_QR -> awaiting_payment, PENDING
  const ordRes = await cust.agent
    .post('/api/orders')
    .set('X-CSRF-Token', custCsrf)
    .send({
      items: [{ productId: 'prod-chandler-walnuts', weightSize: '16oz', quantity: 1 }],
      shippingAddress: {
        fullName: 'Aarav Mehta',
        street: '14 Indiranagar',
        city: 'Bengaluru',
        state: 'KA',
        postalCode: '560038',
        countryCode: 'IN',
      },
      paymentProvider: 'UPI_QR',
    });
  assert.equal(ordRes.status, 201);
  assert.equal(ordRes.body.order.status, 'awaiting_payment');
  assert.equal(ordRes.body.order.paymentStatus, 'PENDING');

  // Initiate QR session
  const initRes = await cust.agent
    .post('/api/payments/initiate')
    .set('X-CSRF-Token', custCsrf)
    .send({ orderId: ordRes.body.order.id, provider: 'UPI_QR' });
  assert.equal(initRes.status, 200);
  assert.ok(initRes.body.upiUri.startsWith('upi://pay?'));
  assert.ok(initRes.body.qrDataUrl.startsWith('data:image/png;base64,'));

  // Reject malformed UTR
  const badUtr = await cust.agent
    .post('/api/payments/upi/submit-utr')
    .set('X-CSRF-Token', custCsrf)
    .send({ orderId: ordRes.body.order.id, paymentId: initRes.body.payment.id, utrNumber: 'BAD!' });
  assert.equal(badUtr.status, 400);

  // Submit valid UTR -> PENDING_MANUAL_VERIFICATION (NOT CAPTURED!)
  const goodUtr = await cust.agent
    .post('/api/payments/upi/submit-utr')
    .set('X-CSRF-Token', custCsrf)
    .send({ orderId: ordRes.body.order.id, paymentId: initRes.body.payment.id, utrNumber: '431987654321' });
  assert.equal(goodUtr.status, 200);
  assert.equal(goodUtr.body.payment.status, 'PENDING_MANUAL_VERIFICATION');

  // Customer cannot self-verify
  const selfVerify = await cust.agent
    .post(`/api/admin/payments/${initRes.body.payment.id}/verify`)
    .set('X-CSRF-Token', custCsrf)
    .send({ confirmVerified: true });
  assert.equal(selfVerify.status, 403);

  // Admin rejects first with reason -> order stays awaiting_payment & retryable
  const adm = createAgentWithCsrf(inrCtx.app);
  const admCsrf = await adm.getCsrf();
  await adm.agent.post('/api/auth/login').set('X-CSRF-Token', admCsrf).send({
    email: adminEmail,
    password: adminPassword,
  });

  const rejectRes = await adm.agent
    .post(`/api/admin/payments/${initRes.body.payment.id}/reject`)
    .set('X-CSRF-Token', admCsrf)
    .send({ reason: 'UTR not found on settlement report' });
  assert.equal(rejectRes.status, 200);
  assert.equal(rejectRes.body.payment.status, 'REJECTED');

  // Customer initiates fresh UPI session & submits new UTR on SAME order (no duplicate order!)
  const retryInit = await cust.agent
    .post('/api/payments/initiate')
    .set('X-CSRF-Token', custCsrf)
    .send({ orderId: ordRes.body.order.id, provider: 'UPI_QR' });
  assert.equal(retryInit.status, 200);
  assert.notEqual(retryInit.body.payment.id, initRes.body.payment.id);

  await cust.agent
    .post('/api/payments/upi/submit-utr')
    .set('X-CSRF-Token', custCsrf)
    .send({ orderId: ordRes.body.order.id, paymentId: retryInit.body.payment.id, utrNumber: '531987654399' });

  // Second order attempting to reuse an active/pending UTR '531987654399' is rejected with 409
  const ord2Res = await cust.agent
    .post('/api/orders')
    .set('X-CSRF-Token', custCsrf)
    .send({
      items: [{ productId: 'prod-nonpareil-almonds', weightSize: '8oz', quantity: 1 }],
      shippingAddress: {
        fullName: 'Aarav Mehta',
        street: '14 Indiranagar',
        city: 'Bengaluru',
        state: 'KA',
        postalCode: '560038',
        countryCode: 'IN',
      },
      paymentProvider: 'UPI_QR',
    });
  assert.equal(ord2Res.status, 201);
  const init2 = await cust.agent
    .post('/api/payments/initiate')
    .set('X-CSRF-Token', custCsrf)
    .send({ orderId: ord2Res.body.order.id, provider: 'UPI_QR' });
  const dupUtr = await cust.agent
    .post('/api/payments/upi/submit-utr')
    .set('X-CSRF-Token', custCsrf)
    .send({ orderId: ord2Res.body.order.id, paymentId: init2.body.payment.id, utrNumber: '531987654399' });
  assert.equal(dupUtr.status, 409);
  assert.equal(dupUtr.body.code, 'DUPLICATE_UTR');

  // Verify without confirmVerified: true blocked
  const unconfirmed = await adm.agent
    .post(`/api/admin/payments/${retryInit.body.payment.id}/verify`)
    .set('X-CSRF-Token', admCsrf)
    .send({ confirmVerified: false });
  assert.equal(unconfirmed.status, 400);

  // Admin confirms verification -> CAPTURED, placed, invoice PAID, audit log recorded
  const verified = await adm.agent
    .post(`/api/admin/payments/${retryInit.body.payment.id}/verify`)
    .set('X-CSRF-Token', admCsrf)
    .send({ confirmVerified: true, notes: 'Matched bank ref #531987654399' });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.payment.status, 'CAPTURED');
  assert.equal(verified.body.order.status, 'placed');

  const inv = await inrCtx.repo.findInvoiceByOrderId(ordRes.body.order.id);
  assert.equal(inv.status, 'paid');
});

test('Webhooks: Razorpay HMAC signature verification, deduplication & financial report accuracy', async (t) => {
  const secret = 'rzp_webhook_secret_unit_test_123';
  const ctx = createApp({
    forceInMemory: true,
    env: {
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-min-32-chars-ok',
      RAZORPAY_WEBHOOK_SECRET: secret,
    },
  });
  t.after(() => ctx.closeAll());

  const { email: adminEmail, password: adminPassword } = await createSeededAdmin(ctx);

  // Create customer & unpaid pending Razorpay order
  const cust = createAgentWithCsrf(ctx.app);
  const custCsrf = await cust.getCsrf();
  await cust.agent.post('/api/auth/register').set('X-CSRF-Token', custCsrf).send({
    fullName: 'Webhook Buyer',
    email: 'wh@example.test',
    password: 'StrongPassword!42',
  });
  const ordRes = await cust.agent
    .post('/api/orders')
    .set('X-CSRF-Token', custCsrf)
    .send({
      items: [{ productId: 'prod-chandler-walnuts', weightSize: '16oz', quantity: 1 }],
      shippingAddress: {
        fullName: 'Webhook Buyer',
        street: '2 Pine St',
        city: 'Seattle',
        state: 'WA',
        postalCode: '98101',
      },
      paymentProvider: 'RAZORPAY',
    });
  assert.equal(ordRes.status, 201);

  const pendingPayment = await ctx.repo.findPaymentById(ordRes.body.payment.id);
  await ctx.repo.updatePaymentRecord(pendingPayment.id, { externalOrderId: 'order_rzp_mock_1' });

  // Financial report before payment capture excludes unpaid order
  const adm = createAgentWithCsrf(ctx.app);
  const admCsrf = await adm.getCsrf();
  await adm.agent.post('/api/auth/login').set('X-CSRF-Token', admCsrf).send({
    email: adminEmail,
    password: adminPassword,
  });
  const beforeReport = await adm.agent.get('/api/admin/reports');
  assert.equal(beforeReport.status, 200);
  const baseRevenueMinor = beforeReport.body.metrics.verifiedRevenueMinor;

  const webhookPayload = JSON.stringify({
    id: 'evt_rzp_unique_101',
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_rzp_999',
          order_id: 'order_rzp_mock_1',
          amount: pendingPayment.amountMinor,
          currency: pendingPayment.currency,
        },
      },
    },
  });

  // 1. Tampered signature rejected
  const badSig = await request(ctx.app)
    .post('/api/webhooks/razorpay')
    .set('Content-Type', 'application/json')
    .set('x-razorpay-signature', 'deadbeef0000')
    .send(webhookPayload);
  assert.equal(badSig.status, 401);

  // 2. Valid signature accepted and commits payment + order
  const validHmac = crypto.createHmac('sha256', secret).update(webhookPayload).digest('hex');
  const goodSig = await request(ctx.app)
    .post('/api/webhooks/razorpay')
    .set('Content-Type', 'application/json')
    .set('x-razorpay-signature', validHmac)
    .send(webhookPayload);
  assert.equal(goodSig.status, 200);
  assert.equal(goodSig.body.duplicate, false);

  // 3. Replay event deduplicated
  const replay = await request(ctx.app)
    .post('/api/webhooks/razorpay')
    .set('Content-Type', 'application/json')
    .set('x-razorpay-signature', validHmac)
    .send(webhookPayload);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.duplicate, true);

  // Revenue increased strictly by captured order total
  const afterReport = await adm.agent.get('/api/admin/reports');
  assert.equal(
    afterReport.body.metrics.verifiedRevenueMinor,
    baseRevenueMinor + pendingPayment.amountMinor
  );
});

test('Admin catalog creation, stock updates, and customer suspension revoking sessions', async (t) => {
  const ctx = createApp({
    forceInMemory: true,
    env: { NODE_ENV: 'test', SESSION_SECRET: 'test-session-secret-min-32-chars-ok' },
  });
  t.after(() => ctx.closeAll());

  const { email: adminEmail, password: adminPassword } = await createSeededAdmin(ctx);

  const cust = createAgentWithCsrf(ctx.app);
  const custCsrf = await cust.getCsrf();
  const regRes = await cust.agent.post('/api/auth/register').set('X-CSRF-Token', custCsrf).send({
    fullName: 'Suspendable User',
    email: 'suspend@example.test',
    password: 'StrongPassword!42',
  });
  assert.equal(regRes.status, 201);
  const custId = regRes.body.user.id;

  const adm = createAgentWithCsrf(ctx.app);
  const admCsrf = await adm.getCsrf();
  await adm.agent.post('/api/auth/login').set('X-CSRF-Token', admCsrf).send({
    email: adminEmail,
    password: adminPassword,
  });

  // Create product
  const prodRes = await adm.agent
    .post('/api/admin/products')
    .set('X-CSRF-Token', admCsrf)
    .send({
      slug: 'heirloom-black-walnuts',
      name: 'Heirloom Black Walnuts',
      category: 'walnuts',
      origin: 'Sonoma, CA',
      harvestBatch: '2026 Late Autumn',
      roastProfile: 'raw_sprouted',
      roastLabel: 'Raw & Sprouted',
      basePrice16oz: 26.0,
      shortDescription: 'Deep earthy heirloom kernels.',
      tastingNotes: 'Rich cocoa & mineral finish.',
      nutritionPerServing: {
        servingSize: '1 oz (28g)',
        calories: 190,
        proteinGrams: 7,
        healthyFatsGrams: 17,
        fiberGrams: 2,
        highlightNutrient: '7g protein',
      },
      imageUrl: '/src/assets/images/product_chandler_walnuts_1794573483798.jpg',
    });
  assert.equal(prodRes.status, 201);
  assert.equal(prodRes.body.product.variants.length, 3);

  // Suspend customer -> revokes active session immediately
  const suspRes = await adm.agent
    .patch(`/api/admin/customers/${custId}/status`)
    .set('X-CSRF-Token', admCsrf)
    .send({ status: 'SUSPENDED' });
  assert.equal(suspRes.status, 200);
  assert.equal(suspRes.body.user.status, 'SUSPENDED');

  const blockedCheck = await cust.agent
    .put('/api/preferences')
    .set('X-CSRF-Token', custCsrf)
    .send({ preferredRoast: 'lightly_salted' });
  assert.equal(blockedCheck.status, 401);
});
