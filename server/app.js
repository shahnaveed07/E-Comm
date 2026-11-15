import path from 'node:path';
import express from 'express';
import { DEFAULT_PUBLIC_PREFERENCES } from '../src/data/catalog.js';
import {
  isRazorpayAvailable,
  isStripeAvailable,
  isUpiQrAvailable,
  loadConfig,
} from './config/env.js';
import { createSecurityHeadersMiddleware } from './middleware/securityHeaders.js';
import { createRequestLoggerMiddleware } from './middleware/requestLogger.js';
import { createRateLimiters } from './middleware/rateLimit.js';
import { createCsrfMiddleware } from './middleware/csrf.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createErrorHandler } from './middleware/errorHandler.js';
import { createRepository } from './repositories/index.js';
import { createLogger } from './utils/logger.js';
import { createEmailService } from './services/notifications/EmailService.js';
import { createImageStorageService } from './services/storage/ImageStorageService.js';
import { buildUserAccountPayload, createAuthService } from './services/auth/AuthService.js';
import { createCatalogService } from './services/catalog/CatalogService.js';
import { createInventoryService } from './services/inventory/InventoryService.js';
import { createInvoiceService } from './services/invoices/InvoiceService.js';
import { createOrderService } from './services/orders/OrderService.js';
import { createUpiQrAdapter } from './services/payments/UpiQrAdapter.js';
import { createRazorpayAdapter } from './services/payments/RazorpayAdapter.js';
import { createStripeAdapter } from './services/payments/StripeAdapter.js';
import { createPaymentVerificationService } from './services/payments/PaymentVerificationService.js';
import { createWebhookProcessor } from './services/payments/WebhookProcessor.js';
import { createPaymentService } from './services/payments/PaymentService.js';
import { createHealthRouter } from './routes/health.js';
import { createAuthRouter } from './routes/auth.js';
import { createAccountRouter } from './routes/account.js';
import { createCatalogRouter } from './routes/catalog.js';
import { createOrdersRouter } from './routes/orders.js';
import { createPaymentsRouter } from './routes/payments.js';
import { createWebhooksRouter } from './routes/webhooks.js';
import { createAdminRouter } from './routes/admin.js';

