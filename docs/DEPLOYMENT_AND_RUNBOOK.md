# Sylvan Grove — Production Deployment & Operations Runbook

## 1. Environment Configuration

Copy `.env.example` to `.env` in your deployment secret manager (never commit `.env`).

Required production variables:
- `NODE_ENV=production`
- `PORT=3000`
- `APP_URL=https://shop.yourdomain.com`
- `DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/sylvan_grove?sslaccept=strict"`
- `SESSION_SECRET`: 64-character CSPRNG hex string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

Optional & payment/integration variables:
- **Currency & Temporary UPI QR**:
  - `STORE_CURRENCY=INR` (UPI QR is strictly rejected unless `STORE_CURRENCY=INR`)
  - `UPI_QR_ENABLED=true`
  - `UPI_MERCHANT_VPA=yourmerchant@bank`
  - `UPI_MERCHANT_NAME="Sylvan Grove Orchard"`
  - `UPI_QR_EXPIRY_MINUTES=15`
- **Razorpay**:
  - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- **Stripe**:
  - `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- **Transactional Email**:
  - `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` + `EMAIL_FROM`
- **Image Storage**:
  - `IMAGE_STORAGE_PROVIDER=s3` (`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_PUBLIC_BASE_URL`) or `cloudinary` (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`)

---

## 2. Database Migration & Admin Provisioning

1. **Back up legacy JSON data** (if upgrading an existing `.data/store.json` instance):
   ```bash
   npm run backup:store
   ```
2. **Apply MySQL 8 migrations & seed baseline catalog**:
   ```bash
   npx prisma migrate deploy
   npm run prisma:seed
   ```
3. **Import legacy `.data/store.json` records (idempotent)** and validate row counts:
   ```bash
   npm run migrate:json
   npm run migrate:validate
   ```
4. **Provision the initial administrator account** (never ship default hardcoded passwords):
   ```bash
   INITIAL_ADMIN_EMAIL=ops@yourdomain.com INITIAL_ADMIN_NAME="Orchard Ops" INITIAL_ADMIN_PASSWORD="StrongUniquePassword!" npm run admin:create
   ```

---

## 3. Manual UPI QR Operations & Gateway Cutover

- **Temporary UPI QR Workflow (`STORE_CURRENCY=INR`)**:
  1. Customer selects **UPI QR Code (Manual Verification)** at checkout -> Order starts in `AWAITING_PAYMENT`, Payment `PENDING`.
  2. Customer scans dynamic `upi://pay?...&cu=INR` QR code (15-minute expiry) and submits their 10–22 char UTR reference. Payment transitions to `PENDING_MANUAL_VERIFICATION` — never auto-captured.
  3. Admin reconciles UTR & amount in bank settlement statement via **Admin -> UPI & Payments Queue**, checks the bank confirmation checkbox, and clicks **Mark Verified & Paid** (`CAPTURED` + `PLACED` + invoice `PAID` + audit log), or **Reject** with reason so the customer can retry cleanly without duplicating the order.
- **Cutover to Automated Gateways (Razorpay / Stripe)**:
  1. Configure `RAZORPAY_*` or `STRIPE_*` keys and register webhooks pointing to:
     - `https://shop.yourdomain.com/api/webhooks/razorpay`
     - `https://shop.yourdomain.com/api/webhooks/stripe`
  2. Set `UPI_QR_ENABLED=false` (after reconciling any open `PENDING_MANUAL_VERIFICATION` records).

---

## 4. Health Checks, Backup & Rollback

- **Liveness**: `GET /api/health`
- **Readiness (verifies DB connectivity)**: `GET /api/ready`
- **Backup & Restore**: Schedule automated daily `mysqldump --single-transaction` snapshots with encrypted off-site retention. To roll back a release, stop application workers before running down-migrations, restore the pre-deploy MySQL snapshot if schema changed, and redeploy the prior artifact tag.
