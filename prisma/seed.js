import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  FREE_SHIPPING_THRESHOLD,
  INITIAL_CATALOG,
  STANDARD_SHIPPING_FEE,
  WEIGHT_OPTIONS,
} from '../src/data/catalog.js';
import { provisionAdminInPrisma } from '../scripts/create-admin.js';

const CATEGORY_DEFS = [
  { slug: 'walnuts', name: 'Walnuts', sortOrder: 1 },
  { slug: 'almonds', name: 'Almonds', sortOrder: 2 },
  { slug: 'pistachios_hazelnuts', name: 'Pistachios & Hazelnuts', sortOrder: 3 },
  { slug: 'pecans_medleys', name: 'Pecans & Medleys', sortOrder: 4 },
];

export function toMinorUnits(decimalAmount) {
  return Math.round(Number(decimalAmount) * 100);
}

export function minorToDecimalString(minorUnits) {
  return (Number(minorUnits) / 100).toFixed(2);
}

export async function seedDatabase(prisma, env = process.env) {
  const currency = (env.STORE_CURRENCY || 'USD').toUpperCase();

  for (const cat of CATEGORY_DEFS) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, sortOrder: cat.sortOrder, isActive: true },
      create: { slug: cat.slug, name: cat.name, sortOrder: cat.sortOrder, isActive: true },
    });
  }

  const categories = await prisma.category.findMany();
  const catBySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));

  for (const item of INITIAL_CATALOG) {
    const category = catBySlug[item.category];
    if (!category) continue;

    await prisma.product.upsert({
      where: { id: item.id },
      update: {
        slug: item.slug,
        name: item.name,
        categoryId: category.id,
        origin: item.origin,
        harvestBatch: item.harvestBatch,
        roastProfile: item.roastProfile,
        roastLabel: item.roastLabel,
        shortDescription: item.shortDescription,
        tastingNotes: item.tastingNotes,
        nutritionPerServing: item.nutritionPerServing,
        dietaryTags: item.dietaryTags,
        allergens: item.allergens,
        featuredTag: item.featuredTag || null,
        isVisible: true,
        isArchived: false,
      },
      create: {
        id: item.id,
        slug: item.slug,
        name: item.name,
        categoryId: category.id,
        origin: item.origin,
        harvestBatch: item.harvestBatch,
        roastProfile: item.roastProfile,
        roastLabel: item.roastLabel,
        shortDescription: item.shortDescription,
        tastingNotes: item.tastingNotes,
        nutritionPerServing: item.nutritionPerServing,
        dietaryTags: item.dietaryTags,
        allergens: item.allergens,
        featuredTag: item.featuredTag || null,
        isVisible: true,
        isArchived: false,
      },
    });

    for (const sizeKey of ['8oz', '16oz', '32oz']) {
      const opt = WEIGHT_OPTIONS[sizeKey];
      const priceMinor = toMinorUnits(item.basePrice16oz * opt.priceMultiplier);
      const sku = `${item.id.replace('prod-', 'SG-').toUpperCase()}-${sizeKey.toUpperCase()}`;

      await prisma.productVariant.upsert({
        where: { productId_weightSize: { productId: item.id, weightSize: sizeKey } },
        update: {
          weightLabel: opt.label,
          grams: opt.grams,
          currency,
          priceMinor,
          priceDecimal: minorToDecimalString(priceMinor),
          isActive: item.inStock !== false,
        },
        create: {
          productId: item.id,
          sku,
          weightSize: sizeKey,
          weightLabel: opt.label,
          grams: opt.grams,
          currency,
          priceMinor,
          priceDecimal: minorToDecimalString(priceMinor),
          stockQuantity: 45,
          reservedStock: 0,
          lowStockThreshold: 8,
          isActive: item.inStock !== false,
        },
      });
    }

    const existingImages = await prisma.productImage.findMany({ where: { productId: item.id } });
    if (existingImages.length === 0) {
      await prisma.productImage.create({
        data: {
          productId: item.id,
          url: item.imageUrl,
          provider: 'local',
          altText: `${item.name} from ${item.origin}`,
          sortOrder: 0,
          isPrimary: true,
        },
      });
    }
  }

  await prisma.storeSetting.upsert({
    where: { key: 'commerce_config' },
    update: {
      value: {
        currency,
        freeShippingThresholdMinor: toMinorUnits(FREE_SHIPPING_THRESHOLD),
        standardShippingFeeMinor: toMinorUnits(STANDARD_SHIPPING_FEE),
        storeName: env.STORE_NAME || 'Sylvan Grove',
      },
    },
    create: {
      key: 'commerce_config',
      description: 'Store currency and shipping thresholds',
      value: {
        currency,
        freeShippingThresholdMinor: toMinorUnits(FREE_SHIPPING_THRESHOLD),
        standardShippingFeeMinor: toMinorUnits(STANDARD_SHIPPING_FEE),
        storeName: env.STORE_NAME || 'Sylvan Grove',
      },
    },
  });

  await prisma.coupon.upsert({
    where: { code: 'HARVEST10' },
    update: { isActive: true },
    create: {
      code: 'HARVEST10',
      description: '10% off organic orchard harvests over $40',
      discountType: 'PERCENT',
      discountValue: 10,
      currency,
      minOrderMinor: 4000,
      maxDiscountMinor: 2500,
      isActive: true,
    },
  });

  if (env.INITIAL_ADMIN_EMAIL && env.INITIAL_ADMIN_PASSWORD) {
    await provisionAdminInPrisma(prisma, {
      email: env.INITIAL_ADMIN_EMAIL,
      password: env.INITIAL_ADMIN_PASSWORD,
      fullName: env.INITIAL_ADMIN_NAME || 'Orchard Administrator',
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required to seed MySQL.');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  seedDatabase(prisma)
    .then(() => console.log('MySQL seed completed successfully.'))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
