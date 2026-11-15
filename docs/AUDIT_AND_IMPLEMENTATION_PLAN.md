# Sylvan Grove (E-Comm) — Phase 0 Audit & Production Upgrade Plan

## 1. Existing Repository Inventory & Architecture

### Entry Points & Build Configuration
- `package.json`: `"type": "module"`, `"dev": "node server.js"`, `"start": "node server.js"`, `"build": "vite build"`, `"lint": "tsc --noEmit"`.
- `vite.config.ts`: React + Tailwind v4 plugin; alias `@` -> project root (`import.meta.dirname`).
- `index.html`: Loads Fraunces, Plus Jakarta Sans, IBM Plex Mono fonts; mounts `/src/main.jsx`.
- `server.js` (921 lines): Monolithic Express + Vite SSR-middleware server managing auth, SSE (`/api/events`), state, preferences, cards, orders, reviews, and admin order endpoints, backed by synchronous `fs.readFileSync`/`fs.writeFileSync` to `.data/store.json`.

### Frontend Modules (`src/`)
- `src/App.jsx`: Top-level state container, hash routing (`#top`, `#account`, `#admin`, `#login`, `#register`), SSE subscription (`/api/events`), localStorage cart (`sylvan-grove-cart-v2`), inline `fetch('/api/*')` calls.
- `src/data/catalog.js`: Static seed catalog (6 organic nut products), 3 weight options (`8oz`, `16oz`, `32oz`), `FREE_SHIPPING_THRESHOLD` ($65), `STANDARD_SHIPPING_FEE` ($6.95), seed reviews, seed store state.
- `src/utils/commerce.js` & `src/utils/commerce.test.js`: Pure helpers (currency rounding, unit price, cart totals, recommendations, admin metrics/filters, Luhn/card validation, registration/review validation) with 12 passing `node:test` unit tests.
- Components:
  - `Navbar.jsx`, `Footer.jsx`, `HeroSection.jsx`
  - `ProductCatalog.jsx` (category tabs, roast dropdown, search, weight selector, rating summary, add to bag)
  - `ProductModal.jsx` & `ProductReviews.jsx` (nutrition table, tasting notes, weight selector, star ratings, review composer)
  - `RecommendationsSection.jsx` (allergen exclusion & dietary goal matching)
  - `AuthPanel.jsx` (sign in & registration tabs)
  - `ShoppingCart.jsx` (slide-over bag, free-shipping progress bar, auth gate, address form, saved/new card form, confirmation view)
  - `Dashboard.jsx`, `dashboard/OrdersTab.jsx`, `dashboard/BillingTab.jsx`, `dashboard/PreferencesTab.jsx`
  - `AdminDashboard.jsx` (4 metric cards, Put Order Live composer, order search/status/visibility filters, status advance, inline tracking/ETA editor, delete)

---

## 2. Audit Findings: Security Issues, Dummy Data & Unfinished Functionality

### Critical Security Vulnerabilities
1. **Hardcoded Default Passwords in Source (`server.js:132-133`)**: `Harvest2026!` (`clara@orchard.test`) and `OrchardAdmin2026!` (`admin@sylvangrove.com`) are hardcoded in `createDefaultUsers()`.
2. **Pre-seeded Password Hashes Committed in `.data/store.json` (`users[0..1]`)** and `.data/` missing from `.gitignore`.
3. **No Session Store / Revocation / Idle Timeout**: Stateless HMAC cookies (`sg_session`) cannot be revoked on logout, password reset, or admin suspension.
4. **No CSRF Protection**: State-changing POST/PUT/PATCH/DELETE endpoints lack CSRF token verification.
5. **No Rate Limiting or Security Headers**: `/api/auth/login`, `/api/auth/register`, and API routes have no brute-force throttling or Helmet/CSP security headers.
6. **Floating-Point Money Math**: Prices, subtotals, shipping, and totals use JS IEEE-754 floats (`roundCurrency`) instead of integer minor units / `Decimal`.
7. **Simulated Card Checkout**: `POST /api/orders` marks every order & invoice immediately as `"paid"` without a real payment gateway or payment verification state; `Payment` and `PaymentWebhookEvent` models do not exist.
8. **Hardcoded/Static File Persistence**: Synchronous full-file rewrites to `.data/store.json` are unsafe under concurrent requests, have no transactions/locking, and are unsuitable for production.
9. **No Inventory Enforcement**: Products have only a boolean `inStock: true`; no variant SKUs, stock quantities, reservations, or oversell protection.
10. **Unsafe Hard Delete in Admin (`DELETE /api/admin/orders/:id`)**: Deletes orders permanently with no audit log or inventory restoration.
11. **Missing Auth Flows**: No forgot-password / email-verified password reset, no email verification, no account status enforcement.
12. **Client-Side Order Sequence Collision Risk**: `ord-${Date.now()}` and `1043 + state.orders.length` can collide under concurrent requests or deletions.

