const BASE_URL = import.meta.env.VITE_EXAM_API_URL || 'http://localhost:3001/api';

const TOKEN_KEY = 'exam_access_token';

/**
 * Session handling for the standalone exam app.
 *
 * This app is served from a different origin to the main portal, so it cannot
 * read the portal's localStorage. The portal launches it with the access token
 * in the URL *fragment* (`#token=…`), which browsers never send to a server and
 * never write to server logs. We lift it into sessionStorage — scoped to this
 * tab, cleared when the tab closes — and strip it from the address bar so it
 * does not linger in history.
 */
export function captureTokenFromUrl() {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  if (!hash) return getToken();

  const params = new URLSearchParams(hash);
  const token = params.get('token');
  if (!token) return getToken();

  sessionStorage.setItem(TOKEN_KEY, token);
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return token;
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export class ExamApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export const apiClient = {
  baseURL: BASE_URL,

  async request(endpoint, method = 'GET', body = null) {
    const token = getToken();

    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers.Authorization = `Bearer ${token}`;
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`${this.baseURL}${endpoint}`, options);

    if (res.status === 401) {
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
