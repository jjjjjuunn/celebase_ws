// Internal token RS256 signing key (CHORE-AUTH-ASYMMETRIC-SIGNING-001, Phase 1).
//
// user-service becomes the issuer-of-record for internal access/refresh tokens:
// it signs with an RS256 private key and publishes the matching public key via
// GET /.well-known/jwks.json so every BE service + the BFF can verify without a
// shared secret. This is the single source for the key pair — both the JWKS
// route (public key) and auth.service.ts signing (private key, Phase 2) load it
// here.
//
// Migration phasing (phased dual-verify):
//   Phase 1 (this): expose JWKS endpoint + key infra. Signing stays HS256.
//   Phase 2: auth.service.ts switches signing to RS256 (kid in header).
//   Phase 3: drop the HS256 fallback after the 30d refresh TTL elapses.
import { generateKeyPair, importPKCS8, exportJWK, calculateJwkThumbprint } from 'jose';
import type { CryptoKey, JWK } from 'jose';

const ALG = 'RS256';

export interface InternalSigningKey {
  /** Private key for signing (Phase 2). */
  readonly privateKey: CryptoKey;
  /** Public JWK published via the JWKS endpoint (kid + alg + use included). */
  readonly publicJwk: JWK;
  /** Stable key id (RFC 7638 thumbprint) — set as the JWT header `kid`. */
  readonly kid: string;
}

let cached: Promise<InternalSigningKey> | null = null;

async function buildKey(): Promise<InternalSigningKey> {
  const pem = process.env['INTERNAL_JWT_PRIVATE_KEY'];
  let privateKey: CryptoKey;

  if (pem !== undefined && pem !== '') {
    // Env stores the PEM with literal "\n" escapes (single-line .env value).
    const normalized = pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
    privateKey = await importPKCS8(normalized, ALG, { extractable: true });
  } else {
    const nodeEnv = process.env['NODE_ENV'] ?? 'development';
    if (nodeEnv === 'production') {
      throw new Error(
        'INTERNAL_JWT_PRIVATE_KEY must be set in production for RS256 internal token signing',
      );
    }
    // Ephemeral key for local dev / tests — regenerated each boot. Tokens signed
    // with it verify against the same process's JWKS endpoint only.
    const pair = await generateKeyPair(ALG, { extractable: true });
    privateKey = pair.privateKey;
  }

  // Derive the public JWK from the private key, stripping private components.
  const fullJwk = await exportJWK(privateKey);
  const { kty, n, e } = fullJwk;
  if (kty !== 'RSA' || typeof n !== 'string' || typeof e !== 'string') {
    throw new Error('Unexpected JWK shape — expected an RSA public key (kty/n/e)');
  }
  const publicComponents: JWK = { kty, n, e };
  const kid = await calculateJwkThumbprint(publicComponents);

  return {
    privateKey,
    publicJwk: { ...publicComponents, alg: ALG, use: 'sig', kid },
    kid,
  };
}

/** Loads (and caches) the internal RS256 signing key for this process. */
export function getInternalSigningKey(): Promise<InternalSigningKey> {
  if (cached === null) {
    cached = buildKey();
  }
  return cached;
}

/** Test-only: reset the cached key so a different env can be exercised. */
export function resetInternalSigningKeyForTest(): void {
  cached = null;
}
