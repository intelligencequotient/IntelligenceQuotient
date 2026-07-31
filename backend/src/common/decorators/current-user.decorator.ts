import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * @CurrentUser()
 * Extracts the logged-in user from the request object.
 * Returns: { id, email, role, full_name }
 *
 * Usage in a controller:
 *   async getProfile(@CurrentUser() user) {
 *     return this.usersService.findOne(user.id);
 *   }
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    // If a specific field is requested: @CurrentUser('id')
    return data ? user?.[data] : user;
  },
);
