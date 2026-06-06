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

export class NetworkError extends Error {
  constructor(message = 'Network unreachable') {
    super(message);
    this.name = 'NetworkError';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') throw new NetworkError('Request timed out');
    throw new NetworkError(err.message);
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
      if (err instanceof ApiError) throw err; // 4xx – no retry
      lastError = err;
      if (attempt < retries) {
        await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
      }
    }
  }

  throw lastError ?? new NetworkError();
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
  const url     = `${API_BASE_URL}${path}`;
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
    if (err instanceof NetworkError) {
      window.dispatchEvent(new CustomEvent('api-call-failure'));
    }
    // Intercept 401 expired tokens (but not login or refresh requests themselves)
    if (err instanceof ApiError && err.status === 401 && path !== '/api/login' && path !== '/api/refresh') {
      console.warn(`[API] 401 Unauthorized for ${path}. Attempting silent refresh...`);
      try {
        const refreshed = await attemptSilentRefresh();
        if (refreshed) {
          console.log(`[API] Silent refresh succeeded. Retrying ${path}...`);
          options.headers = buildHeaders(extra, isFormData);
          const res = await fetchWithRetry(url, options);
          window.dispatchEvent(new CustomEvent('api-call-success'));
          if (raw) return res;
          const text = await res.text();
          if (!text) return null;
          try { return JSON.parse(text); } catch { return text; }
        } else {
          // Refresh returned a non-OK HTTP response → token truly expired on server.
          // Only dispatch session-expired here — this is a genuine server-side
          // rejection, NOT a network failure (the server was reachable).
          console.error('[API] Silent refresh rejected by server — dispatching session-expired');
          window.dispatchEvent(new CustomEvent('session-expired'));
        }
      } catch (refreshErr) {
        // If the refresh itself threw a NetworkError (offline / timeout), the
        // server was unreachable — do NOT log the user out. Keep session alive
        // and let them continue working offline.
        if (refreshErr instanceof NetworkError) {
          console.warn('[API] Silent refresh unreachable (offline) — keeping session alive');
          window.dispatchEvent(new CustomEvent('api-call-failure'));
        } else {
          // Any other unexpected error (e.g. JSON parse crash) → treat as expired.
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
// Uses a relative path so it goes through Vite proxy → Flask.
// Returns true ONLY on a proper 2xx response; 503 degraded = false.
export async function checkHealth(timeoutMs = 3000, attempts = 1, externalSignal = null) {
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
      const res = await fetch(`${API_BASE_URL}/health`, {
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
