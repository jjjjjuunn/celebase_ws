import type { FastifyInstance } from 'fastify';
import { getInternalSigningKey } from '../lib/internal-signing-key.js';

// Publishes the internal token RS256 public key (CHORE-AUTH-ASYMMETRIC-SIGNING-001).
// Public, unauthenticated — it serves only the public half of the key pair, the
// standard JWKS contract used by every JWKS consumer (jose createRemoteJWKSet,
// PyJWKClient). Must be listed in registerJwtAuth publicPaths.
export function jwksRoutes(app: FastifyInstance): void {
  app.get('/.well-known/jwks.json', async (_request, reply) => {
    const { publicJwk } = await getInternalSigningKey();
    // Short cache — consumers cache JWKS themselves; this lets a rotated key
    // propagate within minutes without being uncacheable.
    await reply.header('Cache-Control', 'public, max-age=300').send({ keys: [publicJwk] });
  });
}
