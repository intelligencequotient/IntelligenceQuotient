import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { supabaseMock } from '../../test-utils/supabase-mock';

const authClientStub = {
  auth: {
    signInWithPassword: jest.fn(),
    signOut: jest.fn().mockResolvedValue({ error: null }),
  },
};

jest.mock('../../config/supabase.config', () => ({
  supabase: supabaseMock,
  createUserAuthClient: () => authClientStub,
}));

import { UsersService } from './users.service';

const USER_ID = 'user-1';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(() => {
    supabaseMock.reset();
    jest.clearAllMocks();
    authClientStub.auth.signInWithPassword.mockResolvedValue({ error: null });
    service = new UsersService();
  });

  /**
   * `currentPassword` used to be optional and the verification conditional on
   * the client sending one — so omitting the field entirely let anyone holding a
   * live access token set a new password and take the account over outright.
   */
  describe('updatePassword', () => {
    const email = () => supabaseMock.queueResult('users', { data: { email: 'a@b.com' } });

    it('verifies the current password before changing it', async () => {
      email();

      await service.updatePassword(USER_ID, {
        currentPassword: 'OldPassword1',
        newPassword: 'NewPassword1',
      });

      expect(authClientStub.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'OldPassword1',
      });
      expect(supabaseMock.auth.admin.updateUserById).toHaveBeenCalledWith(USER_ID, {
        password: 'NewPassword1',
      });
    });

    it('refuses when the current password is wrong', async () => {
      email();
      authClientStub.auth.signInWithPassword.mockResolvedValue({ error: { message: 'bad' } });

      await expect(
        service.updatePassword(USER_ID, {
          currentPassword: 'WrongPassword1',
          newPassword: 'NewPassword1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(supabaseMock.auth.admin.updateUserById).not.toHaveBeenCalled();
    });

    /**
     * The check runs on a throwaway client: `signInWithPassword` attaches a
     * session to whichever client it is called on, and the service-role client
     * is a module-level singleton shared by every concurrent request.
     */
    it('never signs in on the shared service-role client', async () => {
      email();

      await service.updatePassword(USER_ID, {
        currentPassword: 'OldPassword1',
        newPassword: 'NewPassword1',
      });

      expect((supabaseMock.auth as any).signInWithPassword).not.toHaveBeenCalled();
      // …and the throwaway session is dropped immediately after the check.
      expect(authClientStub.auth.signOut).toHaveBeenCalled();
    });

    it('refuses to "change" a password to the same value', async () => {
      email();

      await expect(
        service.updatePassword(USER_ID, {
          currentPassword: 'SamePassword1',
          newPassword: 'SamePassword1',
        }),
      ).rejects.toThrow(/different/i);
    });

    it('404s for a user with no profile row', async () => {
      supabaseMock.queueResult('users', { data: null });

      await expect(
        service.updatePassword(USER_ID, {
          currentPassword: 'OldPassword1',
          newPassword: 'NewPassword1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('adminDeleteUser', () => {
    it('refuses to let an admin delete their own account', async () => {
      await expect(service.adminDeleteUser(USER_ID, USER_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('404s on an unknown user rather than reporting success', async () => {
      supabaseMock.queueResult('users', { data: null });

      await expect(service.adminDeleteUser(USER_ID, 'admin-9')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('adminResetPassword', () => {
    it('revokes every existing session after the reset', async () => {
      supabaseMock.queueResult('users', { data: { id: USER_ID } });

      await service.adminResetPassword(USER_ID, 'BrandNewPass1');

      expect(supabaseMock.auth.admin.updateUserById).toHaveBeenCalledWith(USER_ID, {
        password: 'BrandNewPass1',
      });
      expect(supabaseMock.auth.admin.signOut).toHaveBeenCalledWith(USER_ID, 'global');
    });
  });

  /**
   * The search term is spliced into PostgREST's own `or=(...)` filter grammar,
   * where a comma starts a new condition and parentheses group them. Unescaped,
   * a crafted term appended arbitrary filter clauses to the query.
   */
  describe('listAllUsers search escaping', () => {
    const escape = (value: string) => (service as any).escapeOrFilter(value);

    it('strips the characters that delimit a filter expression', () => {
      expect(escape('x,role.eq.admin')).not.toContain(',');
      expect(escape('a)or(b')).not.toContain(')');
      expect(escape('a"b')).not.toContain('"');
      expect(escape("a'b")).not.toContain("'");
    });

    it('escapes LIKE wildcards so "100%" is a literal search', () => {
      expect(escape('100%')).toBe('100\\%');
      expect(escape('a_b')).toBe('a\\_b');
    });

    it('leaves an ordinary name untouched', () => {
      expect(escape('Priya Sharma')).toBe('Priya Sharma');
    });
  });
});
