import { jest, describe, it, expect, afterEach } from '@jest/globals';
import type pg from 'pg';

const mockFindByEmail = jest.fn();
const mockFindByCognitoSub = jest.fn();
const mockFindAndUpdateCognitoSubByEmail = jest.fn();
const mockCreate = jest.fn();

jest.unstable_mockModule('../../src/repositories/user.repository.js', () => ({
  findById: jest.fn(),
  findByEmail: mockFindByEmail,
  findByCognitoSub: mockFindByCognitoSub,
  findAndUpdateCognitoSubByEmail: mockFindAndUpdateCognitoSubByEmail,
  create: mockCreate,
  updateUser: jest.fn(),
  softDelete: jest.fn(),
}));

// Phase C: issueInternalTokens calls refreshTokenRepo.insert — mock it out
const mockInsert = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
jest.unstable_mockModule('../../src/repositories/refresh-token.repository.js', () => ({
  insert: mockInsert,
  revokeForRotation: jest.fn(),
  findMetadata: jest.fn(),
  revokeForLogout: jest.fn(),
  revokeChainForLogout: jest.fn(),
  revokeAllByUser: jest.fn(),
}));

const { signup, login, DevAuthProvider } = await import('../../src/services/auth.service.js');
const { UnauthorizedError, ValidationError } = await import('@celebbase/service-core');

const mockPool = {} as pg.Pool;
const devProvider = new DevAuthProvider();

// Capturing logger compatible with AuthLogger — pino-style (object first, msg second).
function makeMockLog(): {
  info: jest.Mock;
  warn: jest.Mock;
} {
  return { info: jest.fn(), warn: jest.fn() };
}

const baseUser = {
  id: 'user-uuid-1',
  cognito_sub: 'dev-fake-sub',
  email: 'test@example.com',
  display_name: 'Test User',
  avatar_url: null,
  subscription_tier: 'free' as const,
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
};

