export class AppError extends Error {
  constructor(statusCode, message, code = 'APP_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function createErrorHandler(logger, config) {
  return (err, req, res, _next) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
        ...(err.details ? { details: err.details } : {}),
      });
      return;
    }

    // Prisma known request errors
    if (err?.code === 'P2002') {
      res.status(409).json({
        error: 'A record with that unique value already exists.',
        code: 'UNIQUE_CONSTRAINT',
      });
      return;
    }

    if (err?.code === 'P2025') {
      res.status(404).json({
        error: 'Requested record was not found.',
        code: 'NOT_FOUND',
      });
      return;
    }

    logger.error('unhandled_server_error', {
      requestId: req?.id,
      path: req?.originalUrl,
      message: err?.message,
      stack: config.isProduction ? undefined : err?.stack,
    });

    res.status(500).json({
      error: config.isProduction
        ? 'An unexpected server error occurred.'
        : err?.message || 'Internal server error.',
      code: 'INTERNAL_ERROR',
    });
  };
}
