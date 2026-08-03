const BASE_URL = import.meta.env.VITE_EXAM_API_URL || 'http://localhost:3000/api';

const TOKEN_KEY = 'exam_access_token';
const REFRESH_KEY = 'exam_refresh_token';

/**
 * Session handling for the standalone exam app.
 *
 * This app is served from a different origin to the main portal, so it cannot
 * read the portal's localStorage. The portal launches it with the session in the
 * URL *fragment* (`#token=…&refresh=…`), which browsers never send to a server
 * and never write to server logs. We lift it into sessionStorage — scoped to
 * this tab, cleared when the tab closes — and strip it from the address bar so
 * it does not linger in history.
 *
 * The refresh token travels too: a Supabase access token lasts about an hour and
 * a JEE paper runs for three, so without it every answer saved past the first
 * hour — and the final submit — failed with a 401.
 */
export function captureTokenFromUrl() {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  if (!hash) return getToken();

  const params = new URLSearchParams(hash);
  const token = params.get('token');
  const refresh = params.get('refresh');
  if (!token) return getToken();

  sessionStorage.setItem(TOKEN_KEY, token);
  if (refresh) sessionStorage.setItem(REFRESH_KEY, refresh);
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return token;
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}

// Only one refresh may be in flight; concurrent 401s all await the same promise.
let refreshPromise = null;

async function refreshAccessToken() {
  const refreshToken = sessionStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return null;

        const data = await res.json();
        if (!data?.accessToken) return null;

        sessionStorage.setItem(TOKEN_KEY, data.accessToken);
        if (data.refreshToken) sessionStorage.setItem(REFRESH_KEY, data.refreshToken);
        return data.accessToken;
      } catch {
        return null;
      } finally {
        // Release the lock on the next tick so waiters read the stored token.
        setTimeout(() => { refreshPromise = null; }, 0);
      }
    })();
  }

  return refreshPromise;
}

export class ExamApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export const apiClient = {
  baseURL: BASE_URL,

  async request(endpoint, method = 'GET', body = null, { isRetry = false } = {}) {
    const token = getToken();

    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers.Authorization = `Bearer ${token}`;
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`${this.baseURL}${endpoint}`, options);

    if (res.status === 401) {
      // Mid-exam expiry is expected on a long paper — refresh once and retry
      // rather than ending the student's session.
      if (!isRetry) {
        const newToken = await refreshAccessToken();
        if (newToken) return this.request(endpoint, method, body, { isRetry: true });
      }

      clearToken();
      throw new ExamApiError(
        'Your session has expired. Please relaunch the exam from your dashboard.',
        401,
      );
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const message = Array.isArray(err.message) ? err.message[0] : err.message;
      throw new ExamApiError(message || 'Request failed', res.status);
    }

    return res.status === 204 ? {} : res.json();
  },

  get(endpoint) { return this.request(endpoint); },
  post(endpoint, body) { return this.request(endpoint, 'POST', body); },
  patch(endpoint, body) { return this.request(endpoint, 'PATCH', body); },
};
