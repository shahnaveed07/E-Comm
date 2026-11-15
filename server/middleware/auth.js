import { sha256Hex } from '../utils/crypto.js';
import { isHttpsRequest, parseCookies } from './csrf.js';

export const SESSION_COOKIE_NAME = 'sg_session';

export function getSessionCookieOptions(req, config) {
  const isHttps = isHttpsRequest(req);
  return {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    path: '/',
    maxAge: config.sessionTtlMs,
  };
}

export function setSessionCookie(req, res, token, config) {
  res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions(req, config));
}

export function clearSessionCookie(req, res, config) {
  const opts = getSessionCookieOptions(req, config);
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    sameSite: opts.sameSite,
    secure: opts.secure,
  });
}

export function createAuthMiddleware({ repo, config }) {
  async function attachSession(req, _res, next) {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const rawToken = cookies[SESSION_COOKIE_NAME];
      if (!rawToken) {
        req.user = null;
        req.session = null;
        next();
        return;
      }

      const tokenHash = sha256Hex(rawToken);
      const session = await repo.findActiveSessionByTokenHash(tokenHash);
      if (!session || !session.user || session.user.status === 'SUSPENDED') {
        req.user = null;
        req.session = null;
        next();
        return;
      }

      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        await repo.revokeSessionById(session.id);
        req.user = null;
        req.session = null;
        next();
        return;
      }

      req.user = session.user;
      req.session = session;
      repo.touchSession(session.id).catch(() => {});
      next();
    } catch (err) {
      next(err);
    }
  }

  function requireAuth(req, res, next) {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required. Please sign in or create an account.',
        code: 'UNAUTHENTICATED',
      });
      return;
    }
    if (req.user.status === 'SUSPENDED') {
      res.status(403).json({
        error: 'This account is currently suspended. Contact support.',
        code: 'ACCOUNT_SUSPENDED',
      });
      return;
    }
    next();
  }

  function requireAdmin(req, res, next) {
    if (!req.user) {
      res.status(401).json({
        error: 'Administrator sign-in required.',
        code: 'UNAUTHENTICATED',
      });
      return;
    }
    if (String(req.user.role).toUpperCase() !== 'ADMIN') {
      res.status(403).json({
        error: 'Access denied. Administrator role is required.',
        code: 'FORBIDDEN',
      });
      return;
    }
    next();
  }

  return {
    attachSession,
    requireAuth,
    requireAdmin,
    config,
  };
}
