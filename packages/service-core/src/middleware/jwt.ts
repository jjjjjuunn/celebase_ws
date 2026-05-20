import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from "jose";
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

// Internal token verification (CHORE-AUTH-ASYMMETRIC-SIGNING-001 Phase 2 — dual
// verify). The internal access token issued by user-service is verified
// identically across TS + Python services: require sub/exp/token_use,
// token_use === 'access', issuer bound to INTERNAL_JWT_ISSUER (default
// 'celebbase-user-service', aligned in CHORE-AUTH-ISSUER-DEFAULT-ALIGN-001).
//
// Algorithm dispatch keyed off the (attacker-controlled) header alg, but each
// alg routes to a DIFFERENT key — HS256 → shared secret, RS256 → user-service
// JWKS public key — so RS256/HS256 algorithm-confusion is structurally
// impossible (jose's explicit `algorithms` further pins it). During the
// HS256→RS256 migration both paths are live; HS256 is dropped in Phase 3.
const DEFAULT_INTERNAL_ISSUER = "celebbase-user-service";

let _internalJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getInternalJwks(uri: string) {
  if (!_internalJwks) {
    _internalJwks = createRemoteJWKSet(new URL(uri));
  }
  return _internalJwks;
}

/** Test-only: clear the cached internal JWKS so a fresh key set is fetched. */
export function resetInternalJwksForTest(): void {
  _internalJwks = null;
}

function loadInternalSecret(): Uint8Array | null {
  const secret = process.env["INTERNAL_JWT_SECRET"];
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

function loadInternalJwksUri(): string | undefined {
  const uri = process.env["INTERNAL_JWKS_URI"];
  return uri !== undefined && uri !== "" ? uri : undefined;
}

function loadInternalIssuer(): string {
  return process.env["INTERNAL_JWT_ISSUER"] ?? DEFAULT_INTERNAL_ISSUER;
}

async function verifyInternalToken(
  token: string,
  secret: Uint8Array | null,
  jwksUri: string | undefined,
): Promise<JWTPayload> {
  const { alg } = decodeProtectedHeader(token);
  const issuer = loadInternalIssuer();
  let payload: JWTPayload;

  if (alg === "RS256") {
    if (jwksUri === undefined) {
      throw new UnauthorizedError("RS256 token but INTERNAL_JWKS_URI not configured");
    }
    ({ payload } = await jwtVerify(token, getInternalJwks(jwksUri), {
      algorithms: ["RS256"],
      issuer,
      requiredClaims: ["sub", "exp", "token_use"],
    }));
  } else {
    if (secret === null) {
      throw new UnauthorizedError("HS256 token but INTERNAL_JWT_SECRET not configured");
    }
    ({ payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer,
      requiredClaims: ["sub", "exp", "token_use"],
    }));
  }

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

  // Explicit internal mode — opt-in per service (no env-based silent switch).
  // The BFF forwards the internal access token to these services. Verifies
  // RS256 (via INTERNAL_JWKS_URI) and/or HS256 (via INTERNAL_JWT_SECRET) — at
  // least one must be configured (dual during the HS256→RS256 migration).
  if (opts?.mode === "internal") {
    const secret = loadInternalSecret();
    const jwksUri = loadInternalJwksUri();
    if (secret === null && jwksUri === undefined) {
      const nodeEnv = process.env["NODE_ENV"] ?? "development";
      if (nodeEnv === "production") {
        app.log.fatal(
          "INTERNAL_JWT_SECRET or INTERNAL_JWKS_URI must be set in production for internal JWT auth mode. Cannot start.",
        );
        process.exit(1);
      }
      addStubHook(app, publicPaths);
      return;
    }
    app.log.info(
      "JWT verification enabled via internal token (RS256=%s, HS256=%s)",
      jwksUri !== undefined ? "on" : "off",
      secret !== null ? "on" : "off",
    );
    app.addHook("onRequest", async (request: FastifyRequest, _reply: FastifyReply) => {
      const urlPath = request.url.split("?")[0];
      if (urlPath !== undefined && isPublicPath(urlPath, publicPaths)) return;

      const token = extractToken(request);
      if (!token) throw new UnauthorizedError("Missing or malformed Authorization header");

      try {
        const payload = await verifyInternalToken(token, secret, jwksUri);
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
