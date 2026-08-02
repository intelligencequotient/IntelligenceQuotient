import { createPublicKey, KeyObject } from 'crypto';
import * as jwt from 'jsonwebtoken';

/**
 * Supabase JWT verification for the secure exam service.
 *
 * Mirrors the main backend's implementation: a token is only trusted once its
 * SIGNATURE has been checked. Decoding proves nothing — anyone can craft a
 * payload with an arbitrary `sub`, which is exactly the hole that existed while
 * this service took `studentId` straight from the request body.
 */

export interface VerifiedIdentity {
  userId: string;
  email: string;
}

export class TokenVerificationError extends Error {}

const ASYMMETRIC_ALGS = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'EdDSA'];
const CLOCK_TOLERANCE_SECONDS = 5;
const JWKS_TTL_MS = 10 * 60 * 1000;

let jwksKeys = new Map<string, KeyObject>();
let jwksFetchedAt = 0;
let jwksInFlight: Promise<void> | null = null;

async function refreshJwks(): Promise<void> {
  if (jwksInFlight) return jwksInFlight;

  jwksInFlight = (async () => {
    const baseUrl = process.env.SUPABASE_URL;
    if (!baseUrl) throw new TokenVerificationError('SUPABASE_URL is not configured');

    const res = await fetch(`${baseUrl}/auth/v1/.well-known/jwks.json`, {
      headers: process.env.SUPABASE_ANON_KEY
        ? { apikey: process.env.SUPABASE_ANON_KEY }
        : undefined,
    });
    if (!res.ok) throw new TokenVerificationError(`JWKS fetch failed (${res.status})`);

    const body: any = await res.json();
    const next = new Map<string, KeyObject>();
    for (const jwk of body?.keys ?? []) {
      if (!jwk?.kid) continue;
      try {
        next.set(jwk.kid, createPublicKey({ key: jwk as any, format: 'jwk' }));
      } catch {
        // Unsupported key type — skip rather than failing the whole set.
      }
    }
    jwksKeys = next;
    jwksFetchedAt = Date.now();
  })().finally(() => {
    jwksInFlight = null;
  });

  return jwksInFlight;
}

async function getSigningKey(kid: string): Promise<KeyObject | null> {
  const stale = Date.now() - jwksFetchedAt > JWKS_TTL_MS;
  if (jwksKeys.size === 0 || stale) await refreshJwks().catch(() => undefined);
  if (jwksKeys.has(kid)) return jwksKeys.get(kid)!;

  // Unknown kid: the project may have rotated its signing key.
  if (!stale) await refreshJwks().catch(() => undefined);
  return jwksKeys.get(kid) ?? null;
}

function toIdentity(payload: any): VerifiedIdentity {
  if (!payload?.sub) throw new TokenVerificationError('Token has no subject');
  return { userId: payload.sub, email: payload.email ?? '' };
}

/** Falls back to asking Supabase directly when no local key material is available. */
async function verifyRemotely(token: string): Promise<VerifiedIdentity> {
  const baseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) throw new TokenVerificationError('Cannot verify token');

  const res = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });
  if (!res.ok) throw new TokenVerificationError('Token rejected by Supabase Auth');

  const user: any = await res.json();
  if (!user?.id) throw new TokenVerificationError('Token rejected by Supabase Auth');
  return { userId: user.id, email: user.email ?? '' };
}

export async function verifySupabaseToken(rawToken: string): Promise<VerifiedIdentity> {
  const token = (rawToken ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new TokenVerificationError('Missing token');

  let header: any;
  try {
    header = (jwt.decode(token, { complete: true }) as any)?.header;
  } catch {
    throw new TokenVerificationError('Malformed token');
  }

  const alg: string | undefined = header?.alg;
  if (!alg || alg.toLowerCase() === 'none') {
    throw new TokenVerificationError('Token is unsigned');
  }

  try {
    if (alg.startsWith('HS')) {
      const secret = process.env.SUPABASE_JWT_SECRET;
      if (!secret) return await verifyRemotely(token);
      return toIdentity(
        jwt.verify(token, secret, {
          algorithms: [alg as jwt.Algorithm],
          clockTolerance: CLOCK_TOLERANCE_SECONDS,
        }),
      );
    }

    if (ASYMMETRIC_ALGS.includes(alg)) {
      const key = header?.kid ? await getSigningKey(header.kid) : null;
      if (!key) return await verifyRemotely(token);
      return toIdentity(
        jwt.verify(token, key, {
          algorithms: ASYMMETRIC_ALGS as jwt.Algorithm[],
          clockTolerance: CLOCK_TOLERANCE_SECONDS,
        }),
      );
    }
  } catch (e) {
    if (e instanceof TokenVerificationError) throw e;
    if (e instanceof jwt.TokenExpiredError) {
      throw new TokenVerificationError('Token has expired. Please log in again.');
    }
    throw new TokenVerificationError('Invalid token signature');
  }

  throw new TokenVerificationError(`Unsupported token algorithm: ${alg}`);
}