describe('authService.signup', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockInsert.mockResolvedValue(undefined);
  });

  it('creates a new user and returns tokens', async () => {
    mockFindByEmail.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(baseUser);

    const result = await signup(mockPool, devProvider, {
      email: 'test@example.com',
      display_name: 'Test User',
    });

    expect(result.user).toEqual(baseUser);
    expect(result.access_token).toBeTruthy();
    expect(result.refresh_token).toBeTruthy();
    expect(mockCreate).toHaveBeenCalledWith(mockPool, expect.objectContaining({
      email: 'test@example.com',
      display_name: 'Test User',
    }));
  });

  it('throws ValidationError if email already exists', async () => {
    mockFindByEmail.mockResolvedValueOnce(baseUser);

    await expect(
      signup(mockPool, devProvider, {
        email: 'test@example.com',
        display_name: 'Test User',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError on concurrent duplicate (create returns null)', async () => {
    mockFindByEmail.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(null);

    await expect(
      signup(mockPool, devProvider, {
        email: 'test@example.com',
        display_name: 'Test User',
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('authService.signup email-bridge', () => {
  class FakeCognitoProvider {
    async verifyIdToken(_idToken: string): Promise<{ sub: string; email: string }> {
      return Promise.resolve({ sub: 'cognito-real-sub', email: 'legacy@example.com' });
    }
    async issueTokens(): Promise<{ access_token: string; refresh_token: string }> {
      return Promise.resolve({ access_token: 'a', refresh_token: 'r' });
    }
  }

  afterEach(() => jest.clearAllMocks());

  it('merges a dev-seeded user on first Cognito signup via email-bridge', async () => {
    const legacyUser = { ...baseUser, email: 'legacy@example.com', cognito_sub: 'dev-legacy' };
    mockFindByEmail.mockResolvedValueOnce(legacyUser);
    mockFindAndUpdateCognitoSubByEmail.mockResolvedValueOnce({
      ...legacyUser,
      cognito_sub: 'cognito-real-sub',
    });

    const result = await signup(mockPool, new FakeCognitoProvider(), {
      email: 'legacy@example.com',
      display_name: 'Legacy User',
      id_token: 'fake.id.token',
    });

    expect(result.user.cognito_sub).toBe('cognito-real-sub');
    expect(mockFindAndUpdateCognitoSubByEmail).toHaveBeenCalledWith(
      mockPool, 'legacy@example.com', 'cognito-real-sub',
    );
  });

  it('rejects conflict when existing user already has a real cognito_sub', async () => {
    mockFindByEmail.mockResolvedValueOnce({
      ...baseUser,
      email: 'legacy@example.com',
      cognito_sub: 'cognito-already-set',
    });

    await expect(
      signup(mockPool, new FakeCognitoProvider(), {
        email: 'legacy@example.com',
        display_name: 'x',
        id_token: 'fake.id.token',
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('authService.login email-bridge', () => {
  class FakeCognitoProvider {
    async verifyIdToken(): Promise<{ sub: string; email: string }> {
      return Promise.resolve({ sub: 'cognito-real-sub', email: 'legacy@example.com' });
    }
    async issueTokens(): Promise<{ access_token: string; refresh_token: string }> {
      return Promise.resolve({ access_token: 'a', refresh_token: 'r' });
    }
  }

  afterEach(() => jest.clearAllMocks());

  it('falls back to email lookup when cognito_sub is unknown (legacy user)', async () => {
    mockFindByCognitoSub.mockResolvedValueOnce(null);
    mockFindAndUpdateCognitoSubByEmail.mockResolvedValueOnce({
      ...baseUser,
      email: 'legacy@example.com',
      cognito_sub: 'cognito-real-sub',
    });
    const log = makeMockLog();

    const result = await login(
      mockPool,
      new FakeCognitoProvider(),
      { email: 'legacy@example.com', id_token: 'fake.id.token' },
      log,
      'req-bridge-1',
    );

    expect(result.user.cognito_sub).toBe('cognito-real-sub');
    expect(mockFindAndUpdateCognitoSubByEmail).toHaveBeenCalledWith(
      mockPool, 'legacy@example.com', 'cognito-real-sub',
    );
    // IMPL-AUTH-LAZY-PROVISION-001: email-bridge emit must fire on success.
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth.email_bridge.applied',
        requestId: 'req-bridge-1',
      }),
      'auth.email_bridge.applied',
    );
  });
});

describe('authService.login', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockInsert.mockResolvedValue(undefined);
  });

  it('returns user and tokens for existing user', async () => {
    mockFindByEmail.mockResolvedValueOnce(baseUser);

    const result = await login(
      mockPool,
      devProvider,
      { email: 'test@example.com' },
      makeMockLog(),
      'req-login-1',
    );

    expect(result.user).toEqual(baseUser);
    expect(result.access_token).toBeTruthy();
    expect(result.refresh_token).toBeTruthy();
  });

  it('throws UnauthorizedError if user not found', async () => {
    mockFindByEmail.mockResolvedValueOnce(null);

    await expect(
      login(
        mockPool,
        devProvider,
        { email: 'nobody@example.com' },
        makeMockLog(),
        'req-login-2',
      ),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('throws UnauthorizedError if user is soft-deleted', async () => {
    mockFindByEmail.mockResolvedValueOnce({ ...baseUser, deleted_at: new Date() });

    await expect(
      login(
        mockPool,
        devProvider,
        { email: 'test@example.com' },
        makeMockLog(),
        'req-login-3',
      ),
    ).rejects.toThrow(UnauthorizedError);
  });
});

// IMPL-AUTH-LAZY-PROVISION-001 — recover from Cognito ↔ DB drift
describe('authService.login lazy provisioning', () => {
  class FakeCognitoProvider {
    async verifyIdToken(): Promise<{ sub: string; email: string }> {
      return Promise.resolve({ sub: 'cognito-real-sub', email: 'newuser@example.com' });
    }
    async issueTokens(): Promise<{ access_token: string; refresh_token: string }> {
      return Promise.resolve({ access_token: 'a', refresh_token: 'r' });
    }
  }

  afterEach(() => {
    jest.clearAllMocks();
    mockInsert.mockResolvedValue(undefined);
  });

  it('creates user and emits auth.user.lazy_provisioned when no cognito_sub or email match', async () => {
    mockFindByCognitoSub.mockResolvedValueOnce(null);
    mockFindAndUpdateCognitoSubByEmail.mockResolvedValueOnce(null);
    const lazyUser = {
      ...baseUser,
      id: 'lazy-uuid-1',
      email: 'newuser@example.com',
      cognito_sub: 'cognito-real-sub',
      display_name: 'newuser',
    };
    mockCreate.mockResolvedValueOnce(lazyUser);
    const log = makeMockLog();

    const result = await login(
      mockPool,
      new FakeCognitoProvider(),
      { email: 'newuser@example.com', id_token: 'fake.id.token' },
      log,
      'req-lazy-1',
    );

    expect(result.user.cognito_sub).toBe('cognito-real-sub');
    expect(result.user.display_name).toBe('newuser');
    // Defense-in-depth: lazy-provisioned user must inherit the DB default
    // subscription_tier ('free'). Guards against future code accidentally
    // assigning a non-default tier in the lazy create payload.
    expect(result.user.subscription_tier).toBe('free');
    expect(mockCreate).toHaveBeenCalledWith(mockPool, {
      cognito_sub: 'cognito-real-sub',
      email: 'newuser@example.com',
      display_name: 'newuser',
    });
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth.user.lazy_provisioned',
        reason: 'login_without_prior_signup',
        requestId: 'req-lazy-1',
      }),
      'auth.user.lazy_provisioned',
    );
  });

  it('falls back to "User" display_name when email local-part is empty', async () => {
    class EmptyLocalPartProvider {
      async verifyIdToken(): Promise<{ sub: string; email: string }> {
        // Defense-in-depth: DB VARCHAR(100) NOT NULL would block empty string,
        // but the code-level fallback ensures we never even attempt the INSERT
        // with '' for display_name.
        return Promise.resolve({ sub: 'sub-empty', email: '@malformed.example' });
      }
      async issueTokens(): Promise<{ access_token: string; refresh_token: string }> {
        return Promise.resolve({ access_token: 'a', refresh_token: 'r' });
      }
    }
    mockFindByCognitoSub.mockResolvedValueOnce(null);
    mockFindAndUpdateCognitoSubByEmail.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({
      ...baseUser,
      id: 'lazy-empty-1',
      email: '@malformed.example',
      cognito_sub: 'sub-empty',
      display_name: 'User',
    });

    await login(
      mockPool,
      new EmptyLocalPartProvider(),
      { email: '@malformed.example', id_token: 'fake.id.token' },
      makeMockLog(),
      'req-lazy-2',
    );

    expect(mockCreate).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({ display_name: 'User' }),
    );
  });

  it('does not trigger lazy provisioning when email-bridge succeeds', async () => {
    mockFindByCognitoSub.mockResolvedValueOnce(null);
    mockFindAndUpdateCognitoSubByEmail.mockResolvedValueOnce({
      ...baseUser,
      email: 'newuser@example.com',
      cognito_sub: 'cognito-real-sub',
    });

    await login(
      mockPool,
      new FakeCognitoProvider(),
      { email: 'newuser@example.com', id_token: 'fake.id.token' },
      makeMockLog(),
      'req-lazy-3',
    );

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('recovers from race when create returns null and re-read by sub succeeds', async () => {
    mockFindByCognitoSub.mockResolvedValueOnce(null);
    mockFindAndUpdateCognitoSubByEmail.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(null);
    const raceWinner = {
      ...baseUser,
      id: 'race-winner-1',
      email: 'newuser@example.com',
      cognito_sub: 'cognito-real-sub',
    };
    mockFindByCognitoSub.mockResolvedValueOnce(raceWinner);
    const log = makeMockLog();

    const result = await login(
      mockPool,
      new FakeCognitoProvider(),
      { email: 'newuser@example.com', id_token: 'fake.id.token' },
      log,
      'req-lazy-4',
    );

    expect(result.user.id).toBe('race-winner-1');
    // lazy_provisioned event should NOT fire — the row was created by the winning tx.
    expect(log.info).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.user.lazy_provisioned' }),
      expect.anything(),
    );
  });

  it('throws UnauthorizedError when create returns null and re-read also fails', async () => {
    mockFindByCognitoSub.mockResolvedValueOnce(null);
    mockFindAndUpdateCognitoSubByEmail.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce(null);
    mockFindByCognitoSub.mockResolvedValueOnce(null);

    await expect(
      login(
        mockPool,
        new FakeCognitoProvider(),
        { email: 'newuser@example.com', id_token: 'fake.id.token' },
        makeMockLog(),
        'req-lazy-5',
      ),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('regression: existing cognito_sub match does NOT trigger lazy provisioning', async () => {
    mockFindByCognitoSub.mockResolvedValueOnce({
      ...baseUser,
      cognito_sub: 'cognito-real-sub',
    });

    await login(
      mockPool,
      new FakeCognitoProvider(),
      { email: 'newuser@example.com', id_token: 'fake.id.token' },
      makeMockLog(),
      'req-lazy-6',
    );

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockFindAndUpdateCognitoSubByEmail).not.toHaveBeenCalled();
  });
});

describe('DevAuthProvider', () => {
  afterEach(() => {
    mockInsert.mockResolvedValue(undefined);
  });

  it('issues tokens with sub claim matching userId', async () => {
    const tokens = await devProvider.issueTokens(mockPool, {
      sub: 'user-123',
      email: 'dev@example.com',
      cognito_sub: 'dev-fake',
    });

    const parts = tokens.access_token.split('.');
    const payload = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString(),
    ) as { sub: string; token_use: string };
    expect(payload.sub).toBe('user-123');
    expect(payload.token_use).toBe('access');
  });

  it('issues refresh tokens with token_use=refresh', async () => {
    const tokens = await devProvider.issueTokens(mockPool, {
      sub: 'user-123',
      email: 'dev@example.com',
      cognito_sub: 'dev-fake',
    });

    const parts = tokens.refresh_token.split('.');
    const payload = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString(),
    ) as { sub: string; token_use: string };
    expect(payload.sub).toBe('user-123');
    expect(payload.token_use).toBe('refresh');
  });

  it('refresh tokens contain jti claim (Phase C)', async () => {
    const tokens = await devProvider.issueTokens(mockPool, {
      sub: 'user-123',
      email: 'dev@example.com',
      cognito_sub: 'dev-fake',
    });

    const parts = tokens.refresh_token.split('.');
    const payload = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString(),
    ) as { jti?: string };
    expect(typeof payload.jti).toBe('string');
    expect(payload.jti!.length).toBeGreaterThan(0);
  });

  it('access tokens have 15m TTL (Phase C)', async () => {
    const tokens = await devProvider.issueTokens(mockPool, {
      sub: 'user-123',
      email: 'dev@example.com',
      cognito_sub: 'dev-fake',
    });

    const parts = tokens.access_token.split('.');
    const payload = JSON.parse(
      Buffer.from(parts[1]!, 'base64url').toString(),
    ) as { exp: number; iat: number };
    const ttl = payload.exp - payload.iat;
    expect(ttl).toBeLessThanOrEqual(15 * 60 + 5);
    expect(ttl).toBeGreaterThan(0);
  });
});

describe('loadDevSecret', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses default secret in non-production', async () => {
    const { loadDevSecret } = await import('../../src/services/auth.service.js');
    const secret = loadDevSecret();
    expect(secret).toBeInstanceOf(Uint8Array);
    expect(secret.length).toBeGreaterThan(0);
  });
});
