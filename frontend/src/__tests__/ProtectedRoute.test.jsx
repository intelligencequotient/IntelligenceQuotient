import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import ProtectedRoute from '../components/ProtectedRoute';

/**
 * These tests previously seeded a `mock_token` key that ProtectedRoute stopped
 * reading when login moved to real Supabase JWTs — so the suite was failing
 * against the current implementation. They now use the real session keys
 * (`access_token` + `user`).
 */

const signIn = (role) => {
  localStorage.setItem('access_token', 'header.payload.signature');
  localStorage.setItem('user', JSON.stringify({ id: 'u1', role, email: 'test@test.com' }));
};

/** Renders the guard at /protected with landing pages for every redirect target. */
const renderGuarded = (allowedRoles) =>
  render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/" element={<div>Login Page</div>} />
        <Route path="/student" element={<div>Student Home</div>} />
        <Route path="/teacher" element={<div>Teacher Home</div>} />
        <Route path="/admin" element={<div>Admin Home</div>} />
        <Route
          path="/protected"
          element={
            <ProtectedRoute allowedRoles={allowedRoles}>
              <div>Protected Content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe('ProtectedRoute', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redirects to login when no session is present', () => {
    const { container } = renderGuarded(['student']);
    expect(container.textContent).toContain('Login Page');
  });

  it('redirects to login when the token exists but the user record does not', () => {
    localStorage.setItem('access_token', 'header.payload.signature');
    const { container } = renderGuarded(['student']);
    expect(container.textContent).toContain('Login Page');
  });

  it('renders children when the role matches', () => {
    signIn('student');
    const { container } = renderGuarded(['student']);
    expect(container.textContent).toContain('Protected Content');
  });

  it('accepts any of several allowed roles', () => {
    signIn('admin');
    const { container } = renderGuarded(['teacher', 'admin']);
    expect(container.textContent).toContain('Protected Content');
  });

  it('sends a student away from a teacher-only route to their own dashboard', () => {
    signIn('student');
    const { container } = renderGuarded(['teacher']);
    expect(container.textContent).toContain('Student Home');
    expect(container.textContent).not.toContain('Protected Content');
  });

  it('sends a teacher away from an admin-only route', () => {
    signIn('teacher');
    const { container } = renderGuarded(['admin']);
    expect(container.textContent).toContain('Teacher Home');
  });

  it('sends an admin away from a student-only route', () => {
    signIn('admin');
    const { container } = renderGuarded(['student']);
    expect(container.textContent).toContain('Admin Home');
  });

  it('clears a corrupted session and redirects to login', () => {
    localStorage.setItem('access_token', 'header.payload.signature');
    localStorage.setItem('user', 'not-valid-json{');

    const { container } = renderGuarded(['student']);

    expect(container.textContent).toContain('Login Page');
    // The bad session must not be left behind to fail again on the next render.
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});
