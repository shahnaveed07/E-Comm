import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { backupStoreFile } from './backup-store.js';
import { WEIGHT_OPTIONS } from '../src/data/catalog.js';

const DEMO_EMAILS = new Set(['clara@orchard.test', 'admin@sylvangrove.com']);

const ORDER_STATUS_MAP = {
  awaiting_payment: 'AWAITING_PAYMENT',
  placed: 'PLACED',
  packed: 'PACKED',
  in_transit: 'IN_TRANSIT',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
};

function toMinor(value) {
  return Math.round(Number(value || 0) * 100);
}

function toDecStr(minor) {
  return (minor / 100).toFixed(2);
}

export async function migrateJsonStoreToMysql(prisma, {
  storeFile = path.resolve(process.cwd(), '.data', 'store.json'),
  includeDemoUsers = false,
  currency = (process.env.STORE_CURRENCY || 'USD').toUpperCase(),
} = {}) {
  const backup = backupStoreFile({ sourceFile: storeFile });
  const raw = fs.readFileSync(storeFile, 'utf-8');
  const data = JSON.parse(raw);

  const report = {
    startedAt: new Date().toISOString(),
    backupFile: backup.targetFile,
    currency,
    imported: { categories: 0, products: 0, variants: 0, users: 0, reviews: 0, orders: 0, orderItems: 0, invoices: 0 },
    skipped: { demoUsers: [], invalidReviews: [], duplicateOrders: [], invalidOrders: [] },
    totals: { sourceLiveOrderMinor: 0, migratedLiveOrderMinor: 0 },
  };

  // 1. Categories & Products
  const categoryIds = {};
  const categoryDefs = [
    { slug: 'walnuts', name: 'Walnuts', sortOrder: 1 },
    { slug: 'almonds', name: 'Almonds', sortOrder: 2 },
    { slug: 'pistachios_hazelnuts', name: 'Pistachios & Hazelnuts', sortOrder: 3 },
    { slug: 'pecans_medleys', name: 'Pecans & Medleys', sortOrder: 4 },
  ];

  for (const cat of categoryDefs) {
    const upserted = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, sortOrder: cat.sortOrder },
      create: cat,
    });
    categoryIds[cat.slug] = upserted.id;
    report.imported.categories += 1;
  }

  for (const prod of data.catalog || []) {
    if (!prod?.id || !prod?.slug) continue;
    const catId = categoryIds[prod.category] || categoryIds.walnuts;
    await prisma.product.upsert({
      where: { id: prod.id },
      update: {
        slug: prod.slug,
        name: prod.name,
        categoryId: catId,
        origin: prod.origin,
        harvestBatch: prod.harvestBatch,
        roastProfile: prod.roastProfile,
        roastLabel: prod.roastLabel,
        shortDescription: prod.shortDescription,
        tastingNotes: prod.tastingNotes,
        nutritionPerServing: prod.nutritionPerServing,
        dietaryTags: prod.dietaryTags || [],
        allergens: prod.allergens || [],
        featuredTag: prod.featuredTag || null,
        isVisible: true,
        isArchived: false,
      },
      create: {
        id: prod.id,
        slug: prod.slug,
        name: prod.name,
        categoryId: catId,
        origin: prod.origin,
        harvestBatch: prod.harvestBatch,
        roastProfile: prod.roastProfile,
        roastLabel: prod.roastLabel,
        shortDescription: prod.shortDescription,
        tastingNotes: prod.tastingNotes,
        nutritionPerServing: prod.nutritionPerServing,
        dietaryTags: prod.dietaryTags || [],
        allergens: prod.allergens || [],
        featuredTag: prod.featuredTag || null,
        isVisible: true,
        isArchived: false,
      },
    });
    report.imported.products += 1;

    for (const sizeKey of ['8oz', '16oz', '32oz']) {
      const opt = WEIGHT_OPTIONS[sizeKey];
      const priceMinor = toMinor(prod.basePrice16oz * opt.priceMultiplier);
      const sku = `${prod.id.replace('prod-', 'SG-').toUpperCase()}-${sizeKey.toUpperCase()}`;
      await prisma.productVariant.upsert({
        where: { productId_weightSize: { productId: prod.id, weightSize: sizeKey } },
        update: {
          weightLabel: opt.label,
          grams: opt.grams,
          currency,
          priceMinor,
          priceDecimal: toDecStr(priceMinor),
          isActive: prod.inStock !== false,
        },
        create: {
          productId: prod.id,
          sku,
          weightSize: sizeKey,
          weightLabel: opt.label,
          grams: opt.grams,
          currency,
          priceMinor,
          priceDecimal: toDecStr(priceMinor),
          stockQuantity: 45,
          reservedStock: 0,
          lowStockThreshold: 8,
          isActive: prod.inStock !== false,
        },
      });
      report.imported.variants += 1;
    }

    const imgs = await prisma.productImage.findMany({ where: { productId: prod.id } });
    if (imgs.length === 0 && prod.imageUrl) {
      await prisma.productImage.create({
        data: {
          productId: prod.id,
          url: prod.imageUrl,
          provider: 'local',
          altText: `${prod.name} from ${prod.origin}`,
          sortOrder: 0,
          isPrimary: true,
        },
      });
    }
  }

  // 2. Eligible Users (exclude demo/sample accounts in production unless explicitly requested)
  const importedUserIds = new Set();
  for (const user of data.users || []) {
    const email = String(user?.email || '').trim().toLowerCase();
    if (!email) continue;
    if (!includeDemoUsers && DEMO_EMAILS.has(email)) {
      report.skipped.demoUsers.push(email);
      continue;
    }

    const role = user.role === 'admin' ? 'ADMIN' : 'CUSTOMER';
    await prisma.user.upsert({
      where: { email },
      update: {
        fullName: user.fullName || email,
        role,
      },
      create: {
        id: user.id,
        email,
        fullName: user.fullName || email,
        role,
        status: 'ACTIVE',
        passwordHash: user.passwordHash || '',
        passwordAlgo: user.salt ? 'scrypt-legacy' : 'bcrypt',
        passwordSalt: user.salt || null,
        createdAt: user.createdAt ? new Date(user.createdAt) : new Date(),
      },
    });
    importedUserIds.add(user.id);
    report.imported.users += 1;

    const prefs = user.preferences || {};
    await prisma.customerPreference.upsert({
      where: { userId: user.id },
      update: {
        preferredRoast: prefs.preferredRoast || 'raw_sprouted',
        dietaryGoals: prefs.dietaryGoals || [],
        excludedAllergens: prefs.excludedAllergens || [],
        emailUpdates: prefs.emailUpdates !== false,
        smsDeliveryAlerts: Boolean(prefs.smsDeliveryAlerts),
      },
      create: {
        userId: user.id,
        preferredRoast: prefs.preferredRoast || 'raw_sprouted',
        dietaryGoals: prefs.dietaryGoals || [],
        excludedAllergens: prefs.excludedAllergens || [],
        emailUpdates: prefs.emailUpdates !== false,
        smsDeliveryAlerts: Boolean(prefs.smsDeliveryAlerts),
      },
    });

    if (prefs.shippingAddress?.street) {
      const existingAddrs = await prisma.address.findMany({ where: { userId: user.id } });
      if (existingAddrs.length === 0) {
        await prisma.address.create({
          data: {
            userId: user.id,
            label: 'Primary',
            fullName: prefs.shippingAddress.fullName || user.fullName || '',
            street: prefs.shippingAddress.street,
            city: prefs.shippingAddress.city || '',
            state: prefs.shippingAddress.state || '',
            postalCode: prefs.shippingAddress.postalCode || '',
            countryCode: 'US',
            phone: prefs.shippingAddress.phone || '',
            isDefault: true,
          },
        });
      }
    }

    for (const pm of user.paymentMethods || []) {
      await prisma.savedPaymentMethod.upsert({
        where: { id: pm.id },
        update: { isDefault: Boolean(pm.isDefault) },
        create: {
          id: pm.id,
          userId: user.id,
          provider: 'CARD_TOKEN',
          tokenRef: `migrated_${pm.id}`,
          brand: pm.brand || 'Card',
          last4: String(pm.last4 || '0000').slice(-4),
          expMonth: String(pm.expMonth || '01').padStart(2, '0'),
          expYear: String(pm.expYear || '2028'),
          cardholderName: pm.cardholderName || user.fullName || '',
          billingZip: String(pm.billingZip || ''),
          isDefault: Boolean(pm.isDefault),
        },
      });
    }
  }

  // 3. Reviews (only for existing products and imported users)
  for (const rev of data.reviews || []) {
    if (!rev?.id || !rev?.productId || !importedUserIds.has(rev.userId)) {
      report.skipped.invalidReviews.push(rev?.id || 'unknown');
      continue;
    }
    await prisma.review.upsert({
      where: { id: rev.id },
      update: { rating: Number(rev.rating) || 5, title: rev.title, comment: rev.comment },
      create: {
        id: rev.id,
        productId: rev.productId,
        userId: rev.userId,
        authorName: rev.authorName || 'Customer',
        rating: Math.min(5, Math.max(1, Number(rev.rating) || 5)),
        title: rev.title || 'Harvest Review',
        comment: rev.comment || '',
        verifiedPurchase: Boolean(rev.verifiedPurchase),
        createdAt: rev.createdAt ? new Date(rev.createdAt) : new Date(),
      },
    });
    report.imported.reviews += 1;
  }

  // 4. Orders & Items
  const seenOrderNumbers = new Set();
  for (const ord of data.orders || []) {
    if (!ord?.id || !ord?.orderNumber || !Array.isArray(ord.items) || ord.items.length === 0) {
      report.skipped.invalidOrders.push(ord?.id || 'unknown');
      continue;
    }
    if (seenOrderNumbers.has(ord.orderNumber)) {
      report.skipped.duplicateOrders.push(ord.orderNumber);
      continue;
    }
    seenOrderNumbers.add(ord.orderNumber);

    const subtotalMinor = toMinor(ord.subtotal);
    const shippingFeeMinor = toMinor(ord.shippingFee);
    const totalMinor = toMinor(ord.total);
    if (ord.status !== 'cancelled') {
      report.totals.sourceLiveOrderMinor += totalMinor;
    }

    const mappedStatus = ORDER_STATUS_MAP[ord.status] || 'PLACED';
    const mappedPaymentStatus = mappedStatus === 'CANCELLED' ? 'CANCELLED' : 'CAPTURED';
    const linkedUserId = ord.userId && importedUserIds.has(ord.userId) ? ord.userId : null;

    await prisma.order.upsert({
      where: { id: ord.id },
      update: {
        status: mappedStatus,
        paymentStatus: mappedPaymentStatus,
        isLive: ord.isLive !== false,
        trackingNumber: ord.trackingNumber || '',
        estimatedDelivery: ord.estimatedDelivery || null,
      },
      create: {
        id: ord.id,
        orderNumber: ord.orderNumber,
        userId: linkedUserId,
        status: mappedStatus,
        paymentStatus: mappedPaymentStatus,
        isLive: ord.isLive !== false,
        source: ord.source || 'storefront',
        currency,
        subtotalMinor,
        shippingFeeMinor,
        discountMinor: 0,
        totalMinor,
        totalDecimal: toDecStr(totalMinor),
        paymentSummary: ord.paymentSummary || 'Imported Card',
        trackingNumber: ord.trackingNumber || '',
        estimatedDelivery: ord.estimatedDelivery || null,
        notes: ord.notes || null,
        shippingAddress: ord.shippingAddress || {},
        placedAt: ord.placedAt ? new Date(ord.placedAt) : new Date(),
      },
    });
    report.imported.orders += 1;
    if (ord.status !== 'cancelled') {
      report.totals.migratedLiveOrderMinor += totalMinor;
    }

    const existingItems = await prisma.orderItem.findMany({ where: { orderId: ord.id } });
    if (existingItems.length === 0) {
      for (const line of ord.items) {
        const variant = await prisma.productVariant.findUnique({
          where: {
            productId_weightSize: {
              productId: line.productId,
              weightSize: line.weightSize || '16oz',
            },
          },
        });
        const unitMinor = toMinor(line.unitPrice);
        const qty = Math.max(1, Number(line.quantity) || 1);
        await prisma.orderItem.create({
          data: {
            orderId: ord.id,
            productId: line.productId,
            variantId: variant?.id || null,
            skuSnapshot:
              variant?.sku || `${line.productId.toUpperCase()}-${(line.weightSize || '16oz').toUpperCase()}`,
            productNameSnapshot: line.productName,
            weightSize: line.weightSize || '16oz',
            weightLabel: line.weightLabel || '16 oz Kraft Bag',
            currency,
            unitPriceMinor: unitMinor,
            unitPriceDecimal: toDecStr(unitMinor),
            quantity: qty,
            lineTotalMinor: unitMinor * qty,
          },
        });
        report.imported.orderItems += 1;
      }
    }

    const invNumber = `INV-${ord.orderNumber}`;
    await prisma.invoice.upsert({
      where: { invoiceNumber: invNumber },
      update: {},
      create: {
        invoiceNumber: invNumber,
        orderId: ord.id,
        userId: linkedUserId,
        description: `Order ${ord.orderNumber}`,
        currency,
        subtotalMinor,
        shippingFeeMinor,
        discountMinor: 0,
        totalMinor,
        amountDecimal: toDecStr(totalMinor),
        status: mappedStatus === 'CANCELLED' ? 'VOID' : 'PAID',
        paymentMethodSummary: ord.paymentSummary || 'Imported Payment',
        issuedAt: ord.placedAt ? new Date(ord.placedAt) : new Date(),
        paidAt: mappedStatus === 'CANCELLED' ? null : ord.placedAt ? new Date(ord.placedAt) : new Date(),
      },
    });
    report.imported.invoices += 1;
  }

  report.finishedAt = new Date().toISOString();
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required to run JSON-to-MySQL migration.');
    process.exit(1);
  }
  const includeDemoUsers = process.argv.includes('--include-demo-users');
  const prisma = new PrismaClient();
  migrateJsonStoreToMysql(prisma, { includeDemoUsers })
    .then((report) => {
      console.log('Migration report:', JSON.stringify(report, null, 2));
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
