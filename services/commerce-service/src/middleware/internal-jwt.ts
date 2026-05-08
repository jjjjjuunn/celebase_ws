import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify } from 'jose';

const INTERNAL_ISSUER = 'celebbase-internal';
const INTERNAL_AUDIENCE = 'commerce-service:internal';

const jtiCache = new Map<string, number>();

const JTI_TTL_MS = 60_000;

function pruneJtiCache(): void {
  const now = Date.now();
  for (const [jti, exp] of jtiCache) {
    if (now > exp) jtiCache.delete(jti);
  }
}

function isJtiSeen(jti: string): boolean {
  pruneJtiCache();
  return jtiCache.has(jti);
}

function markJtiSeen(jti: string): void {
  jtiCache.set(jti, Date.now() + JTI_TTL_MS);
  // unref so jest can exit cleanly between test files (otherwise the 60s timer
  // keeps the event loop alive after tests complete).
  setTimeout(() => { jtiCache.delete(jti); }, JTI_TTL_MS).unref();
}

function getSecret(): Uint8Array {
  const secret = process.env['INTERNAL_JWT_SECRET'] ?? 'dev-secret-not-for-prod';
  return new TextEncoder().encode(secret);
}

export function registerInternalJwtAuth(app: FastifyInstance): void {
  app.addHook(
    'onRequest',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const urlPath = request.url.split('?')[0] ?? '';
      if (!urlPath.startsWith('/internal/')) return;

      const auth = request.headers.authorization;
      if (!auth || !auth.startsWith('Bearer ')) {
        request.log.warn(
          { reason: 'missing_token', path: urlPath },
          'internal_jwt.rejected',
        );
        await reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Missing internal token', requestId: request.id },
        });
        return;
      }

      const token = auth.slice(7);

      try {
        const { payload } = await jwtVerify(token, getSecret(), {
          issuer: INTERNAL_ISSUER,
          audience: INTERNAL_AUDIENCE,
          algorithms: ['HS256'],
        });

        const jti = payload.jti;
        if (!jti) {
          request.log.warn({ reason: 'missing_jti', path: urlPath }, 'internal_jwt.rejected');
          await reply.status(401).send({
            error: { code: 'UNAUTHORIZED', message: 'Missing jti', requestId: request.id },
          });
          return;
        }

        if (isJtiSeen(jti)) {
          request.log.warn({ reason: 'jti_replay', path: urlPath }, 'internal_jwt.rejected');
          await reply.status(401).send({
            error: { code: 'UNAUTHORIZED', message: 'Token replay detected', requestId: request.id },
          });
          return;
        }

        markJtiSeen(jti);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        let reason: string;
        if (msg.includes('audience')) {
          reason = 'aud_mismatch';
        } else if (msg.includes('issuer')) {
          reason = 'iss_mismatch';
        } else if (msg.includes('exp') || msg.includes('expired')) {
          reason = 'exp';
        } else {
          reason = 'invalid';
        }
        request.log.warn({ reason, path: urlPath }, 'internal_jwt.rejected');
        await reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Invalid internal token', requestId: request.id },
        });
      }
    },
  );
}
