import type pg from 'pg';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { UnauthorizedError } from '@celebbase/service-core';
import type {
  AuthProvider,
  AuthTokens,
  AuthTokenSubject,
  IdTokenPayload,
} from './auth.service.js';
import { issueInternalTokens } from './auth.service.js';

type DbClient = pg.Pool | pg.PoolClient;

export interface CognitoConfig {
  userPoolId: string;
  clientId: string;
  mobileClientId?: string;
  region: string;
  jwksUri: string;
  issuer: string;
  log?: { warn: (obj: unknown, msg: string) => void };
}

/**
 * CognitoAuthProvider verifies external Cognito id_tokens (RS256 via JWKS) and
 * delegates internal HS256 token issuance to the shared helpers. Access and
 * refresh tokens never cross the user-service boundary in raw Cognito form —
 * clients receive only internal JWTs.
 */
export class CognitoAuthProvider implements AuthProvider {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly clientId: string;
  private readonly mobileClientId: string | undefined;
  private readonly issuer: string;
  private readonly log: { warn: (obj: unknown, msg: string) => void } | undefined;

  constructor(config: CognitoConfig) {
    this.clientId = config.clientId;
    this.mobileClientId = config.mobileClientId;
    this.issuer = config.issuer;
    this.jwks = createRemoteJWKSet(new URL(config.jwksUri));
    this.log = config.log;
  }

  async verifyIdToken(idToken: string): Promise<IdTokenPayload> {
    const audience: string | string[] = this.mobileClientId
      ? [this.clientId, this.mobileClientId]
      : this.clientId;
    try {
      const { payload } = await jwtVerify(idToken, this.jwks, {
        issuer: this.issuer,
        audience,
        algorithms: ['RS256'],
        clockTolerance: 60,
      });
      if (payload['token_use'] !== 'id') {
        throw new UnauthorizedError('Expected id token');
      }
      if (typeof payload.sub !== 'string' || !payload.sub) {
        throw new UnauthorizedError('Missing sub claim');
      }
      if (typeof payload['email'] !== 'string' || !payload['email']) {
        throw new UnauthorizedError('Missing email claim');
      }
      return { sub: payload.sub, email: payload['email'] };
    } catch (err) {
      // Re-raise UnauthorizedError as-is; otherwise map jose/SDK errors to a
      // single opaque 401 (user enumeration defense, R2-G-H2).
      if (err instanceof UnauthorizedError) throw err;
      const reason =
        err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : 'unknown';
      this.log?.warn({ reason }, 'cognito_auth_failed');
      throw new UnauthorizedError('Invalid or expired id token');
    }
  }

  async issueTokens(client: DbClient, subject: AuthTokenSubject): Promise<AuthTokens> {
    return issueInternalTokens(client, subject);
  }
}
