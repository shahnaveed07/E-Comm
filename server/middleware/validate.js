import { AppError } from './errorHandler.js';

export function validateBody(schema) {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues || [];
      const first = issues[0]?.message || 'Invalid request payload.';
      next(new AppError(400, first, 'VALIDATION_ERROR', issues));
      return;
    }
    req.validatedBody = parsed.data;
    next();
  };
}

export function sanitizeString(value, maxLen = 500) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, maxLen);
}
