import type pg from 'pg';
import type { User } from '@celebbase/shared-types';
import {
  SignJWT,
  jwtVerify,
  decodeJwt,
  decodeProtectedHeader,
  importJWK,
  errors as joseErrors,
  type JWTPayload,
} from 'jose';
import { getInternalSigningKey } from '../lib/internal-signing-key.js';
import { randomUUID } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import {
  UnauthorizedError,
  ValidationError,
  AccountDeletedError,
  AccountExistsError,
  MalformedRefreshError,
  RefreshExpiredOrMissingError,
  RefreshRevokedError,
  TokenReuseDetectedError,
} from '@celebbase/service-core';
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
// User access/refresh token issuer. MUST match the verifier defaults — BFF
// (apps/web/.../session.ts), user-service env.ts, meal-plan-engine config.py,
// and service-core internal mode all default to 'celebbase-user-service'.
// Previously 'celebbase-internal', which diverged from those verifiers and
// silently broke auth in any environment that left INTERNAL_JWT_ISSUER unset
// (CHORE-AUTH-ISSUER-DEFAULT-ALIGN-001). NOTE: this is the USER-token issuer
// only — the service-to-service /internal/* token system (internal-jwt.ts,
// internal-client.ts) keeps its own 'celebbase-internal' issuer untouched.
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

  // Sign RS256 once a stable signing key is provisioned (INTERNAL_JWT_PRIVATE_KEY),
  // otherwise HS256 (local dev / CI, where no key is configured). Verifiers
  // dual-verify both algorithms by inspecting the JWT header `alg`, so this flip
  // is transparent to them (CHORE-AUTH-ASYMMETRIC-SIGNING-001 Phase 2b). The
  // signal mirrors internal-signing-key.ts's imported-vs-ephemeral branch.
  const privateKeyPem = process.env['INTERNAL_JWT_PRIVATE_KEY'];
  const useRs256 = privateKeyPem !== undefined && privateKeyPem !== '';

  const accessBuilder = new SignJWT({ ...baseClaims, token_use: 'access' })
    .setIssuedAt(now)
    .setExpirationTime('15m')
    .setIssuer(INTERNAL_ISSUER);
  const refreshBuilder = new SignJWT({ ...baseClaims, token_use: 'refresh' })
    .setIssuedAt(now)
    .setExpirationTime('30d')
    .setIssuer(INTERNAL_ISSUER)
    .setJti(jti);

  let accessToken: string;
  let refreshToken: string;
  if (useRs256) {
    const { privateKey, kid } = await getInternalSigningKey();
    accessToken = await accessBuilder.setProtectedHeader({ alg: 'RS256', kid }).sign(privateKey);
    refreshToken = await refreshBuilder.setProtectedHeader({ alg: 'RS256', kid }).sign(privateKey);
  } else {
    accessToken = await accessBuilder.setProtectedHeader({ alg: 'HS256' }).sign(INTERNAL_SECRET);
    refreshToken = await refreshBuilder.setProtectedHeader({ alg: 'HS256' }).sign(INTERNAL_SECRET);
  }

  await refreshTokenRepo.insert(client, { jti, userId: subject.sub, expiresAt });

  return { access_token: accessToken, refresh_token: refreshToken };
}

/**
 * Verify a refresh JWT's signature + issuer, dispatching on the header `alg`:
 * RS256 against this service's own public key (CHORE-AUTH-ASYMMETRIC-SIGNING-001),
 * HS256 against the shared secret. jose errors (incl. JWTExpired) propagate so
 * callers can branch on the failure mode. Single verification path — both
 * verifyInternalRefresh (/auth/logout) and performRotation (/auth/refresh) route
 * through it so the dual-verify dispatch can never diverge again.
 * (FIX-AUTH-REFRESH-RS256-001: performRotation previously verified HS256 only,
 * rejecting every RS256 refresh token as MALFORMED → forced mobile logout.)
 */
async function verifyRefreshJwt(refreshToken: string): Promise<JWTPayload> {
  const { alg } = decodeProtectedHeader(refreshToken);
  if (alg === 'RS256') {
    const { publicJwk } = await getInternalSigningKey();
    const publicKey = await importJWK(publicJwk, 'RS256');
    const { payload } = await jwtVerify(refreshToken, publicKey, {
      algorithms: ['RS256'],
      issuer: INTERNAL_ISSUER,
      clockTolerance: 2,
    });
    return payload;
  }
  const { payload } = await jwtVerify(refreshToken, INTERNAL_SECRET, {
    algorithms: ['HS256'],
    issuer: INTERNAL_ISSUER,
    clockTolerance: 2,
  });
  return payload;
}

