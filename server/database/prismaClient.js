import { PrismaClient } from '@prisma/client';

let prismaSingleton = null;

export function getPrismaClient(databaseUrl) {
  if (!prismaSingleton) {
    prismaSingleton = new PrismaClient({
      datasources: databaseUrl ? { db: { url: databaseUrl } } : undefined,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return prismaSingleton;
}

export async function checkDatabaseHealth(prisma) {
  if (!prisma) return { connected: false, reason: 'No Prisma client configured' };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { connected: true };
  } catch (err) {
    return { connected: false, reason: err?.message || 'Database check failed' };
  }
}

export async function disconnectPrisma() {
  if (prismaSingleton) {
    await prismaSingleton.$disconnect();
    prismaSingleton = null;
  }
}
