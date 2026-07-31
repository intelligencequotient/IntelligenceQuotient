import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';

describe('ProtectedRoute', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redirects to root when no token is present', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/" element={<div data-testid="login">Login Page</div>} />
          <Route path="/protected" element={
            <ProtectedRoute allowedRoles={['student']}>
              <div data-testid="protected">Protected Content</div>
            </ProtectedRoute>
          } />
        </Routes>
      </MemoryRouter>
    );

    expect(container.textContent).toContain('Login Page');
  });

  it('renders children when valid token is present and role matches', () => {
    localStorage.setItem('mock_token', JSON.stringify({ role: 'student', email: 'test@test.com' }));

    const { container } = render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/protected" element={
            <ProtectedRoute allowedRoles={['student']}>
              <div data-testid="protected">Protected Content</div>
            </ProtectedRoute>
          } />
        </Routes>
      </MemoryRouter>
    );

    expect(container.textContent).toContain('Protected Content');
  });
});
