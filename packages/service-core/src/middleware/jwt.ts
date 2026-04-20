import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { UnauthorizedError } from "../errors.js";

export interface JwtAuthOptions {
  /** Additional public paths for this service. Exact match OR prefix wildcard (e.g. "/internal/*"). */
  readonly publicPaths?: readonly string[];
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

const DEFAULT_PUBLIC_PATHS = ["/health", "/ready", "/docs", "/docs/json"] as const;

export function registerJwtAuth(app: FastifyInstance, opts?: JwtAuthOptions): void {
  const publicPaths = new Set<string>([...DEFAULT_PUBLIC_PATHS, ...(opts?.publicPaths ?? [])]);
  const config = loadJwtConfig();

  if (!config) {
    const nodeEnv = process.env["NODE_ENV"] ?? "development";
    if (nodeEnv === "production") {
      app.log.fatal(
        "JWKS_URI and JWT_ISSUER must be set in production. Cannot start with JWT stub.",
      );
      process.exit(1);
    }

    app.log.warn("JWT running in STUB mode (JWKS_URI not set) — not suitable for production");
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
