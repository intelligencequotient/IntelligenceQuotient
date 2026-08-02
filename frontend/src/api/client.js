const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/** Everything the session needs, cleared together so we can never half-log-out. */
const SESSION_KEYS = ['access_token', 'refresh_token', 'user'];

export function clearSession() {
  SESSION_KEYS.forEach((k) => localStorage.removeItem(k));
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Only one refresh may be in flight; concurrent 401s all await the same promise.
let refreshPromise = null;

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refresh_token');
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

        localStorage.setItem('access_token', data.accessToken);
        if (data.refreshToken) localStorage.setItem('refresh_token', data.refreshToken);
        return data.accessToken;
      } catch {
        return null;
      } finally {
        // Release the lock on the next tick so waiters read the stored token.
        setTimeout(() => {
          refreshPromise = null;
        }, 0);
      }
    })();
  }

  return refreshPromise;
}

function buildHeaders(options) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };

  const token = localStorage.getItem('access_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Let the browser set the multipart boundary itself.
  if (options.body instanceof FormData) delete headers['Content-Type'];

  return headers;
}

/**
 * fetch wrapper that attaches the bearer token and, on a 401, transparently
 * refreshes the session once before giving up and sending the user to login.
 */
async function fetchClient(endpoint, options = {}, { isRetry = false } = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: buildHeaders(options),
  });

  const isAuthCall = endpoint.startsWith('/auth/');

  if (response.status === 401 && !isAuthCall && !isRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return fetchClient(endpoint, options, { isRetry: true });
    }

    clearSession();
    if (window.location.pathname !== '/') window.location.href = '/';
    throw new Error('Your session has expired. Please log in again.');
  }

  if (response.status === 401 && !isAuthCall) {
    clearSession();
    if (window.location.pathname !== '/') window.location.href = '/';
  }

  // 204 and other empty responses have no JSON body.
  const data =
    response.status === 204 ? {} : await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.message
      ? Array.isArray(data.message)
        ? data.message[0]
        : data.message
      : `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

export const apiClient = {
  get: (endpoint, options) => fetchClient(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options) =>
    fetchClient(endpoint, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  patch: (endpoint, body, options) =>
    fetchClient(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: (endpoint, options) => fetchClient(endpoint, { ...options, method: 'DELETE' }),

  /** Revokes the session server-side, then clears local state. */
  async logout() {
    try {
      await fetchClient('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch {
      // A failed revoke must never trap the user in the app.
    }
    clearSession();
    window.location.href = '/';
  },
};

export { BASE_URL };
