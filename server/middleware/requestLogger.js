import crypto from 'node:crypto';

export function createRequestLoggerMiddleware(logger) {
  return (req, res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.id = String(requestId);
    res.setHeader('X-Request-Id', req.id);
    const start = Date.now();

    res.on('finish', () => {
      if (req.path.startsWith('/api/events')) return;
      if (!req.path.startsWith('/api')) return;
      logger.info('http_request', {
        requestId: req.id,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - start,
        userId: req.user?.id || null,
      });
    });

    next();
  };
}
