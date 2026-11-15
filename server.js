import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  DEFAULT_PUBLIC_PREFERENCES,
  FREE_SHIPPING_THRESHOLD,
  INITIAL_REVIEWS,
  INITIAL_STORE_STATE,
  STANDARD_SHIPPING_FEE,
  WEIGHT_OPTIONS,
} from './src/data/catalog.js';
import {
  detectCardBrand,
  hasUserPurchasedProduct,
  roundCurrency,
  validateProductReviewInput,
  validateRegistrationInput,
} from './src/utils/commerce.js';

const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), '.data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const SECRET_FILE = path.join(DATA_DIR, 'session-secret.txt');
const SESSION_COOKIE_NAME = 'sg_session';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const VALID_ORDER_STATUSES = new Set(['placed', 'packed', 'in_transit', 'delivered', 'cancelled']);

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getSessionSecret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  ensureDataDir();
  if (fs.existsSync(SECRET_FILE)) {
    const existing = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
    if (existing.length >= 32) return existing;
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, 'utf-8');
  return generated;
}

const SESSION_SECRET = getSessionSecret();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, passwordHash: derived };
}

function verifyPassword(password, salt, expectedHash) {
  if (!password || !salt || !expectedHash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function signSessionToken(userId, role) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      role,
      exp: Date.now() + SESSION_MAX_AGE_MS,
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  const payload = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!decoded?.sub || !decoded?.exp || decoded.exp < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = decodeURIComponent(part.slice(eqIdx + 1).trim());
    cookies[key] = val;
  }
  return cookies;
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function createDefaultUsers() {
  const seed = JSON.parse(JSON.stringify(INITIAL_STORE_STATE));
  const claraCreds = hashPassword('Harvest2026!');
  const adminCreds = hashPassword('OrchardAdmin2026!');

  return [
    {
      id: 'usr-clara',
      email: 'clara@orchard.test',
      fullName: 'Clara Vance',
      role: 'customer',
      createdAt: '2026-09-12T16:00:00.000Z',
      ...claraCreds,
      preferences: seed.preferences,
      paymentMethods: seed.paymentMethods,
      invoices: seed.invoices,
    },
    {
      id: 'usr-admin',
      email: 'admin@sylvangrove.com',
      fullName: 'Orchard Administrator',
      role: 'admin',
      createdAt: '2026-09-01T12:00:00.000Z',
      ...adminCreds,
      preferences: {
        ...JSON.parse(JSON.stringify(DEFAULT_PUBLIC_PREFERENCES)),
        shippingAddress: {
          fullName: 'Sylvan Grove Fulfillment Desk',
          street: '100 Orchard Mill Road',
          city: 'McMinnville',
          state: 'OR',
          postalCode: '97128',
          phone: '(503) 555-0100',
        },
      },
      paymentMethods: [],
      invoices: [],
    },
  ];
}

function getSeedState() {
  const seed = JSON.parse(JSON.stringify(INITIAL_STORE_STATE));
  const users = createDefaultUsers();
  return {
    catalog: seed.catalog,
    reviews: JSON.parse(JSON.stringify(INITIAL_REVIEWS)),
    users,
    orders: seed.orders.map((ord) => ({
      ...ord,
      userId: ord.userId || 'usr-clara',
      isLive: ord.isLive !== false,
      source: ord.source || 'storefront',
    })),
  };
}

function normalizeStore(raw) {
  const seed = getSeedState();
  let users = Array.isArray(raw.users) && raw.users.length > 0 ? raw.users : seed.users;

  // Ensure both default accounts exist if upgrading from an older store.json
  const hasAdmin = users.some((u) => u.role === 'admin');
  if (!hasAdmin) {
    users = [...users, seed.users.find((u) => u.role === 'admin')];
  }

  return {
    catalog: Array.isArray(raw.catalog) ? raw.catalog : seed.catalog,
    reviews: Array.isArray(raw.reviews) ? raw.reviews : seed.reviews,
    users: users.map((u) => ({
      ...u,
      preferences: u.preferences
        ? {
            ...JSON.parse(JSON.stringify(DEFAULT_PUBLIC_PREFERENCES)),
            ...u.preferences,
            shippingAddress: {
              ...DEFAULT_PUBLIC_PREFERENCES.shippingAddress,
              ...(u.preferences.shippingAddress || {}),
            },
          }
        : JSON.parse(JSON.stringify(DEFAULT_PUBLIC_PREFERENCES)),
      paymentMethods: Array.isArray(u.paymentMethods) ? u.paymentMethods : [],
      invoices: Array.isArray(u.invoices) ? u.invoices : [],
    })),
    orders: Array.isArray(raw.orders)
      ? raw.orders.map((ord) => ({
          ...ord,
          userId: ord.userId === undefined ? 'usr-clara' : ord.userId,
          isLive: ord.isLive !== false,
          source: ord.source || 'storefront',
        }))
      : seed.orders,
  };
}

function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.catalog) && Array.isArray(parsed.orders)) {
        const normalized = normalizeStore(parsed);
        saveStore(normalized);
        return normalized;
      }
    }
  } catch {
    // Fallback to seed state if corrupted
  }
  const seed = getSeedState();
  saveStore(seed);
  return seed;
}

