import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from 'jose';

export interface MockJwksHandle {
  /** Base URL (e.g. http://127.0.0.1:NNNN). */
  url: string;
  /** JWKS endpoint (`${url}/.well-known/jwks.json`). */
  jwksUri: string;
  /** Issuer claim to embed in id_tokens; callers should match this in CognitoAuthProvider config. */
  issuer: string;
  /** Audience (Cognito client id) used for tokens; callers should match this in CognitoAuthProvider config. */
  audience: string;
  /** Mint a signed RS256 id_token with Cognito-shaped claims. */
  mintIdToken: (opts?: MintOptions) => Promise<string>;
  /** Tear down the HTTP server. Always call in afterAll. */
  stop: () => Promise<void>;
}

export interface MintOptions {
  sub?: string;
  email?: string;
  token_use?: 'id' | 'access';
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  kid?: string;
}

export interface StartOptions {
  issuer?: string;
  audience?: string;
  kid?: string;
}

/**
 * Start an in-process HTTP server that serves a JWKS endpoint compatible with
 * AWS Cognito's `/.well-known/jwks.json` shape. Intended for user-service
 * CognitoAuthProvider unit + integration tests — never shipped to dist.
 */
export async function startMockJwksServer(
  opts: StartOptions = {},
): Promise<MockJwksHandle> {
  const kid = opts.kid ?? 'test-key-1';
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk: JWK = {
    ...(await exportJWK(publicKey)),
    kid,
    alg: 'RS256',
    use: 'sig',
  };

  const server: Server = createServer((req, res) => {
    if (req.url === '/.well-known/jwks.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${String(address.port)}`;
  const defaultIssuer = opts.issuer ?? `${baseUrl}/mock-pool`;
  const defaultAudience = opts.audience ?? 'mock-client-id';

  const mintIdToken = async (overrides: MintOptions = {}): Promise<string> => {
    const payload: Record<string, unknown> = {
      token_use: overrides.token_use ?? 'id',
      email: overrides.email ?? 'test@example.com',
    };
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: overrides.kid ?? kid })
      .setSubject(overrides.sub ?? 'cognito-sub-123')
      .setIssuer(overrides.issuer ?? defaultIssuer)
      .setAudience(overrides.audience ?? defaultAudience)
      .setIssuedAt(now)
      .setExpirationTime(overrides.expiresIn ?? '1h')
      .sign(privateKey as KeyLike);
  };

  return {
    url: baseUrl,
    jwksUri: `${baseUrl}/.well-known/jwks.json`,
    issuer: defaultIssuer,
    audience: defaultAudience,
    mintIdToken,
    stop: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
