/**
 * AshaKiran – Centralized API Client
 * Features: timeout, 3-retry exponential backoff, auth injection, structured errors
 */
import { API_BASE_URL } from '../config/api';

const TIMEOUT_MS       = 12000;  // 12 s per attempt
const MAX_RETRIES      = 3;
const RETRY_BASE_MS    = 600;    // 600 ms → 1200 ms → 2400 ms

// ── Error types ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name   = 'ApiError';
    this.status = status;
    this.data   = data;
  }
}

export class OfflineError extends Error {
  constructor(message = 'Device is offline') {
    super(message);
    this.name = 'OfflineError';
  }
}

export class TimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class AuthError extends Error {
  constructor(message = 'Unauthorized', status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

export class BackendUnreachableError extends Error {
  constructor(message = 'Server is unreachable or CORS blocked') {
    super(message);
    this.name = 'BackendUnreachableError';
  }
}

// Backward compatibility alias
export const NetworkError = BackendUnreachableError;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function checkInternet() {
  if (typeof window === 'undefined') return true;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch(`/favicon.ico?_cb=${Date.now()}`, {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    return true;
  } catch (err) {
    return typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  }
}

function getToken() {
  return localStorage.getItem('token');
}

function buildHeaders(extra = {}, isFormData = false) {
  const headers = { ...extra };
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// ── Core fetch with timeout ───────────────────────────────────────────────────

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const signal = controller.signal;
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }

  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new TimeoutError();
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new OfflineError();
    }
    throw new BackendUnreachableError(err.message);
  } finally {
    clearTimeout(timer);
  }
}

// ── Core fetch with retry ────────────────────────────────────────────────────

async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options);

      // Don't retry 4xx — those are definitive client errors
      if (res.status >= 400 && res.status < 500) {
        let data = null;
        try { data = await res.json(); } catch {}
        
        if (res.status === 401 || res.status === 403) {
          throw new AuthError(data?.error || data?.message || 'Unauthorized', res.status);
        }

        throw new ApiError(
          data?.error || data?.message || res.statusText,
          res.status,
          data,
        );
      }

      // 5xx or network issue – retry if we have attempts left
      if (!res.ok) {
        lastError = new ApiError(`Server error ${res.status}`, res.status);
        if (attempt < retries) {
          await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
          continue;
        }
        throw lastError;
      }

      return res;
    } catch (err) {
      if (err instanceof ApiError || err instanceof AuthError || err instanceof OfflineError) {
        throw err; // don't retry client errors, auth rejections, or true offline states
      }
      lastError = err;
      if (attempt < retries) {
        await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
      }
    }
  }

  throw lastError ?? new BackendUnreachableError();
}

let _refreshPromise = null;