export function createApp(options = {}) {
  const baseConfig = loadConfig(options.env || process.env);
  const config = {
    ...baseConfig,
    ...(options.configOverrides || {}),
    upiQr: { ...baseConfig.upiQr, ...(options.configOverrides?.upiQr || {}) },
    razorpay: { ...baseConfig.razorpay, ...(options.configOverrides?.razorpay || {}) },
    stripe: { ...baseConfig.stripe, ...(options.configOverrides?.stripe || {}) },
    storage: { ...baseConfig.storage, ...(options.configOverrides?.storage || {}) },
    email: { ...baseConfig.email, ...(options.configOverrides?.email || {}) },
  };

  const logger = options.logger || createLogger(config.logLevel);
  const repo = options.repo || createRepository(config, logger, options);

  const sseClients = new Set();

  async function buildClientState(user) {
    const [catalog, reviews, settings] = await Promise.all([
      repo.getCatalog({ includeArchived: false, includeHidden: false }),
      repo.listReviews(),
      repo.getStoreSettings(),
    ]);

    const commerce = settings.commerce_config || {};
    const currency = commerce.currency || config.storeCurrency;
    const storeConfig = {
      storeName: commerce.storeName || config.storeName,
      currency,
      freeShippingThresholdMinor:
        commerce.freeShippingThresholdMinor ?? config.freeShippingThresholdMinor,
      standardShippingFeeMinor:
        commerce.standardShippingFeeMinor ?? config.standardShippingFeeMinor,
      paymentMethods: {
        cardToken: true,
        upiQr: isUpiQrAvailable(config, currency),
        razorpay: isRazorpayAvailable(config),
        stripe: isStripeAvailable(config),
        stripePublishableKey: config.stripe.publishableKey || null,
      },
    };

    if (!user) {
      return {
        user: null,
        catalog,
        reviews,
        preferences: structuredClone(DEFAULT_PUBLIC_PREFERENCES),
        addresses: [],
        wishlistProductIds: [],
        paymentMethods: [],
        invoices: [],
        orders: [],
        returnRequests: [],
        storeConfig,
      };
    }

    const freshUser = await repo.findUserById(user.id);
    if (!freshUser) {
      return buildClientState(null);
    }

    const isAdmin = String(freshUser.role).toUpperCase() === 'ADMIN';
    const [orders, invoices, returnRequests] = await Promise.all([
      isAdmin ? repo.listAllOrders({ pageSize: 200 }) : repo.listOrdersForUser(freshUser.id),
      isAdmin ? repo.listAllInvoices() : repo.listInvoicesForUser(freshUser.id),
      isAdmin ? repo.listReturnRequests({}) : repo.listReturnRequests({ userId: freshUser.id }),
    ]);

    const accountPayload = buildUserAccountPayload(freshUser, { orders, invoices, returnRequests });
    return {
      ...accountPayload,
      catalog,
      reviews,
      storeConfig,
    };
  }

  function broadcastEvent(eventType = 'state_updated', meta = {}) {
    for (const client of sseClients) {
      Promise.resolve()
        .then(async () => {
          const user = client.userId ? await repo.findUserById(client.userId) : null;
          const clientState = await buildClientState(user);
          const payload = JSON.stringify({ type: eventType, meta, state: clientState });
          client.res.write(`event: state\ndata: ${payload}\n\n`);
        })
        .catch(() => {});
    }
  }

  function subscribeSse(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const clientEntry = { res, userId: req.user?.id || null };
    sseClients.add(clientEntry);

    buildClientState(req.user)
      .then((clientState) => {
        res.write(
          `event: state\ndata: ${JSON.stringify({ type: 'connected', state: clientState })}\n\n`
        );
      })
      .catch(() => {});

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(clientEntry);
    });
  }

  // Services
  const emailService = createEmailService({ config, repo, logger });
  const imageStorage = createImageStorageService({ config });
  const authService = createAuthService({
    repo,
    config,
    emailService,
    onTokenIssued: options.onTokenIssued,
  });
  const catalogService = createCatalogService({ repo, imageStorage });
  const inventoryService = createInventoryService({ repo });
  const invoiceService = createInvoiceService({ config });
  const orderService = createOrderService({ repo, config, emailService, broadcastEvent });

  const upiQrAdapter = createUpiQrAdapter({ config, repo, emailService });
  const razorpayAdapter = createRazorpayAdapter({ config, repo });
  const stripeAdapter = createStripeAdapter({ config, repo });
  const paymentVerificationService = createPaymentVerificationService({
    repo,
    emailService,
    broadcastEvent,
  });
  const webhookProcessor = createWebhookProcessor({
    config,
    repo,
    stripeAdapter,
    broadcastEvent,
    logger,
  });
  const paymentService = createPaymentService({
    config,
    repo,
    upiQrAdapter,
    razorpayAdapter,
    stripeAdapter,
  });

  // Express app assembly
  const app = express();
  app.set('trust proxy', 1);
  app.use(createSecurityHeadersMiddleware(config));
  app.use(createRequestLoggerMiddleware(logger));

  // Webhooks must receive raw request body prior to JSON parser
  app.use('/api/webhooks', createWebhooksRouter({ webhookProcessor }));

  app.use(express.json({ limit: '8mb' }));

  const limiters = createRateLimiters(config, options.rateLimitOverrides);
  app.use('/api', limiters.apiLimiter);

  const authMiddleware = createAuthMiddleware({ repo, config });
  app.use(authMiddleware.attachSession);
  app.use(createCsrfMiddleware(config));

  // Serve validated local uploads and product images
  app.use('/uploads', express.static(imageStorage.localUploadDir));
  app.use('/src/assets/images', express.static(path.join(process.cwd(), 'src', 'assets', 'images')));

  // Mount API routes
  app.use('/api', createHealthRouter({ repo, config }));
  app.use(
    '/api/auth',
    createAuthRouter({
      authService,
      authRateLimiter: limiters.authLimiter,
      passwordResetLimiter: limiters.passwordResetLimiter,
      buildClientState,
      config,
    })
  );
  app.use(
    '/api',
    createAccountRouter({
      repo,
      authMiddleware,
      buildClientState,
      subscribeSse,
      broadcastEvent,
    })
  );
  app.use(
    '/api',
    createCatalogRouter({
      repo,
      catalogService,
      orderService,
      authMiddleware,
      buildClientState,
      broadcastEvent,
    })
  );
  app.use(
    '/api/orders',
    createOrdersRouter({
      repo,
      orderService,
      invoiceService,
      authMiddleware,
      checkoutLimiter: limiters.checkoutLimiter,
      buildClientState,
    })
  );
  app.use(
    '/api/payments',
    createPaymentsRouter({
      repo,
      paymentService,
      razorpayAdapter,
      authMiddleware,
      paymentLimiter: limiters.paymentLimiter,
      buildClientState,
      broadcastEvent,
    })
  );
  app.use(
    '/api/admin',
    createAdminRouter({
      repo,
      config,
      catalogService,
      inventoryService,
      orderService,
      paymentVerificationService,
      paymentService,
      authMiddleware,
      buildClientState,
      broadcastEvent,
    })
  );

  app.use(createErrorHandler(logger, config));

  return {
    app,
    config,
    repo,
    logger,
    services: {
      authService,
      catalogService,
      inventoryService,
      invoiceService,
      orderService,
      paymentService,
      paymentVerificationService,
      webhookProcessor,
      emailService,
    },
    closeAll() {
      for (const client of sseClients) {
        try {
          client.res.end();
        } catch {
          // ignore
        }
      }
      sseClients.clear();
    },
  };
}
