import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { verifySupabaseToken, TokenVerificationError } from './supabase-jwt';

/**
 * Every exam route requires a verified Supabase session.
 *
 * Before this guard existed the service trusted a `studentId` sent in the
 * request body, so anyone could start, answer and submit an exam as any student
 * — or read another student's session — with a single curl command.
 */
@Injectable()
export class ExamAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string = request.headers['authorization'] || '';

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header.');
    }

    try {
      const identity = await verifySupabaseToken(authHeader.slice('Bearer '.length));
      request.user = { id: identity.userId, email: identity.email };
      return true;
    } catch (e) {
      throw new UnauthorizedException(
        e instanceof TokenVerificationError ? e.message : 'Invalid or malformed token.',
      );
    }
  }
}

/** Injects the verified caller — never read the id from the body. */
export const CurrentUser = createParamDecorator((_data, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().user;
});
