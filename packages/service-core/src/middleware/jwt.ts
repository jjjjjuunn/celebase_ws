import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { UnauthorizedError } from '../errors.js';

/**
 * JWT configuration loaded from environment variables.
 *
 * - JWKS_URI: Cognito JWKS endpoint (e.g. https://cognito-idp.{region}.amazonaws.com/{poolId}/.well-known/jwks.json)
 * - JWT_ISSUER: Expected `iss` claim (e.g. https://cognito-idp.{region}.amazonaws.com/{poolId})
 * - JWT_AUDIENCE: Expected `aud` claim (Cognito app client ID). Optional — Cognito ID tokens use `aud`, access tokens don't.
 */
interface JwtConfig {
  jwksUri: string;
  issuer: string;
  audience?: string;
}

/** Cached JWKS fetcher — jose handles key rotation + caching internally. */
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(jwksUri: string): ReturnType<typeof createRemoteJWKSet> {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(new URL(jwksUri));
  }
  return _jwks;
}

function loadJwtConfig(): JwtConfig | null {
  const jwksUri = process.env['JWKS_URI'];
  const issuer = process.env['JWT_ISSUER'];

  if (!jwksUri || !issuer) {
    return null;
  }

  const audience = process.env['JWT_AUDIENCE'];
  const config: JwtConfig = { jwksUri, issuer };
  if (audience) {
    config.audience = audience;
  }
  return config;
}

/**
 * Extract Bearer token from Authorization header.
 */
function extractToken(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return null;
  }
  return auth.slice(7);
}

/**
 * Verify a JWT against the JWKS endpoint.
 * Returns the payload on success, throws UnauthorizedError on failure.
 */
async function verifyToken(token: string, config: JwtConfig): Promise<JWTPayload> {
  const jwks = getJwks(config.jwksUri);

  const verifyOptions: { issuer: string; audience?: string } = {
    issuer: config.issuer,
  };
  if (config.audience) {
    verifyOptions.audience = config.audience;
  }

  const { payload } = await jwtVerify(token, jwks, verifyOptions);
  return payload;
}

/** Public routes that skip JWT verification. */
const PUBLIC_PATHS = new Set(['/health', '/docs', '/docs/json', '/auth/signup', '/auth/login', '/auth/refresh']);

/**
 * Register JWT authentication on a Fastify instance.
 *
 * - In **development/test** without JWKS_URI: falls back to stub mode (warns, sets userId to 'dev-user-stub').
 * - In **production** without JWKS_URI: fatal error, process exits.
 * - With JWKS_URI configured: verifies every non-public request via Cognito JWKS.
 */
export function registerJwtAuth(app: FastifyInstance): void {
  const config = loadJwtConfig();

  if (!config) {
    // No JWKS configured
    const nodeEnv = process.env['NODE_ENV'] ?? 'development';

    if (nodeEnv === 'production') {
      app.log.fatal('JWKS_URI and JWT_ISSUER must be set in production. Cannot start with JWT stub.');
      process.exit(1);
    }

    // Dev/test stub mode
    app.log.warn('JWT running in STUB mode (JWKS_URI not set) — not suitable for production');
    // eslint-disable-next-line @typescript-eslint/require-await
    app.addHook('onRequest', async (request: FastifyRequest) => {
      // Skip public paths in dev too
      const urlPath = request.url.split('?')[0];
      if (urlPath !== undefined && PUBLIC_PATHS.has(urlPath)) {
        return;
      }

      // If a Bearer token is present, decode the payload to extract sub (no signature check)
      const token = extractToken(request);
      if (token) {
        try {
          const parts = token.split('.');
          if (parts.length === 3 && parts[1]) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as { sub?: string };
            if (payload.sub) {
              (request as FastifyRequest & { userId: string }).userId = payload.sub;
              return;
            }
          }
        } catch {
          // Fall through to default stub
        }
      }

      (request as FastifyRequest & { userId: string }).userId = 'dev-user-stub';
    });
    return;
  }

  app.log.info('JWT verification enabled via JWKS: %s', config.jwksUri);

  app.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    // Skip public paths
    const urlPath = request.url.split('?')[0];
    if (urlPath !== undefined && PUBLIC_PATHS.has(urlPath)) {
      return;
    }

    const token = extractToken(request);
    if (!token) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    try {
      const payload = await verifyToken(token, config);
      const sub = payload.sub;
      if (!sub) {
        throw new UnauthorizedError('JWT missing sub claim');
      }
      (request as FastifyRequest & { userId: string }).userId = sub;
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        throw err;
      }
      // jose throws JOSEError subtypes for expired, invalid signature, etc.
      const message = err instanceof Error ? err.message : 'Token verification failed';
      throw new UnauthorizedError(message);
    }
  });
}
