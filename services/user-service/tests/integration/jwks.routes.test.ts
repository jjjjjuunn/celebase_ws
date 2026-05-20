import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import { SignJWT, jwtVerify, importJWK, type JWK } from 'jose';

import { jwksRoutes } from '../../src/routes/jwks.routes.js';
import {
  getInternalSigningKey,
  resetInternalSigningKeyForTest,
} from '../../src/lib/internal-signing-key.js';

function makeApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  jwksRoutes(app);
  return app;
}

describe('GET /.well-known/jwks.json', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    resetInternalSigningKeyForTest();
    delete process.env['INTERNAL_JWT_PRIVATE_KEY']; // ephemeral dev key
    process.env['NODE_ENV'] = 'test';
    app = makeApp();
  });

  afterEach(async () => {
    await app.close();
    resetInternalSigningKeyForTest();
  });

  it('serves a public RS256 JWK (no private components)', async () => {
    const res = await app.inject({ method: 'GET', url: '/.well-known/jwks.json' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { keys: JWK[] };
    expect(body.keys).toHaveLength(1);
    const jwk = body.keys[0]!;
    expect(jwk.kty).toBe('RSA');
    expect(jwk.alg).toBe('RS256');
    expect(jwk.use).toBe('sig');
    expect(typeof jwk.kid).toBe('string');
    expect(jwk.n).toBeDefined();
    expect(jwk.e).toBeDefined();
    // Private components must never be published.
    expect(jwk.d).toBeUndefined();
    expect(jwk.p).toBeUndefined();
    expect(jwk.q).toBeUndefined();
  });

  it('sets a cache header', async () => {
    const res = await app.inject({ method: 'GET', url: '/.well-known/jwks.json' });
    expect(res.headers['cache-control']).toContain('max-age=300');
  });

  it('published public key verifies a token signed by the private key (round-trip)', async () => {
    const { privateKey, kid } = await getInternalSigningKey();

    const token = await new SignJWT({ token_use: 'access' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setSubject('user-xyz')
      .setIssuer('celebbase-user-service')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(privateKey);

    const res = await app.inject({ method: 'GET', url: '/.well-known/jwks.json' });
    const { keys } = JSON.parse(res.body) as { keys: JWK[] };
    const publicKey = await importJWK(keys[0]!, 'RS256');

    const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
      issuer: 'celebbase-user-service',
    });
    expect(payload.sub).toBe('user-xyz');
    expect(protectedHeader.kid).toBe(kid);
  });

  it('kid is stable across calls within a process', async () => {
    const a = await getInternalSigningKey();
    const b = await getInternalSigningKey();
    expect(a.kid).toBe(b.kid);
  });
});