function saveStore(state) {
  ensureDataDir();
  fs.writeFileSync(STORE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function buildClientState(store, user) {
  const publicPrefs = JSON.parse(JSON.stringify(DEFAULT_PUBLIC_PREFERENCES));
  const reviews = Array.isArray(store.reviews) ? store.reviews : [];

  if (!user) {
    return {
      user: null,
      catalog: store.catalog,
      reviews,
      preferences: publicPrefs,
      paymentMethods: [],
      invoices: [],
      orders: [],
    };
  }

  if (user.role === 'admin') {
    const allInvoices = store.users.flatMap((u) => u.invoices || []);
    return {
      user: sanitizeUser(user),
      catalog: store.catalog,
      reviews,
      preferences: user.preferences,
      paymentMethods: user.paymentMethods,
      invoices: allInvoices,
      orders: store.orders,
    };
  }

  return {
    user: sanitizeUser(user),
    catalog: store.catalog,
    reviews,
    preferences: user.preferences,
    paymentMethods: user.paymentMethods,
    invoices: user.invoices,
    orders: store.orders.filter((o) => o.isLive !== false && o.userId === user.id),
  };
}

function buildOrderLineItems(items, catalog) {
  const orderItems = [];
  let subtotal = 0;

  for (const cartItem of items) {
    const product = catalog.find((p) => p.id === cartItem.productId);
    const qty = Number(cartItem.quantity);
    if (!product || !Number.isFinite(qty) || qty <= 0) continue;
    const weightMeta = WEIGHT_OPTIONS[cartItem.weightSize] || WEIGHT_OPTIONS['16oz'];
    const unitPrice = roundCurrency(product.basePrice16oz * weightMeta.priceMultiplier);
    subtotal += unitPrice * qty;

    orderItems.push({
      productId: product.id,
      productName: product.name,
      weightSize: weightMeta.size,
      weightLabel: weightMeta.label,
      quantity: qty,
      unitPrice,
    });
  }

  subtotal = roundCurrency(subtotal);
  const shippingFee = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_FEE;
  const total = roundCurrency(subtotal + shippingFee);

  return { orderItems, subtotal, shippingFee, total };
}

function getSessionCookieOptions(req) {
  const isHttps =
    Boolean(req?.secure) ||
    String(req?.headers?.['x-forwarded-proto'] || '')
      .split(',')[0]
      .trim()
      .toLowerCase() === 'https';

  return {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  };
}

function setSessionCookie(req, res, token) {
  res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions(req));
}

async function startServer() {
  const app = express();
  app.use(express.json());

  let state = loadStore();
  const sseClients = new Set();

  function getUserFromRequest(req) {
    const cookies = parseCookies(req.headers.cookie);
    const decoded = verifySessionToken(cookies[SESSION_COOKIE_NAME]);
    if (!decoded) return null;
    return state.users.find((u) => u.id === decoded.sub) || null;
  }

  function broadcastState(eventType = 'state_updated') {
    for (const client of sseClients) {
      const freshUser = client.userId
        ? state.users.find((u) => u.id === client.userId) || null
        : null;
      const payload = JSON.stringify({
        type: eventType,
        state: buildClientState(state, freshUser),
      });
      client.res.write(`event: state\ndata: ${payload}\n\n`);
    }
  }

  function requireAuth(req, res, next) {
    const user = getUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required. Please sign in or create an account.' });
      return;
    }
    req.user = user;
    next();
  }

  function requireAdmin(req, res, next) {
    const user = getUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: 'Administrator sign-in required.' });
      return;
    }
    if (user.role !== 'admin') {
      res.status(403).json({ error: 'Access denied. Administrator role is required.' });
      return;
    }
    req.user = user;
    next();
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = getUserFromRequest(req);
    res.json({ user: sanitizeUser(user) });
  });

  app.post('/api/auth/register', (req, res) => {
    const { fullName = '', email = '', password = '' } = req.body || {};
    const validation = validateRegistrationInput({ fullName, email, password });

    if (!validation.valid) {
      const firstError =
        validation.errors.fullName || validation.errors.email || validation.errors.password;
      res.status(400).json({ error: firstError, errors: validation.errors });
      return;
    }

    const exists = state.users.some((u) => u.email.toLowerCase() === validation.normalizedEmail);
    if (exists) {
      res.status(409).json({ error: 'An account with this email address already exists.' });
      return;
    }

    const { salt, passwordHash } = hashPassword(password);
    const newUser = {
      id: `usr-${Date.now()}`,
      email: validation.normalizedEmail,
      fullName: fullName.trim(),
      role: 'customer',
      createdAt: new Date().toISOString(),
      salt,
      passwordHash,
      preferences: {
        ...JSON.parse(JSON.stringify(DEFAULT_PUBLIC_PREFERENCES)),
        shippingAddress: {
          ...DEFAULT_PUBLIC_PREFERENCES.shippingAddress,
          fullName: fullName.trim(),
        },
      },
      paymentMethods: [],
      invoices: [],
    };

    state = {
      ...state,
      users: [...state.users, newUser],
    };
    saveStore(state);

    const token = signSessionToken(newUser.id, newUser.role);
    setSessionCookie(req, res, token);
    res.status(201).json({
      user: sanitizeUser(newUser),
      state: buildClientState(state, newUser),
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email = '', password = '' } = req.body || {};
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = state.users.find((u) => u.email.toLowerCase() === normalizedEmail);

    if (!user || !verifyPassword(String(password), user.salt, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid email address or password.' });
      return;
    }

    const token = signSessionToken(user.id, user.role);
    setSessionCookie(req, res, token);
    res.json({
      user: sanitizeUser(user),
      state: buildClientState(state, user),
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const cookieOpts = getSessionCookieOptions(req);
    res.clearCookie(SESSION_COOKIE_NAME, {
      path: '/',
      sameSite: cookieOpts.sameSite,
      secure: cookieOpts.secure,
    });
    res.json({ user: null, state: buildClientState(state, null) });
  });

  app.get('/api/state', (req, res) => {
    const user = getUserFromRequest(req);
    res.json(buildClientState(state, user));
  });

  app.get('/api/events', (req, res) => {
    const user = getUserFromRequest(req);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const clientEntry = { res, userId: user?.id || null };
    res.write(
      `event: state\ndata: ${JSON.stringify({
        type: 'connected',
        state: buildClientState(state, user),
      })}\n\n`
    );
    sseClients.add(clientEntry);

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(clientEntry);
    });
  });

  app.put('/api/preferences', requireAuth, (req, res) => {
    const patch = req.body || {};
    const updatedUser = {
      ...req.user,
      preferences: {
        ...req.user.preferences,
        ...patch,
        shippingAddress: patch.shippingAddress
          ? { ...req.user.preferences.shippingAddress, ...patch.shippingAddress }
          : req.user.preferences.shippingAddress,
      },
    };

    state = {
      ...state,
      users: state.users.map((u) => (u.id === req.user.id ? updatedUser : u)),
    };
    saveStore(state);
    broadcastState('preferences_updated');
    res.json(buildClientState(state, updatedUser));
  });

  app.post('/api/payment-methods', requireAuth, (req, res) => {
    const { cardNumber, cardholderName, expMonth, expYear, billingZip, setAsDefault } =
      req.body || {};

    const digits = (cardNumber || '').replace(/\D/g, '');
    if (digits.length < 15 || digits.length > 16 || !cardholderName?.trim()) {
      res.status(400).json({ error: 'Invalid payment method details provided.' });
      return;
    }

    const newCard = {
      id: `pm-${Date.now()}`,
      brand: detectCardBrand(digits),
      last4: digits.slice(-4),
      expMonth: String(expMonth).padStart(2, '0'),
      expYear: String(expYear).length === 2 ? `20${expYear}` : String(expYear),
      cardholderName: cardholderName.trim(),
      billingZip: String(billingZip).trim(),
      isDefault: Boolean(setAsDefault) || req.user.paymentMethods.length === 0,
    };

    const updatedCards = newCard.isDefault
      ? [...req.user.paymentMethods.map((pm) => ({ ...pm, isDefault: false })), newCard]
      : [...req.user.paymentMethods, newCard];

    const updatedUser = {
      ...req.user,
      paymentMethods: updatedCards,
    };

    state = {
      ...state,
      users: state.users.map((u) => (u.id === req.user.id ? updatedUser : u)),
    };
    saveStore(state);
    broadcastState('payment_methods_updated');
    res.status(201).json({ card: newCard, state: buildClientState(state, updatedUser) });
  });

  app.patch('/api/payment-methods/:id/default', requireAuth, (req, res) => {
    const { id } = req.params;
    const exists = req.user.paymentMethods.some((pm) => pm.id === id);
    if (!exists) {
      res.status(404).json({ error: 'Payment method not found.' });
      return;
    }

    const updatedUser = {
      ...req.user,
      paymentMethods: req.user.paymentMethods.map((pm) => ({ ...pm, isDefault: pm.id === id })),
    };

    state = {
      ...state,
      users: state.users.map((u) => (u.id === req.user.id ? updatedUser : u)),
    };
    saveStore(state);
    broadcastState('payment_methods_updated');
    res.json(buildClientState(state, updatedUser));
  });

  app.delete('/api/payment-methods/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const target = req.user.paymentMethods.find((pm) => pm.id === id);
    if (!target) {
      res.status(404).json({ error: 'Payment method not found.' });
      return;
    }
    if (target.isDefault || req.user.paymentMethods.length <= 1) {
      res.status(400).json({ error: 'Cannot remove your active default payment method.' });
      return;
    }

    const updatedUser = {
      ...req.user,
      paymentMethods: req.user.paymentMethods.filter((pm) => pm.id !== id),
    };

    state = {
      ...state,
      users: state.users.map((u) => (u.id === req.user.id ? updatedUser : u)),
    };
    saveStore(state);
    broadcastState('payment_methods_updated');
    res.json(buildClientState(state, updatedUser));
  });

  // Customer checkout endpoint — strictly authenticated users only
  app.post('/api/orders', requireAuth, (req, res) => {
    const { items, paymentMethodId, shippingAddress } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Your bag is empty.' });
      return;
    }

    const card =
      req.user.paymentMethods.find((pm) => pm.id === paymentMethodId) ||
      req.user.paymentMethods.find((pm) => pm.isDefault);

    if (!card) {
      res.status(400).json({ error: 'Please select or enter a valid payment card.' });
      return;
    }

    if (
      !shippingAddress?.fullName?.trim() ||
      !shippingAddress?.street?.trim() ||
      !shippingAddress?.city?.trim() ||
      !shippingAddress?.postalCode?.trim()
    ) {
      res.status(400).json({ error: 'Complete all required shipping address fields.' });
      return;
    }

    const { orderItems, subtotal, shippingFee, total } = buildOrderLineItems(items, state.catalog);

    if (orderItems.length === 0) {
      res.status(400).json({ error: 'No valid products found in checkout.' });
      return;
    }

    const nextSeq = 1043 + state.orders.length;
    const nowIso = new Date().toISOString();
    const deliveryDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const newOrder = {
      id: `ord-${Date.now()}`,
      userId: req.user.id,
      orderNumber: `SG-2026-${nextSeq}`,
      placedAt: nowIso,
      status: 'placed',
      isLive: true,
      source: 'storefront',
      trackingNumber: `1Z999AA101${Math.floor(10000000 + Math.random() * 89999999)}`,
      estimatedDelivery: deliveryDate,
      items: orderItems,
      subtotal,
      shippingFee,
      total,
      paymentSummary: `${card.brand} •••• ${card.last4}`,
      shippingAddress: {
        fullName: shippingAddress.fullName.trim(),
        street: shippingAddress.street.trim(),
        city: shippingAddress.city.trim(),
        state: (shippingAddress.state || 'OR').trim(),
        postalCode: shippingAddress.postalCode.trim(),
        phone: (shippingAddress.phone || '').trim(),
      },
    };

    const newInvoice = {
      id: `inv-${Date.now()}`,
      date: nowIso.slice(0, 10),
      description: `Order ${newOrder.orderNumber} · ${orderItems.reduce((acc, i) => acc + i.quantity, 0)} Bag(s)`,
      amount: total,
      status: 'paid',
      paymentMethodSummary: `${card.brand} •••• ${card.last4}`,
    };

    const updatedUser = {
      ...req.user,
      invoices: [newInvoice, ...req.user.invoices],
      preferences: {
        ...req.user.preferences,
        shippingAddress: newOrder.shippingAddress,
      },
    };

    state = {
      ...state,
      orders: [newOrder, ...state.orders],
      users: state.users.map((u) => (u.id === req.user.id ? updatedUser : u)),
    };

    saveStore(state);
    broadcastState('order_placed');
    res.status(201).json({ order: newOrder, state: buildClientState(state, updatedUser) });
  });

  // Product reviews — logged-in users can submit feedback on products
  app.post('/api/products/:productId/reviews', requireAuth, (req, res) => {
    const { productId } = req.params;
    const product = state.catalog.find((p) => p.id === productId);
    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }

    const { rating, title = '', comment = '' } = req.body || {};
    const validation = validateProductReviewInput({ rating, title, comment });
    if (!validation.valid) {
      const firstErr =
        validation.errors.rating || validation.errors.title || validation.errors.comment;
      res.status(400).json({ error: firstErr, errors: validation.errors });
      return;
    }

    const verifiedPurchase = hasUserPurchasedProduct(state.orders, productId, req.user.id);
    const newReview = {
      id: `rev-${Date.now()}`,
      productId,
      userId: req.user.id,
      authorName: req.user.fullName,
      rating: Number(rating),
      title: String(title).trim(),
      comment: String(comment).trim(),
      verifiedPurchase,
      createdAt: new Date().toISOString(),
    };

    state = {
      ...state,
      reviews: [newReview, ...(state.reviews || [])],
    };

    saveStore(state);
    broadcastState('review_added');
    res.status(201).json({ review: newReview, state: buildClientState(state, req.user) });
  });

  app.delete('/api/reviews/:reviewId', requireAuth, (req, res) => {
    const { reviewId } = req.params;
    const target = (state.reviews || []).find((r) => r.id === reviewId);
    if (!target) {
      res.status(404).json({ error: 'Review not found.' });
      return;
    }
    if (target.userId !== req.user.id && req.user.role !== 'admin') {
      res.status(403).json({ error: 'You can only delete your own reviews.' });
      return;
    }

    state = {
      ...state,
      reviews: (state.reviews || []).filter((r) => r.id !== reviewId),
    };

    saveStore(state);
    broadcastState('review_deleted');
    res.json(buildClientState(state, req.user));
  });

  // Admin: Read all orders
  app.get('/api/admin/orders', requireAdmin, (_req, res) => {
    res.json({ orders: state.orders });
  });

  // Admin: Put a new order live (or save as draft)
  app.post('/api/admin/orders', requireAdmin, (req, res) => {
    const {
      items,
      shippingAddress,
      customerEmail,
      paymentSummary,
      status = 'placed',
      isLive = true,
      estimatedDelivery,
      notes,
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Add at least one product to publish an order.' });
      return;
    }

    if (
      !shippingAddress?.fullName?.trim() ||
      !shippingAddress?.street?.trim() ||
      !shippingAddress?.city?.trim() ||
      !shippingAddress?.postalCode?.trim()
    ) {
      res.status(400).json({ error: 'Complete customer name, street, city, and ZIP code.' });
      return;
    }

    const safeStatus = VALID_ORDER_STATUSES.has(status) ? status : 'placed';
    const { orderItems, subtotal, shippingFee, total } = buildOrderLineItems(items, state.catalog);

    if (orderItems.length === 0) {
      res.status(400).json({ error: 'Selected products are invalid.' });
      return;
    }

    const matchedCustomer = customerEmail
      ? state.users.find((u) => u.email.toLowerCase() === String(customerEmail).trim().toLowerCase())
      : null;

    const nextSeq = 1043 + state.orders.length;
    const nowIso = new Date().toISOString();
    const defaultDelivery = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const newOrder = {
      id: `ord-${Date.now()}`,
      userId: matchedCustomer?.id || null,
      orderNumber: `SG-2026-${nextSeq}`,
      placedAt: nowIso,
      status: safeStatus,
      isLive: Boolean(isLive),
      source: 'admin',
      trackingNumber: `1Z999AA101${Math.floor(10000000 + Math.random() * 89999999)}`,
      estimatedDelivery: estimatedDelivery || defaultDelivery,
      items: orderItems,
      subtotal,
      shippingFee,
      total,
      paymentSummary: (paymentSummary || 'Direct Orchard Invoice').trim(),
      notes: (notes || '').trim(),
      shippingAddress: {
        fullName: shippingAddress.fullName.trim(),
        street: shippingAddress.street.trim(),
        city: shippingAddress.city.trim(),
        state: (shippingAddress.state || 'OR').trim(),
        postalCode: shippingAddress.postalCode.trim(),
        phone: (shippingAddress.phone || '').trim(),
      },
    };

    state = {
      ...state,
      orders: [newOrder, ...state.orders],
    };

    saveStore(state);
    broadcastState('admin_order_created');
    res.status(201).json({ order: newOrder, state: buildClientState(state, req.user) });
  });

  // Admin: Manage order
  app.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const existing = state.orders.find((o) => o.id === id);
    if (!existing) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    const { status, isLive, trackingNumber, estimatedDelivery, notes } = req.body || {};

    if (status !== undefined && !VALID_ORDER_STATUSES.has(status)) {
      res.status(400).json({ error: 'Invalid order status.' });
      return;
    }

    const updatedOrder = {
      ...existing,
      ...(status !== undefined ? { status } : {}),
      ...(typeof isLive === 'boolean' ? { isLive } : {}),
      ...(trackingNumber !== undefined ? { trackingNumber: String(trackingNumber).trim() } : {}),
      ...(estimatedDelivery !== undefined
        ? { estimatedDelivery: String(estimatedDelivery).slice(0, 10) }
        : {}),
      ...(notes !== undefined ? { notes: String(notes).trim() } : {}),
    };

    state = {
      ...state,
      orders: state.orders.map((o) => (o.id === id ? updatedOrder : o)),
    };

    saveStore(state);
    broadcastState('admin_order_updated');
    res.json({ order: updatedOrder, state: buildClientState(state, req.user) });
  });

  // Admin: Delete order
  app.delete('/api/admin/orders/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const exists = state.orders.some((o) => o.id === id);
    if (!exists) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }

    state = {
      ...state,
      orders: state.orders.filter((o) => o.id !== id),
    };

    saveStore(state);
    broadcastState('admin_order_deleted');
    res.json(buildClientState(state, req.user));
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use('/src/assets/images', express.static(path.join(process.cwd(), 'src', 'assets', 'images')));
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sylvan Grove server running at http://localhost:${PORT}`);
  });
}

startServer();
