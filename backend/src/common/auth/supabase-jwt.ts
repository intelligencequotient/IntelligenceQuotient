import { createHash, createPublicKey, KeyObject } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { supabase } from '../../config/supabase.config';

/**
 * Supabase JWT verification.
 *
 * A token is only trusted after its SIGNATURE is checked. Decoding a JWT proves
 * nothing — anyone can craft a payload with an arbitrary `sub` — so every entry
 * point (HTTP guard and WebSocket gateway) must go through verifySupabaseToken().
 *
 * Three verification strategies, in order of preference:
 *   1. Asymmetric (RS256/ES256/EdDSA) — public keys pulled from the project JWKS
 *      endpoint and cached. Fully local, no rate limit.
 *   2. Symmetric (HS256) — requires SUPABASE_JWT_SECRET in .env
 *      (Supabase Dashboard → Project Settings → API → JWT Secret). Fully local.
 *   3. Remote fallback — supabase.auth.getUser(token). Used when no local key
 *      material is available. Results are cached briefly so a busy chat session
 *      does not hammer the Auth API.
 */

export interface VerifiedIdentity {
  userId: string;
  email: string;
  metadata: Record<string, any>;
}

export class TokenVerificationError extends Error {}

const ASYMMETRIC_ALGS = ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'EdDSA'];
const CLOCK_TOLERANCE_SECONDS = 5;

// ── JWKS cache ────────────────────────────────────────────────────────────────
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
        // Unsupported key type — skip it rather than failing the whole set.
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
  if (jwksKeys.size === 0 || stale) {
    await refreshJwks().catch(() => undefined);
  }
  if (jwksKeys.has(kid)) return jwksKeys.get(kid)!;

  // Unknown kid: the project may have rotated its signing key since our last fetch.
  if (!stale) await refreshJwks().catch(() => undefined);
  return jwksKeys.get(kid) ?? null;
}

// ── Remote verification cache ─────────────────────────────────────────────────
const REMOTE_TTL_MS = 60 * 1000;
const remoteCache = new Map<string, { identity: VerifiedIdentity; expiresAt: number }>();

function cacheKey(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function verifyRemotely(token: string): Promise<VerifiedIdentity> {
  const key = cacheKey(token);
  const hit = remoteCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.identity;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    remoteCache.delete(key);
    throw new TokenVerificationError('Token rejected by Supabase Auth');
  }

  const identity: VerifiedIdentity = {
    userId: data.user.id,
    email: data.user.email ?? '',
    metadata: data.user.user_metadata ?? {},
  };

  if (remoteCache.size > 5000) remoteCache.clear();
  remoteCache.set(key, { identity, expiresAt: Date.now() + REMOTE_TTL_MS });
  return identity;
}

// ── Public API ────────────────────────────────────────────────────────────────
function toIdentity(payload: any): VerifiedIdentity {
  if (!payload?.sub) throw new TokenVerificationError('Token has no subject');
  return {
    userId: payload.sub,
    email: payload.email ?? '',
    metadata: payload.user_metadata ?? {},
  };
}

/**
 * Verifies a Supabase access token and returns the caller's identity.
 * Throws TokenVerificationError if the signature, expiry or shape is invalid.
 */
export async function verifySupabaseToken(rawToken: string): Promise<VerifiedIdentity> {
  const token = (rawToken ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new TokenVerificationError('Missing token');

  // Header is read only to pick a verification strategy — never to grant trust.
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
    if (alg === 'HS256' || alg === 'HS384' || alg === 'HS512') {
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
