import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

export async function validateMigration(prisma, {
  storeFile = path.resolve(process.cwd(), '.data', 'store.json'),
} = {}) {
  if (!fs.existsSync(storeFile)) {
    throw new Error(`Source file not found: ${storeFile}`);
  }
  const source = JSON.parse(fs.readFileSync(storeFile, 'utf-8'));

  const [productCount, variantCount, orderCount, orderTotalAgg] = await Promise.all([
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.order.count(),
    prisma.order.aggregate({
      where: { status: { not: 'CANCELLED' } },
      _sum: { totalMinor: true },
    }),
  ]);

  const expectedProducts = (source.catalog || []).length;
  const expectedOrders = (source.orders || []).length;
  const expectedTotalMinor = (source.orders || [])
    .filter((o) => o.status !== 'cancelled')
    .reduce((acc, o) => acc + Math.round(Number(o.total || 0) * 100), 0);

  const actualTotalMinor = orderTotalAgg._sum.totalMinor || 0;
  const issues = [];

  if (productCount < expectedProducts) {
    issues.push(`Product count mismatch: expected >= ${expectedProducts}, got ${productCount}`);
  }
  if (variantCount < expectedProducts * 3) {
    issues.push(`Variant count mismatch: expected >= ${expectedProducts * 3}, got ${variantCount}`);
  }
  if (orderCount < expectedOrders) {
    issues.push(`Order count mismatch: expected >= ${expectedOrders}, got ${orderCount}`);
  }
  if (actualTotalMinor < expectedTotalMinor) {
    issues.push(
      `Non-cancelled order minor-unit total mismatch: expected >= ${expectedTotalMinor}, got ${actualTotalMinor}`
    );
  }

  return {
    ok: issues.length === 0,
    issues,
    counts: { productCount, variantCount, orderCount },
    totals: { expectedTotalMinor, actualTotalMinor },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required to validate MySQL migration.');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  validateMigration(prisma)
    .then((res) => {
      console.log('Migration validation:', JSON.stringify(res, null, 2));
      if (!res.ok) process.exitCode = 1;
    })
    .catch((err) => {
      console.error('Validation error:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
