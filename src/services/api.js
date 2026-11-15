function readCookie(name) {
  if (typeof document === 'undefined') return '';
  const pairs = document.cookie ? document.cookie.split(';') : [];
  for (const part of pairs) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return '';
}

let cachedCsrfToken = '';

export async function ensureCsrfToken() {
  const fromCookie = readCookie('sg_csrf');
  if (fromCookie) {
    cachedCsrfToken = fromCookie;
    return fromCookie;
  }
  if (cachedCsrfToken) return cachedCsrfToken;

  const res = await fetch('/api/csrf-token', { credentials: 'same-origin' });
  if (res.ok) {
    const data = await res.json();
    cachedCsrfToken = data.csrfToken || readCookie('sg_csrf') || '';
    return cachedCsrfToken;
  }
  return '';
}

export async function apiFetch(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };

  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = await ensureCsrfToken();
    if (token) {
      headers['X-CSRF-Token'] = token;
    }
  }

  const res = await fetch(url, {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
  });

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/pdf')) {
    if (!res.ok) {
      throw new Error('Could not download PDF document.');
    }
    return res;
  }

  let data = null;
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }

  return data;
}
