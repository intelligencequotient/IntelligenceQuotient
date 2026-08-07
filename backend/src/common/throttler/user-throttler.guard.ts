import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limiting keyed by the caller rather than the socket address.
 *
 * The default tracker uses `req.ip`. Every deployment of this platform sits
 * behind something — nginx, a load balancer, an ingress — so without
 * `trust proxy` that address is the *proxy's*, and all 1000 students in an exam
 * share one 100-request-per-minute bucket: the first few dozen saves exhaust it
 * and everybody else is 429'd mid-exam. `trust proxy` (set in main.ts) fixes the
 * proxy case, but a school on a single NAT address still collapses into one
 * bucket, which is the same outage with extra steps.
 *
 * So authenticated requests are bucketed per user.
 *
 * ## On trusting the token here
 *
 * This guard is global, so it runs before `SupabaseAuthGuard` has verified
 * anything; the subject is therefore read from the JWT payload *without*
 * checking the signature. That is deliberate and safe in this position:
 *
 *  - It decides which counter to increment, nothing else. No authorisation
 *    decision is made from it.
 *  - Forging a subject to get a fresh bucket only buys extra requests to
 *    endpoints that will reject the same forged token moments later with a 401,
 *    before any query runs.
 *  - Requests with no bearer token — login, refresh, forgot-password, i.e. the
 *    endpoints where throttling is a security control rather than a fairness
 *    one — fall back to the client IP and keep their strict per-route limits.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Set by SupabaseAuthGuard on any request that got past it; present here
    // only for handlers that ran another guard first.
    const verifiedId = req?.user?.id;
    if (verifiedId) return `user:${verifiedId}`;

    const subject = this.readSubject(req?.headers?.authorization);
    if (subject) return `user:${subject}`;

    // `req.ips` is populated by Express when the request arrived through a
    // trusted proxy; its first entry is the client-most address.
    const ip = req?.ips?.length ? req.ips[0] : req?.ip;
    return `ip:${ip ?? 'unknown'}`;
  }

  /** Pulls `sub` out of a bearer token's payload. Bucketing only — never trust. */
  private readSubject(authorization?: string): string | null {
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return null;

    const token = authorization.slice('Bearer '.length).trim();
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      const sub = payload?.sub;
      if (typeof sub !== 'string' || !sub) return null;
      // Hashed so a raw user id never reaches a Redis key or a log line.
      return createHash('sha256').update(sub).digest('hex').slice(0, 32);
    } catch {
      return null;
    }
  }
}
