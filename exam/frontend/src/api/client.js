export const apiClient = {
  baseURL: 'http://localhost:3001/api', // Connects to the standalone backend on port 3001
  
  async request(endpoint, method = 'GET', body = null) {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);
    
    const res = await fetch(`${this.baseURL}${endpoint}`, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'API request failed');
    }
    return res.json();
  },

  get(endpoint) { return this.request(endpoint); },
  post(endpoint, body) { return this.request(endpoint, 'POST', body); },
  patch(endpoint, body) { return this.request(endpoint, 'PATCH', body); }
};
