import type pg from 'pg';
import type { User } from '@celebbase/shared-types';
import { SignJWT, decodeJwt } from 'jose';
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

export interface AuthProvider {
  /** Verify an id_token and extract sub + email. */
  verifyIdToken(idToken: string): Promise<IdTokenPayload>;
  /** Issue access + refresh tokens for a given user ID. */
  issueTokens(userId: string): Promise<AuthTokens>;
  /** Refresh tokens using an existing refresh_token. */
  refreshTokens(refreshToken: string): Promise<AuthTokens>;
}

// ── Dev stub provider ─────────────────────────────────────────────────────

const DEV_SECRET = new TextEncoder().encode('celebbase-dev-secret-key-do-not-use-in-production');

export class DevAuthProvider implements AuthProvider {
  // eslint-disable-next-line @typescript-eslint/require-await
  async verifyIdToken(idToken: string): Promise<IdTokenPayload> {
    // In dev, id_token is optional. If provided, decode it (no signature check).
    if (idToken) {
      const payload = decodeJwt(idToken);
      if (!payload.sub || !payload.email) {
        throw new UnauthorizedError('Dev id_token missing sub or email');
      }
      return { sub: payload.sub, email: payload.email as string };
    }
    throw new UnauthorizedError('id_token required');
  }

  async issueTokens(userId: string): Promise<AuthTokens> {
    const now = Math.floor(Date.now() / 1000);

    const accessToken = await new SignJWT({ sub: userId, token_use: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime('1h')
      .setIssuer('celebbase-dev')
      .sign(DEV_SECRET);

    const refreshToken = await new SignJWT({ sub: userId, token_use: 'refresh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime('30d')
      .setIssuer('celebbase-dev')
      .sign(DEV_SECRET);

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const payload = decodeJwt(refreshToken);
    if (!payload.sub) {
      throw new UnauthorizedError('Invalid refresh token: missing sub');
    }
    return this.issueTokens(payload.sub);
  }
}

// ── Service functions ─────────────────────────────────────────────────────

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

  // Check if user already exists
  const existing = await userRepo.findByEmail(pool, email);
  if (existing) {
    throw new ValidationError('Email already registered', [
      { field: 'email', issue: 'A user with this email already exists' },
    ]);
  }

  const user = await userRepo.create(pool, {
    cognito_sub: cognitoSub,
    email,
    display_name: input.display_name,
  });

  const tokens = await provider.issueTokens(user.id);
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

  const tokens = await provider.issueTokens(user.id);
  return { user, ...tokens };
}

export async function refresh(
  provider: AuthProvider,
  refreshToken: string,
): Promise<AuthTokens> {
  return provider.refreshTokens(refreshToken);
}
