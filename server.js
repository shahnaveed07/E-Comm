import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createApp } from './server/app.js';

async function startServer() {
  const { app, config, logger, repo, closeAll } = createApp();
  const port = config.port || 3000;

  if (!config.isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  const server = app.listen(port, '0.0.0.0', () => {
    logger.info('server_listening', {
      url: `http://localhost:${port}`,
      mode: repo.mode,
      currency: config.storeCurrency,
    });
  });

  function shutdown(signal) {
    logger.info('server_shutting_down', { signal });
    closeAll();
    server.close(async () => {
      if (repo.prisma) {
        await repo.prisma.$disconnect().catch(() => {});
      }
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startServer();
