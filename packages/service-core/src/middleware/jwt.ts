import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { UnauthorizedError } from "../errors.js";

export interface JwtAuthOptions {
  /** Additional public paths for this service. Exact match OR prefix wildcard (e.g. "/internal/*"). */
  readonly publicPaths?: readonly string[];
  /**
   * Verification strategy for external (user-facing) Bearer tokens.
   * - `'internal'`: verify the internal HS256 JWT issued by user-service
   *   (`INTERNAL_JWT_SECRET`). This is the post-mobile-pivot token the BFF
   *   forwards (see apps/web/.../session.ts `verifyAccessToken`) and the same
   *   token meal-plan-engine verifies (PyJWT HS256). Use this for any service
   *   reachable by the mobile client through the BFF.
   * - `'jwks'`: verify a Cognito RS256 token via JWKS (legacy web-first path).
   * - `'stub'`: dev-only — extract `sub` without verification.
   * When omitted, behavior auto-detects: `jwks` if `JWKS_URI`+`JWT_ISSUER` are
   * set, else `stub` (or process.exit in production). Omitting preserves the
   * historical behavior — callers opt into `'internal'` explicitly so a shared
   * env file can never silently flip a service's verification strategy.
   */
  readonly mode?: 'internal' | 'jwks' | 'stub';
}

function isPublicPath(urlPath: string, publicPaths: ReadonlySet<string>): boolean {
  if (publicPaths.has(urlPath)) return true;
  for (const pattern of publicPaths) {
    if (pattern.endsWith("/*") && urlPath.startsWith(pattern.slice(0, -1))) return true;
  }
  return false;
}

interface JwtConfig {
  jwksUri: string;
  issuer: string;
  audience?: string;
}

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(jwksUri: string) {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(new URL(jwksUri));
  }
  return _jwks;
}

function loadJwtConfig(): JwtConfig | null {
  const jwksUri = process.env["JWKS_URI"];
  const issuer = process.env["JWT_ISSUER"];
  if (!jwksUri || !issuer) return null;
  const audience = process.env["JWT_AUDIENCE"];
  return audience ? { jwksUri, issuer, audience } : { jwksUri, issuer };
}

function extractToken(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

async function verifyToken(token: string, config: JwtConfig): Promise<JWTPayload> {
  const jwks = getJwks(config.jwksUri);
  const verifyOpts: { issuer: string; audience?: string } = { issuer: config.issuer };
  if (config.audience) verifyOpts.audience = config.audience;
  const { payload } = await jwtVerify(token, jwks, verifyOpts);
  return payload;
}

// Internal HS256 verification — mirrors meal-plan-engine's PyJWT contract
// (algorithms HS256, require sub/exp/token_use, token_use === 'access') so the
// internal access token issued by user-service verifies identically across the
// TS and Python services. Issuer is intentionally NOT checked: the two
// INTERNAL_JWT_ISSUER defaults diverge (auth.service.ts 'celebbase-internal' vs
// env.ts 'celebbase-user-service'), and the shared secret is the trust
// boundary. Issuer binding is deferred until that default mismatch is fixed.
function loadInternalSecret(): Uint8Array | null {
  const secret = process.env["INTERNAL_JWT_SECRET"];
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

async function verifyInternalToken(token: string, secret: Uint8Array): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
    requiredClaims: ["sub", "exp", "token_use"],
  });
  if (payload["token_use"] !== "access") {
    throw new UnauthorizedError("Invalid token_use: expected access");
  }
  return payload;
}

const DEFAULT_PUBLIC_PATHS = ["/health", "/ready", "/docs", "/docs/json"] as const;

function addStubHook(app: FastifyInstance, publicPaths: ReadonlySet<string>): void {
  app.log.warn("JWT running in STUB mode — not suitable for production");
  // eslint-disable-next-line @typescript-eslint/require-await
  app.addHook("onRequest", async (request: FastifyRequest) => {
    const urlPath = request.url.split("?")[0];
    if (urlPath !== undefined && isPublicPath(urlPath, publicPaths)) return;

    const token = extractToken(request);
    if (token) {
      try {
        const parts = token.split(".");
        if (parts.length === 3 && parts[1]) {
          const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as {
            sub?: string;
          };
          if (payload.sub) {
            (request as FastifyRequest & { userId: string }).userId = payload.sub;
            return;
          }
        }
      } catch {
        // fallthrough to stub
      }
    }
    (request as FastifyRequest & { userId: string }).userId = "dev-user-stub";
  });
}

export function registerJwtAuth(app: FastifyInstance, opts?: JwtAuthOptions): void {
  const publicPaths = new Set<string>([...DEFAULT_PUBLIC_PATHS, ...(opts?.publicPaths ?? [])]);

  // Explicit internal HS256 mode — opt-in per service (no env-based silent
  // switch). The BFF forwards the internal access token to these services.
  if (opts?.mode === "internal") {
    const secret = loadInternalSecret();
    if (!secret) {
      const nodeEnv = process.env["NODE_ENV"] ?? "development";
      if (nodeEnv === "production") {
        app.log.fatal(
          "INTERNAL_JWT_SECRET must be set in production for internal JWT auth mode. Cannot start.",
        );
        process.exit(1);
      }
      addStubHook(app, publicPaths);
      return;
    }
    app.log.info("JWT verification enabled via internal HS256");
    app.addHook("onRequest", async (request: FastifyRequest, _reply: FastifyReply) => {
      const urlPath = request.url.split("?")[0];
      if (urlPath !== undefined && isPublicPath(urlPath, publicPaths)) return;

      const token = extractToken(request);
      if (!token) throw new UnauthorizedError("Missing or malformed Authorization header");

      try {
        const payload = await verifyInternalToken(token, secret);
        const sub = payload.sub;
        if (!sub) throw new UnauthorizedError("JWT missing sub claim");
        (request as FastifyRequest & { userId: string }).userId = sub;
      } catch (err) {
        if (err instanceof UnauthorizedError) throw err;
        const msg = err instanceof Error ? err.message : "Token verification failed";
        throw new UnauthorizedError(msg);
      }
    });
    return;
  }

  if (opts?.mode === "stub") {
    addStubHook(app, publicPaths);
    return;
  }

  const config = loadJwtConfig();

  if (!config) {
    const nodeEnv = process.env["NODE_ENV"] ?? "development";
    if (nodeEnv === "production") {
      app.log.fatal(
        "JWKS_URI and JWT_ISSUER must be set in production. Cannot start with JWT stub.",
      );
      process.exit(1);
    }

    addStubHook(app, publicPaths);
    return;
  }

  app.log.info("JWT verification enabled via JWKS: %s", config.jwksUri);

  app.addHook("onRequest", async (request: FastifyRequest, _reply: FastifyReply) => {
    const urlPath = request.url.split("?")[0];
    if (urlPath !== undefined && isPublicPath(urlPath, publicPaths)) return;

    const token = extractToken(request);
    if (!token) throw new UnauthorizedError("Missing or malformed Authorization header");

    try {
      const payload = await verifyToken(token, config);
      const sub = payload.sub;
      if (!sub) throw new UnauthorizedError("JWT missing sub claim");
      (request as FastifyRequest & { userId: string }).userId = sub;
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err;
      const msg = err instanceof Error ? err.message : "Token verification failed";
      throw new UnauthorizedError(msg);
    }
  });
}
