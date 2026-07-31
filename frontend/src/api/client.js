const BASE_URL = 'http://localhost:3000/api';

/**
 * Custom fetch wrapper to automatically add the Authorization header
 */
async function fetchClient(endpoint, options = {}) {
  const token = localStorage.getItem('access_token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Remove Content-Type if it's multipart/form-data (let the browser set it with boundary)
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized globally (e.g. token expired)
  if (response.status === 401 && !endpoint.includes('/auth/login')) {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    window.location.href = '/'; // Redirect to login (root route)
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.message ? (Array.isArray(data.message) ? data.message[0] : data.message) : 'API Request Failed';
    throw new Error(errorMsg);
  }

  return data;
}

export const apiClient = {
  get: (endpoint, options) => fetchClient(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options) => fetchClient(endpoint, { ...options, method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  patch: (endpoint, body, options) => fetchClient(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  delete: (endpoint, options) => fetchClient(endpoint, { ...options, method: 'DELETE' }),
};
