import type pg from 'pg';
import type { User } from '@celebbase/shared-types';
import { SignJWT, jwtVerify, decodeJwt } from 'jose';
import { randomUUID } from 'node:crypto';
import { UnauthorizedError, ValidationError } from '@celebbase/service-core';
import * as userRepo from '../repositories/user.repository.js';

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

export interface AuthProvider {
  /** Verify an id_token and extract sub + email. */
  verifyIdToken(idToken: string): Promise<IdTokenPayload>;
  /** Issue internal HS256 access + refresh tokens for the given subject. */
  issueTokens(subject: AuthTokenSubject): Promise<AuthTokens>;
  /** Verify an internal refresh token and re-issue a rotated pair. */
  refreshTokens(refreshToken: string): Promise<AuthTokens>;
}

// ── Internal token helpers (shared across providers) ──────────────────────

const DEFAULT_DEV_SECRET = 'dev-secret-not-for-prod';
const DEFAULT_INTERNAL_ISSUER = 'celebbase-user-service';

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

export async function issueInternalTokens(
  subject: AuthTokenSubject,
): Promise<AuthTokens> {
  const now = Math.floor(Date.now() / 1000);
  const baseClaims = {
    sub: subject.sub,
    email: subject.email,
    cognito_sub: subject.cognito_sub,
  };

  const accessToken = await new SignJWT({ ...baseClaims, token_use: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime('1h')
    .setIssuer(INTERNAL_ISSUER)
    .sign(INTERNAL_SECRET);

  const refreshToken = await new SignJWT({ ...baseClaims, token_use: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime('30d')
    .setIssuer(INTERNAL_ISSUER)
    .sign(INTERNAL_SECRET);

  return { access_token: accessToken, refresh_token: refreshToken };
}

export async function verifyInternalRefresh(
  refreshToken: string,
): Promise<AuthTokenSubject> {
  try {
    const { payload } = await jwtVerify(refreshToken, INTERNAL_SECRET, {
      algorithms: ['HS256'],
      issuer: INTERNAL_ISSUER,
      clockTolerance: 60,
    });
    if (payload['token_use'] !== 'refresh') {
      throw new UnauthorizedError('Invalid token: expected refresh token');
    }
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new UnauthorizedError('Invalid refresh token: missing sub');
    }
    return {
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

  async issueTokens(subject: AuthTokenSubject): Promise<AuthTokens> {
    return issueInternalTokens(subject);
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const subject = await verifyInternalRefresh(refreshToken);
    return issueInternalTokens(subject);
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
      const tokens = await provider.issueTokens(toSubject(merged));
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

  const tokens = await provider.issueTokens(toSubject(user));
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

  const tokens = await provider.issueTokens(toSubject(user));
  return { user, ...tokens };
}

export async function refresh(
  provider: AuthProvider,
  refreshToken: string,
): Promise<AuthTokens> {
  return provider.refreshTokens(refreshToken);
}
