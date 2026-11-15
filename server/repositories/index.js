import { getPrismaClient } from '../database/prismaClient.js';
import { createPrismaStoreRepository } from './prismaStoreRepository.js';
import { createDevStoreRepository } from './devStoreRepository.js';

export function createRepository(config, logger, options = {}) {
  if (config.databaseUrl && !options.forceInMemory) {
    const prisma = getPrismaClient();
    logger?.info('repository_initialized', { mode: 'mysql-prisma' });
    return createPrismaStoreRepository(prisma, config);
  }

  if (config.isProduction) {
    throw new Error('Production mode requires DATABASE_URL pointing to MySQL 8.');
  }

  const repo = createDevStoreRepository(config, {
    inMemoryOnly: Boolean(options.forceInMemory || config.isTest),
    persistFilePath: options.persistFilePath,
  });

  logger?.warn('repository_initialized_fallback', {
    mode: repo.mode,
    message:
      'DATABASE_URL not set; running non-production store fallback. Set DATABASE_URL for MySQL 8 persistence.',
  });

  return repo;
}