export async function attemptSilentRefresh() {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const oldToken = localStorage.getItem('token');
      if (!oldToken) return false;

      const res = await fetch(`${API_BASE_URL}/api/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${oldToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
          if (data.user) {
            localStorage.setItem('user', JSON.stringify(data.user));
          }
          return true;
        }
      }
      return false;
    } catch (err) {
      console.warn('[API] error trying to refresh token:', err);
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

// ── Public API ────────────────────────────────────────────────────────────────

async function request(method, path, { body, headers: extra = {}, raw = false } = {}) {
  const isFormData = body instanceof FormData;
  const url     = path.startsWith('http://') || path.startsWith('https://') ? path : `${API_BASE_URL}${path}`;
  const options = {
    method,
    headers: buildHeaders(extra, isFormData),
    credentials: 'include',
  };
  if (body !== undefined) {
    options.body = isFormData ? body : (typeof body === 'string' ? body : JSON.stringify(body));
  }

  try {
    const res = await fetchWithRetry(url, options);
    window.dispatchEvent(new CustomEvent('api-call-success'));
    if (raw) return res;

    // Parse JSON, gracefully handle empty body
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (err) {
    // 1. Temporary production debugging / telemetry logs
    let cacheKeys = [];
    if (typeof caches !== 'undefined') {
      try {
        cacheKeys = await caches.keys();
      } catch {}
    }
    console.error(`[API Debug] Request failed: ${method} ${path}`, {
      attemptedUrl: url,
      navigatorOnline: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
      errorName: err.name,
      errorMessage: err.message,
      errorStatus: err.status,
      swState: typeof navigator !== 'undefined' && navigator.serviceWorker ? (navigator.serviceWorker.controller ? 'controlled' : 'active-no-controller') : 'unsupported',
      activeCaches: cacheKeys,
      networkMode: import.meta.env.MODE,
    });

    // 2. Recovery Handling: If fetch failed and it was a direct absolute URL cross-origin request
    const isAbsolute = url.startsWith('http://') || url.startsWith('https://');
    const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1');
    const isSameOrigin = url.startsWith(window.location.origin);

    if ((err instanceof BackendUnreachableError || err instanceof TimeoutError) && isAbsolute && !isSameOrigin && !isLocalhost) {
      console.warn(`[API Recovery] Absolute URL call failed. Performing diagnostics & retrying relative same-origin fallback...`);

      // Recovery Action A: Refresh Service Worker
      if (navigator.serviceWorker) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          for (let registration of registrations) {
            registration.update().catch(() => {});
          }
        }).catch(() => {});
      }

      // Recovery Action B: Invalidate caches
      if (typeof caches !== 'undefined') {
        caches.keys().then(keys => {
          for (let key of keys) {
            caches.delete(key).catch(() => {});
          }
        }).catch(() => {});
      }

      // Recovery Action C: Dispatch call failure to alert pings
      window.dispatchEvent(new CustomEvent('api-call-failure'));

      // Recovery Action D: Retry using the relative path fallback
      try {
        console.log(`[API Recovery] Retrying relative path: ${path}`);
        const res = await fetchWithRetry(path, options);
        window.dispatchEvent(new CustomEvent('api-call-success'));
        if (raw) return res;
        const text = await res.text();
        if (!text) return null;
        try { return JSON.parse(text); } catch { return text; }
      } catch (retryErr) {
        console.error('[API Recovery] Relative path retry also failed:', retryErr);
        throw retryErr;
      }
    }

    if (err instanceof OfflineError || err instanceof TimeoutError || err instanceof BackendUnreachableError) {
      window.dispatchEvent(new CustomEvent('api-call-failure'));
    }
    // Intercept 401 expired tokens (but not login or refresh requests themselves)
    if (err instanceof AuthError && path !== '/api/login' && path !== '/api/refresh') {
      console.warn(`[API] Auth error for ${path}. Attempting silent refresh...`);
      try {
        const refreshed = await attemptSilentRefresh();
        if (refreshed) {
          console.log(`[API] Silent refresh succeeded. Retrying ${path}...`);
          options.headers = buildHeaders(extra, isFormData);
          const retryUrl = path.startsWith('http://') || path.startsWith('https://') ? path : `${API_BASE_URL}${path}`;
          const res = await fetchWithRetry(retryUrl, options);
          window.dispatchEvent(new CustomEvent('api-call-success'));
          if (raw) return res;
          const text = await res.text();
          if (!text) return null;
          try { return JSON.parse(text); } catch { return text; }
        } else {
          console.error('[API] Silent refresh rejected by server — dispatching session-expired');
          window.dispatchEvent(new CustomEvent('session-expired'));
        }
      } catch (refreshErr) {
        if (refreshErr instanceof OfflineError || refreshErr instanceof TimeoutError || refreshErr instanceof BackendUnreachableError) {
          console.warn('[API] Silent refresh unreachable (offline) — keeping session alive');
          window.dispatchEvent(new CustomEvent('api-call-failure'));
        } else {
          console.error('[API] Silent refresh exception:', refreshErr);
          window.dispatchEvent(new CustomEvent('session-expired'));
        }
      }
    }
    throw err;
  }
}

export const api = {
  get:    (path, opts)         => request('GET',    path, opts ?? {}),
  post:   (path, body, opts)   => request('POST',   path, { body, ...(opts ?? {}) }),
  put:    (path, body, opts)   => request('PUT',    path, { body, ...(opts ?? {}) }),
  patch:  (path, body, opts)   => request('PATCH',  path, { body, ...(opts ?? {}) }),
  delete: (path, opts)         => request('DELETE', path, opts ?? {}),
};

// ── Health check ──────────────────────────────────────────────────────────────
// Returns true ONLY on a proper 2xx response
export async function checkHealth(timeoutMs = 3000, attempts = 1, externalSignal = null) {
  const url = `${API_BASE_URL}/health`;
  for (let i = 0; i < attempts; i++) {
    try {
      if (externalSignal && externalSignal.aborted) {
        return false;
      }
      const controller = new AbortController();
      let abortHandler;
      if (externalSignal) {
        abortHandler = () => controller.abort();
        externalSignal.addEventListener('abort', abortHandler);
      }
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);
      if (externalSignal && abortHandler) {
        externalSignal.removeEventListener('abort', abortHandler);
      }
      if (res.ok) return true;
    } catch (err) {
      if (import.meta.env.DEV && err.name !== 'AbortError') {
        console.warn(`[checkHealth] attempt ${i + 1} failed:`, err.message);
      }
    }
    if (i < attempts - 1) {
      if (externalSignal && externalSignal.aborted) {
        return false;
      }
      await new Promise(r => setTimeout(r, 500)); // sleep 500ms before retry
    }
  }
  return false;
}

export function onAppReady() {
  if (typeof window === 'undefined') return Promise.resolve();

  return new Promise((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    // Timeout safety fallback of 2 seconds
    const timeoutId = setTimeout(done, 2000);

    const start = () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then(() => {
            clearTimeout(timeoutId);
            done();
          })
          .catch(() => {
            clearTimeout(timeoutId);
            done();
          });
      } else {
        clearTimeout(timeoutId);
        done();
      }
    };

    if (document.readyState === 'complete') {
      start();
    } else {
      window.addEventListener('load', start);
    }
  });
}

