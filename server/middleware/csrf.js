import { generateRandomToken, signHmacSha256, timingSafeEqualStr } from '../utils/crypto.js';

export const CSRF_COOKIE_NAME = 'sg_csrf';

export function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const part of String(cookieHeader).split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const rawVal = part.slice(eqIdx + 1).trim();
    try {
      cookies[key] = decodeURIComponent(rawVal);
    } catch {
      cookies[key] = rawVal;
    }
  }
  return cookies;
}

export function isHttpsRequest(req) {
  return (
    Boolean(req?.secure) ||
    String(req?.headers?.['x-forwarded-proto'] || '')
      .split(',')[0]
      .trim()
      .toLowerCase() === 'https'
  );
}

export function createCsrfToken(secret) {
  const nonce = generateRandomToken(24);
  const sig = signHmacSha256(nonce, secret);
  return `${nonce}.${sig}`;
}

export function verifyCsrfTokenSignature(token, secret) {
  if (!token || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const nonce = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = signHmacSha256(nonce, secret);
  return timingSafeEqualStr(sig, expected);
}

export function ensureCsrfCookie(req, res, config) {
  const cookies = parseCookies(req.headers.cookie);
  const existing = cookies[CSRF_COOKIE_NAME];
  if (existing && verifyCsrfTokenSignature(existing, config.csrfSecret)) {
    return existing;
  }
  const token = createCsrfToken(config.csrfSecret);
  const https = isHttpsRequest(req);
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    path: '/',
  });
  return token;
}

export function createCsrfMiddleware(config) {
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

  return (req, res, next) => {
    if (!req.path.startsWith('/api')) {
      next();
      return;
    }

    if (req.path.startsWith('/api/webhooks')) {
      next();
      return;
    }

    if (SAFE_METHODS.has(req.method)) {
      ensureCsrfCookie(req, res, config);
      next();
      return;
    }

    const cookies = parseCookies(req.headers.cookie);
    const cookieToken = cookies[CSRF_COOKIE_NAME];
    const headerToken = req.headers['x-csrf-token'];

    if (
      !cookieToken ||
      !headerToken ||
      typeof headerToken !== 'string' ||
      !verifyCsrfTokenSignature(cookieToken, config.csrfSecret) ||
      !timingSafeEqualStr(cookieToken, headerToken)
    ) {
      res.status(403).json({
        error: 'Invalid or missing CSRF token. Refresh the page and try again.',
        code: 'CSRF_INVALID',
      });
      return;
    }

    next();
  };
}
