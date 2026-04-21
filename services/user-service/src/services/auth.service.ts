import type pg from 'pg';
import type { User } from '@celebbase/shared-types';
import { SignJWT, jwtVerify, decodeJwt } from 'jose';
import { randomUUID } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { UnauthorizedError, ValidationError } from '@celebbase/service-core';
import * as userRepo from '../repositories/user.repository.js';
import * as refreshTokenRepo from '../repositories/refresh-token.repository.js';
import { emitAuthLog, hashId, type AuthLogger } from '../lib/auth-log.js';

// ── Provider interface ────────────────────────────────────────────────────

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface IdTokenPayload {
  sub: string;
  email: string;
}

/** Claims encoded in the internal HS256 JWT. sub = users.id. */
export interface AuthTokenSubject {
  sub: string;
  email: string;
  cognito_sub: string;
}

type DbClient = pg.Pool | pg.PoolClient;

export interface AuthProvider {
  /** Verify an id_token and extract sub + email. */
  verifyIdToken(idToken: string): Promise<IdTokenPayload>;
  /** Issue internal HS256 access + refresh tokens for the given subject. */
  issueTokens(client: DbClient, subject: AuthTokenSubject): Promise<AuthTokens>;
}

// ── Internal token helpers (shared across providers) ──────────────────────

export const DEV_INTERNAL_JWT_SECRET = 'dev-internal-secret-32-chars-pad';
const DEFAULT_DEV_SECRET = DEV_INTERNAL_JWT_SECRET;
const DEFAULT_INTERNAL_ISSUER = 'celebbase-internal';

export function loadDevSecret(): Uint8Array {
  const raw = process.env['INTERNAL_JWT_SECRET'] ?? DEFAULT_DEV_SECRET;
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  if (nodeEnv === 'production' && raw === DEFAULT_DEV_SECRET) {
    throw new Error('INTERNAL_JWT_SECRET must be set to a non-default value in production');
  }
  return new TextEncoder().encode(raw);
}

function loadInternalIssuer(): string {
  return process.env['INTERNAL_JWT_ISSUER'] ?? DEFAULT_INTERNAL_ISSUER;
}

const INTERNAL_SECRET = loadDevSecret();
const INTERNAL_ISSUER = loadInternalIssuer();

const REFRESH_TTL_DAYS = 30;