### Unfinished / Missing Production Functionality
- **Database**: No MySQL 8 / Prisma schema, migrations, connection pooling, or pagination.
- **Payments**: No UPI QR flow (INR-gated, QR generation, UTR submission, expiry, admin verification), no Razorpay or Stripe adapters, no webhook deduplication.
- **Customer Features**: No price range filter, wishlist, coupons, multi-image product gallery, multiple saved shipping addresses, invoice PDF download, payment history/status tracking, email notifications, return/refund requests.
- **Admin Features**: No product/variant/inventory CRUD, no low-stock alerts, no customer directory/support controls, no QR payment verification queue, no audit log, no payment/refund-aware financial reports.
- **Asset & Email Services**: Product images are static `/src/assets/images/*` paths with no upload/gallery management; no transactional email service.
- **Testing & CI/CD**: Only 12 frontend unit tests exist; no backend integration tests (Supertest), payment/security tests, E2E Playwright suite, or GitHub Actions CI/CD pipeline.

---

## 3. Baseline Feature Preservation Checklist

- [x] Storefront Hero, Navbar, Footer, Warm Organic Editorial theme (`#F6F1E9`, `#FCFAF6`, `#1B3B2B`, `#7A3E1C`)
- [x] Product Catalog with category tabs, roast profile filter, search, weight selector (`8oz`/`16oz`/`32oz`), rating badges
- [x] Product Detail Modal with nutrition facts, tasting notes, weight switcher, reviews & verified-buyer badge
- [x] Personalized Recommendations excluding allergens & matching roast/dietary goals
- [x] Shopping Bag drawer with quantity controls, free-shipping progress bar ($65), localStorage persistence, auth gate
- [x] Customer Account Dashboard (Overview, Order History 4-stage tracker & Reorder, Preferences & Address, Billing & Saved Cards)
- [x] Admin Order Console (metrics, Put Order Live / Save as Draft composer, filters, stage advance, inline tracking/ETA edit)
- [x] Real-time state sync (SSE `/api/events`)

---

## 4. Sequential Implementation Phases

- **Phase 0**: Repository audit, `.data/` backup (`scripts/backup-store.js`), `.gitignore` hardening, git development branch.
- **Phase 1**: Baseline test verification, remove hardcoded credentials from runtime source, add `scripts/create-admin.js`, update `.env.example`.
- **Phase 2**: Normalized MySQL 8 + Prisma schema (`prisma/schema.prisma`, `prisma/migrations/0001_init/migration.sql`, `prisma/seed.js`) with all 20 models, Decimal/minor-unit currency, indexes, and connection pooling.
- **Phase 3**: JSON-to-MySQL migration & validation scripts (`scripts/migrate-json-to-mysql.js`, `scripts/validate-migration.js`).
- **Phase 4**: Modular Express architecture (`server/config`, `server/database`, `server/repositories`, `server/middleware`, `server/services`, `server/routes`, `server/app.js`), security headers, rate limiting, CSRF, DB-backed sessions, password reset, audit logs.
- **Phase 5**: Temporary UPI QR payment system (strict INR currency guard, `qrcode` URI generation, 15m expiry, UTR submission, admin verification queue + audit log).
- **Phase 6**: Permanent payment gateway architecture (`PaymentService`, `RazorpayAdapter`, `StripeAdapter`, `UpiQrAdapter`, `WebhookProcessor` with deduplication & HMAC signature verification).
- **Phase 7**: Variant inventory management (`8oz`, `16oz`, `32oz`), reservation/commit/release transactions, `InventoryMovement` ledger, order/payment state machine decoupling.
- **Phase 8**: Customer & Admin enhancements (wishlist, coupons, price filter, product gallery, multi-address book, invoice PDF, return/refund requests, transactional email service, image storage adapter, Admin Products/Inventory/Customers/Reports/QR Verification tabs).
- **Phase 9**: Comprehensive unit tests, Supertest API & payment security tests, Playwright E2E tests.
- **Phase 10**: GitHub Actions CI/CD workflow, environment configs (dev/staging/prod), health/readiness endpoints, backup/restore & deployment runbooks.
