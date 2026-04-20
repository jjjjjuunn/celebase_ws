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
  region: string;
  jwksUri: string;
  issuer: string;
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
  private readonly issuer: string;

  constructor(config: CognitoConfig) {
    this.clientId = config.clientId;
    this.issuer = config.issuer;
    this.jwks = createRemoteJWKSet(new URL(config.jwksUri));
  }

  async verifyIdToken(idToken: string): Promise<IdTokenPayload> {
    try {
      const { payload } = await jwtVerify(idToken, this.jwks, {
        issuer: this.issuer,
        audience: this.clientId,
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
      throw new UnauthorizedError('Invalid or expired id token');
    }
  }

  async issueTokens(client: DbClient, subject: AuthTokenSubject): Promise<AuthTokens> {
    return issueInternalTokens(client, subject);
  }
}