export async function verifyInternalRefresh(
  refreshToken: string,
): Promise<AuthTokenSubject & { jti: string }> {
  try {
    const payload = await verifyRefreshJwt(refreshToken);
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
  // Optional: only the dev-stub path consumes it. id_token flows derive email
  // from the verified token (native Apple may omit it entirely on re-sign-in).
  email?: string | undefined;
  id_token?: string | undefined;
}

export async function login(
  pool: pg.Pool,
  provider: AuthProvider,
  input: LoginInput,
  log: AuthLogger,
  requestId: string,
): Promise<{ user: User; is_new_user: boolean } & AuthTokens> {
  let user: User | null;
  // True ONLY when this login lazily provisions a brand-new account (the
  // `created` branch below). Every other path — found by sub, email-bridge,
  // concurrent-create re-read, dev-stub — is an existing user. Drives the
  // social first-login Selection modal (IMPL-MOBILE-SOCIAL-SELECTION-001).
  let isNewUser = false;

  if (input.id_token) {
    const payload = await provider.verifyIdToken(input.id_token);
    user = await userRepo.findByCognitoSub(pool, payload.sub);

    if (!user) {
      // Email-bridge: legacy dev-seeded user → atomic cognito_sub update
      const bridged = await userRepo.findAndUpdateCognitoSubByEmail(
        pool,
        payload.email,
        payload.sub,
      );
      if (bridged) {
        user = bridged;
        emitAuthLog(log, 'auth.email_bridge.applied', {
          cognito_sub_hash: hashId(payload.sub),
          email_hash: hashId(payload.email),
          requestId,
        });
      }
    }

    if (!user) {
      // Lazy provisioning — IMPL-AUTH-LAZY-PROVISION-001.
      // SECURITY: trust on payload.sub/email derives from the provider's
      // verifyIdToken contract — CognitoAuthProvider validates RS256 + issuer +
      // audience array + exp + token_use==='id' (Cognito pool locks email
      // immutable: infra/cognito/main.tf). The native social verifiers
      // (Apple/GoogleAuthProvider, IMPL-MOBILE-SOCIAL-NATIVE-001) preserve the
      // same barrier: RS256 against the provider JWKS + exact issuer + STRICT
      // audience (Apple bundle ID / Google client-ID allowlist) + exp. Any
      // future AuthProvider must keep these or this branch becomes a forgery
      // vector.
      //
      // First-time provisioning needs a real email (users.email is NOT NULL
      // UNIQUE). Native Apple omits `email` on re-sign-in but THAT path is
      // resolved earlier by findByCognitoSub; reaching here with no email means
      // a genuine first sign-in where Apple withheld it (user revoked the app).
      // Fail closed with actionable guidance rather than inserting a blank
      // email (IMPL-MOBILE-SOCIAL-NATIVE-001, advisor invariant #9).
      if (!payload.email) {
        throw new ValidationError(
          'We could not get your email from the sign-in provider. On iOS, open Settings → Apple ID → Sign in with Apple, remove Celebase, then try again.',
          [{ field: 'email', issue: 'APPLE_EMAIL_REQUIRED' }],
        );
      }
      const displayName = payload.email.split('@')[0] || 'User';
      const created = await userRepo.create(pool, {
        cognito_sub: payload.sub,
        email: payload.email,
        display_name: displayName,
      });
      if (created) {
        user = created;
        isNewUser = true;
        emitAuthLog(log, 'auth.user.lazy_provisioned', {
          user_id_hash: hashId(created.id),
          cognito_sub_hash: hashId(payload.sub),
          email_hash: hashId(payload.email),
          reason: 'login_without_prior_signup',
          requestId,
        });
      } else {
        // create returned null → a UNIQUE violation. Two distinct causes:
        //  (1) a concurrent signup committed first with the SAME cognito_sub —
        //      re-read by sub attaches us to the winning row.
        //  (2) a DIFFERENT identity already owns this email: the federated
        //      collision (IMPL-MOBILE-SOCIAL-001). The user signed up with
        //      email/password (or another provider), now arrives via a new
        //      Cognito sub (e.g. "Continue with Google"). Cognito federation
        //      does NOT auto-link, so re-read by sub stays null while
        //      findByEmail finds the incumbent. Surface a structured 409 (no
        //      auto-link — product decision) so the client can route the user
        //      to their original sign-in method instead of 500-ing on the
        //      users.email UNIQUE constraint.
        user = await userRepo.findByCognitoSub(pool, payload.sub);
        if (!user) {
          const incumbent = await userRepo.findByEmail(pool, payload.email);
          if (incumbent && incumbent.cognito_sub !== payload.sub) {
            emitAuthLog(
              log,
              'auth.account.provider_collision',
              {
                email_hash: hashId(payload.email),
                incoming_cognito_sub_hash: hashId(payload.sub),
                existing_cognito_sub_hash: hashId(incumbent.cognito_sub),
                requestId,
              },
              'warn',
            );
            throw new AccountExistsError();
          }
        }
      }
    }
  } else {
    // Dev stub: find by email
    if (provider instanceof DevAuthProvider) {
      if (!input.email) {
        throw new ValidationError('email is required', [
          { field: 'email', issue: 'Required for dev-stub login without id_token' },
        ]);
      }
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
  return { user, is_new_user: isNewUser, ...tokens };
}

// ── Phase C: stateful rotation ────────────────────────────────────────────

export async function performRotation(
  pool: pg.Pool,
  refreshJwt: string,
  log: AuthLogger,
  requestId: string,
): Promise<AuthTokens> {
  // 1. Verify signature + expiry first (timing-safe: no DB before this).
  //    Plan v5 §59: distinguish JWT-expired (REFRESH_EXPIRED_OR_MISSING) from
  //    every other verify failure (MALFORMED) so the mobile state machine can
  //    branch — Cognito silent re-issue vs forced logout.
  let jwtPayload: JWTPayload;
  try {
    jwtPayload = await verifyRefreshJwt(refreshJwt);
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) {
      throw new RefreshExpiredOrMissingError('Refresh token expired');
    }
    throw new MalformedRefreshError('Invalid refresh token');
  }

  // 2. Extract and validate required claims (all → MALFORMED)
  if (jwtPayload['token_use'] !== 'refresh') {
    throw new MalformedRefreshError('Expected refresh token');
  }
  const userId = typeof jwtPayload.sub === 'string' ? jwtPayload.sub : null;
  const jti = typeof jwtPayload['jti'] === 'string' ? jwtPayload['jti'] : null;
  const email = typeof jwtPayload['email'] === 'string' ? jwtPayload['email'] : '';
  const cognitoSub =
    typeof jwtPayload['cognito_sub'] === 'string' ? jwtPayload['cognito_sub'] : '';

  if (!userId || !jti) {
    throw new MalformedRefreshError('Invalid refresh token claims');
  }

  const subject: AuthTokenSubject = { sub: userId, email, cognito_sub: cognitoSub };

  // 3. Single transaction: ACCOUNT_DELETED gate, INSERT new jti, atomic UPDATE old jti
  const client = await pool.connect();
  let newTokens: AuthTokens;
  try {
    await client.query('BEGIN');

    // a. ACCOUNT_DELETED gate — runs inside the transaction so visibility is
    //    consistent with committed deletions (READ COMMITTED snapshot). A
    //    `DELETE /users/me` commits in its own short tx, so any subsequent
    //    refresh sees deleted_at set and is blocked here. We do not take a
    //    row lock — soft-delete + 30-day grace makes strict SERIALIZABLE
    //    overkill. User row missing is treated as MALFORMED (token sub
    //    references a non-existent user — should never happen in practice).
    const user = await userRepo.findByIdInTx(client, userId);
    if (!user) {
      await client.query('ROLLBACK');
      throw new MalformedRefreshError('Refresh token user not found');
    }
    if (user.deleted_at !== null) {
      await client.query('ROLLBACK');
      throw new AccountDeletedError();
    }

    // b. Issue new tokens — inserts new jti into DB inside this tx
    newTokens = await issueInternalTokens(client, subject);

    // c. Decode new jti from the issued refresh token
    const newPayload = decodeJwt(newTokens.refresh_token);
    const newJti = typeof newPayload['jti'] === 'string' ? newPayload['jti'] : null;
    if (!newJti) {
      await client.query('ROLLBACK');
      // Server-side bug — out of scope for IMPL-MOBILE-AUTH-003 enum mapping.
      throw new UnauthorizedError('Internal error: new jti missing');
    }

    // d. Atomic rotate: consume old jti (WHERE revoked_at IS NULL AND expires_at > now())
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

      // e. 401 branch: classify why the token could not be consumed
      const meta = await refreshTokenRepo.findMetadata(pool, { jti, userId });

      if (!meta || meta.expiresAt <= new Date()) {
        emitAuthLog(
          log,
          'auth.refresh.expired_or_missing',
          { user_id_hash: hashId(userId), requestId },
        );
        throw new RefreshExpiredOrMissingError();
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
        throw new TokenReuseDetectedError();
      }

      // revokedReason === 'logout'
      throw new RefreshRevokedError();
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
