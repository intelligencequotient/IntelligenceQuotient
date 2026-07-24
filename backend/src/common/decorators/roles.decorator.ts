import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * @Roles('teacher', 'admin')
 * Use this decorator on controllers or route handlers to restrict access.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