export async function issueInternalTokens(
  client: DbClient,
  subject: AuthTokenSubject,
): Promise<AuthTokens> {
  const now = Math.floor(Date.now() / 1000);
  const jti = uuidv7();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  const baseClaims = {
    sub: subject.sub,
    email: subject.email,
    cognito_sub: subject.cognito_sub,
  };

  const accessToken = await new SignJWT({ ...baseClaims, token_use: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime('15m')
    .setIssuer(INTERNAL_ISSUER)
    .sign(INTERNAL_SECRET);

  const refreshToken = await new SignJWT({ ...baseClaims, token_use: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime('30d')
    .setIssuer(INTERNAL_ISSUER)
    .setJti(jti)
    .sign(INTERNAL_SECRET);

  await refreshTokenRepo.insert(client, { jti, userId: subject.sub, expiresAt });

  return { access_token: accessToken, refresh_token: refreshToken };
}

export async function verifyInternalRefresh(
  refreshToken: string,
): Promise<AuthTokenSubject & { jti: string }> {
  try {
    const { payload } = await jwtVerify(refreshToken, INTERNAL_SECRET, {
      algorithms: ['HS256'],
      issuer: INTERNAL_ISSUER,
      clockTolerance: 2,
    });
    if (payload['token_use'] !== 'refresh') {
      throw new UnauthorizedError('Invalid token: expected refresh token');
    }
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new UnauthorizedError('Invalid refresh token: missing sub');
    }
    const jti = typeof payload['jti'] === 'string' ? payload['jti'] : '';
    return {
      jti,
      sub: payload.sub,
      email: typeof payload['email'] === 'string' ? payload['email'] : '',
      cognito_sub:
        typeof payload['cognito_sub'] === 'string' ? payload['cognito_sub'] : '',
    };
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
}

// ── Dev stub provider ─────────────────────────────────────────────────────

export class DevAuthProvider implements AuthProvider {
  // eslint-disable-next-line @typescript-eslint/require-await
  async verifyIdToken(idToken: string): Promise<IdTokenPayload> {
    if (idToken) {
      const payload = decodeJwt(idToken);
      if (!payload.sub || !payload.email) {
        throw new UnauthorizedError('Dev id_token missing sub or email');
      }
      return { sub: payload.sub, email: payload.email as string };
    }
    throw new UnauthorizedError('id_token required');
  }

  async issueTokens(client: DbClient, subject: AuthTokenSubject): Promise<AuthTokens> {
    return issueInternalTokens(client, subject);
  }
}

// ── Service functions ─────────────────────────────────────────────────────

function toSubject(user: User): AuthTokenSubject {
  return { sub: user.id, email: user.email, cognito_sub: user.cognito_sub };
}

interface SignupInput {
  email: string;
  display_name: string;
  id_token?: string | undefined;
}

export async function signup(
  pool: pg.Pool,
  provider: AuthProvider,
  input: SignupInput,
): Promise<{ user: User } & AuthTokens> {
  let cognitoSub: string;
  let email: string;

  if (input.id_token) {
    const payload = await provider.verifyIdToken(input.id_token);
    cognitoSub = payload.sub;
    email = payload.email;
  } else {
    // Dev stub: generate fake cognito sub
    if (provider instanceof DevAuthProvider) {
      cognitoSub = `dev-${randomUUID()}`;
      email = input.email;
    } else {
      throw new ValidationError('id_token is required', [
        { field: 'id_token', issue: 'Required for production signup' },
      ]);
    }
  }

  // Email-bridge: if a dev-seeded user with this email already exists, merge
  // by atomically updating cognito_sub rather than rejecting with conflict.
  const existing = await userRepo.findByEmail(pool, email);
  if (existing) {
    if (existing.cognito_sub.startsWith('dev-') && !cognitoSub.startsWith('dev-')) {
      const merged = await userRepo.findAndUpdateCognitoSubByEmail(
        pool,
        email,
        cognitoSub,
      );
      if (!merged) {
        throw new ValidationError('Email already registered', [
          { field: 'email', issue: 'A user with this email already exists' },
        ]);
      }
      const tokens = await provider.issueTokens(pool, toSubject(merged));
      return { user: merged, ...tokens };
    }
    throw new ValidationError('Email already registered', [
      { field: 'email', issue: 'A user with this email already exists' },
    ]);
  }

  const user = await userRepo.create(pool, {
    cognito_sub: cognitoSub,
    email,
    display_name: input.display_name,
  });

  // Atomic guard: DB unique constraint caught as null (TOCTOU race on email/cognito_sub)
  if (!user) {
    throw new ValidationError('Email already registered', [
      { field: 'email', issue: 'A user with this email already exists' },
    ]);
  }

  const tokens = await provider.issueTokens(pool, toSubject(user));
  return { user, ...tokens };
}

interface LoginInput {
  email: string;
  id_token?: string | undefined;
}

export async function login(
  pool: pg.Pool,
  provider: AuthProvider,
  input: LoginInput,
): Promise<{ user: User } & AuthTokens> {
  let user: User | null;

  if (input.id_token) {
    const payload = await provider.verifyIdToken(input.id_token);
    user = await userRepo.findByCognitoSub(pool, payload.sub);
    if (!user) {
      // Email-bridge: legacy dev-seeded user → atomic cognito_sub update
      user = await userRepo.findAndUpdateCognitoSubByEmail(
        pool,
        payload.email,
        payload.sub,
      );
    }
  } else {
    // Dev stub: find by email
    if (provider instanceof DevAuthProvider) {
      user = await userRepo.findByEmail(pool, input.email);
    } else {
      throw new ValidationError('id_token is required', [
        { field: 'id_token', issue: 'Required for production login' },
      ]);
    }
  }

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  if (user.deleted_at !== null) {
    throw new UnauthorizedError('Account has been deleted');
  }

  const tokens = await provider.issueTokens(pool, toSubject(user));
  return { user, ...tokens };
}

// ── Phase C: stateful rotation ────────────────────────────────────────────

export async function performRotation(
  pool: pg.Pool,
  refreshJwt: string,
  log: AuthLogger,
  requestId: string,
): Promise<AuthTokens> {
  // 1. Verify signature + expiry first (timing-safe: no DB before this)
  let jwtPayload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
  try {
    const result = await jwtVerify(refreshJwt, INTERNAL_SECRET, {
      algorithms: ['HS256'],
      issuer: INTERNAL_ISSUER,
      clockTolerance: 2,
    });
    jwtPayload = result.payload;
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  // 2. Extract and validate required claims
  if (jwtPayload['token_use'] !== 'refresh') {
    throw new UnauthorizedError('Expected refresh token');
  }
  const userId = typeof jwtPayload.sub === 'string' ? jwtPayload.sub : null;
  const jti = typeof jwtPayload['jti'] === 'string' ? jwtPayload['jti'] : null;
  const email = typeof jwtPayload['email'] === 'string' ? jwtPayload['email'] : '';
  const cognitoSub =
    typeof jwtPayload['cognito_sub'] === 'string' ? jwtPayload['cognito_sub'] : '';

  if (!userId || !jti) {
    throw new UnauthorizedError('Invalid refresh token claims');
  }

  const subject: AuthTokenSubject = { sub: userId, email, cognito_sub: cognitoSub };

  // 3. Single transaction: INSERT new jti, atomic UPDATE old jti
  const client = await pool.connect();
  let newTokens: AuthTokens;
  try {
    await client.query('BEGIN');

    // a. Issue new tokens — inserts new jti into DB inside this tx
    newTokens = await issueInternalTokens(client, subject);

    // b. Decode new jti from the issued refresh token
    const newPayload = decodeJwt(newTokens.refresh_token);
    const newJti = typeof newPayload['jti'] === 'string' ? newPayload['jti'] : null;
    if (!newJti) {
      await client.query('ROLLBACK');
      throw new UnauthorizedError('Internal error: new jti missing');
    }

    // c. Atomic rotate: consume old jti (WHERE revoked_at IS NULL AND expires_at > now())
    const consumed = await refreshTokenRepo.revokeForRotation(client, {
      oldJti: jti,
      newJti,
      userId,
    });

    if (consumed) {
      await client.query('COMMIT');
    } else {
      // ROLLBACK first — new jti must not persist in DB if rotation failed
      await client.query('ROLLBACK');

      // d. 401 branch: classify why the token could not be consumed
      const meta = await refreshTokenRepo.findMetadata(pool, { jti, userId });

      if (!meta || meta.expiresAt <= new Date()) {
        emitAuthLog(
          log,
          'auth.refresh.expired_or_missing',
          { user_id_hash: hashId(userId), requestId },
        );
        throw new UnauthorizedError('Refresh token expired or not found');
      }

      if (meta.revokedReason === 'rotated' || meta.revokedReason === 'reuse_detected') {
        // Emit BEFORE throw (early-exit loss prevention — anti-pattern guard)
        emitAuthLog(
          log,
          'auth.token.reuse_detected',
          {
            user_id_hash: hashId(userId),
            jti_hash: jti.slice(0, 8),
            original_revoked_reason: meta.revokedReason,
            requestId,
          },
          'warn',
        );
        await refreshTokenRepo.revokeAllByUser(pool, { userId, reason: 'reuse_detected' });
        throw new UnauthorizedError('Token reuse detected');
      }

      // revokedReason === 'logout'
      throw new UnauthorizedError('Refresh token has been revoked');
    }
  } finally {
    client.release();
  }

  // 4. Success: emit rotation log
  const newPayloadFinal = decodeJwt(newTokens.refresh_token);
  const newJtiFinal =
    typeof newPayloadFinal['jti'] === 'string' ? newPayloadFinal['jti'] : '';
  emitAuthLog(log, 'auth.refresh.rotated', {
    user_id_hash: hashId(userId),
    old_jti_hash: jti.slice(0, 8),
    new_jti_hash: newJtiFinal.slice(0, 8),
  });

  return newTokens;
}
