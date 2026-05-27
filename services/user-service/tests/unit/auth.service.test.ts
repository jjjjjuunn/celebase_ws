import { jest, describe, it, expect, afterEach } from '@jest/globals';
import type pg from 'pg';

const mockFindByEmail = jest.fn();
const mockFindByCognitoSub = jest.fn();
const mockFindAndUpdateCognitoSubByEmail = jest.fn();
const mockCreate = jest.fn();
const mockClearSoftDelete = jest.fn();

jest.unstable_mockModule('../../src/repositories/user.repository.js', () => ({
  findById: jest.fn(),
  findByEmail: mockFindByEmail,
  findByCognitoSub: mockFindByCognitoSub,
  findAndUpdateCognitoSubByEmail: mockFindAndUpdateCognitoSubByEmail,
  create: mockCreate,
  updateUser: jest.fn(),
  softDelete: jest.fn(),
  clearSoftDelete: mockClearSoftDelete,
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

const { signup, login, restore, DevAuthProvider } = await import('../../src/services/auth.service.js');
const { UnauthorizedError, ValidationError, AccountExistsError, AccountDeletedError, NotFoundError } =
  await import('@celebbase/service-core');

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

  it('fills the neutral default when display_name is omitted (IMPL-MOBILE-SIGNUP-DISPLAYNAME-001)', async () => {
    mockFindByEmail.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ ...baseUser, display_name: 'User' });

    const result = await signup(mockPool, devProvider, {
      email: 'noname@example.com',
    });

    expect(result.user.display_name).toBe('User');
    expect(mockCreate).toHaveBeenCalledWith(
      mockPool,
      expect.objectContaining({ display_name: 'User' }),
    );
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
    // IMPL-MOBILE-SIGNUP-DISPLAYNAME-001: the bridge returns the EXISTING user
    // unchanged — it must NOT overwrite their display_name with the input or the
    // 'User' default (bridge path bypasses userRepo.create entirely).
    expect(result.user.display_name).toBe('Test User');
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
    // IMPL-MOBILE-SOCIAL-SELECTION-001: an existing user is never flagged new.
    expect(result.is_new_user).toBe(false);
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

  it('throws AccountDeletedError (code ACCOUNT_DELETED) if user is soft-deleted', async () => {
    mockFindByEmail.mockResolvedValueOnce({ ...baseUser, deleted_at: new Date() });

    // IMPL-ACCOUNT-RESTORE-001: a soft-deleted login now yields the specific
    // ACCOUNT_DELETED code (was generic UNAUTHORIZED) so mobile can offer restore.
    await expect(
      login(
        mockPool,
        devProvider,
        { email: 'test@example.com' },
        makeMockLog(),
        'req-login-3',
      ),
    ).rejects.toThrow(AccountDeletedError);
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
      display_name: 'User',
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
    // IMPL-MOBILE-SIGNUP-DISPLAYNAME-001: lazy-provision uses the neutral default
    // 'User' (no longer the email local-part) — no email leak in the UI.
    expect(result.user.display_name).toBe('User');
    // IMPL-MOBILE-SOCIAL-SELECTION-001: a genuinely lazy-provisioned account is
    // the ONLY path that flags is_new_user=true (drives social-first Selection).
    expect(result.is_new_user).toBe(true);
    // Defense-in-depth: lazy-provisioned user must inherit the DB default
    // subscription_tier ('free'). Guards against future code accidentally
    // assigning a non-default tier in the lazy create payload.
    expect(result.user.subscription_tier).toBe('free');
    expect(mockCreate).toHaveBeenCalledWith(mockPool, {
      cognito_sub: 'cognito-real-sub',
      email: 'newuser@example.com',
      display_name: 'User',
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

  it('lazy-provision uses the neutral default display_name regardless of email', async () => {
    class EmptyLocalPartProvider {
      async verifyIdToken(): Promise<{ sub: string; email: string }> {
        // IMPL-MOBILE-SIGNUP-DISPLAYNAME-001: display_name is always the neutral
        // 'User' default now — the email (even a malformed one) never feeds it,
        // so no fragment of the address leaks into the UI.
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

    const result = await login(
      mockPool,
      new FakeCognitoProvider(),
      { email: 'newuser@example.com', id_token: 'fake.id.token' },
      makeMockLog(),
      'req-lazy-3',
    );

    expect(mockCreate).not.toHaveBeenCalled();
    // IMPL-MOBILE-SOCIAL-SELECTION-001: an email-bridged legacy user is attached
    // to a new cognito_sub but is NOT a new account — guards the branch adjacent
    // to lazy-provision from accidentally flipping isNewUser=true.
    expect(result.is_new_user).toBe(false);
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
    // IMPL-MOBILE-SOCIAL-SELECTION-001: a race re-read attaches to an existing
    // row → NOT new (create returned null, so isNewUser stayed false).
    expect(result.is_new_user).toBe(false);
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

  // IMPL-MOBILE-SOCIAL-001 — federated email collision → structured 409.
  // Scenario: user signed up with email/password (real cognito_sub "pw-sub"),
  // later taps "Continue with Google" → Cognito mints a NEW sub. Federation
  // does not auto-link, so the email collides on INSERT. We must return 409
  // ACCOUNT_EXISTS_WITH_DIFFERENT_PROVIDER, not 500 and not 401.
  it('throws AccountExistsError (409) when email belongs to a different cognito_sub', async () => {
    class GoogleProvider {
      async verifyIdToken(): Promise<{ sub: string; email: string }> {
        return Promise.resolve({ sub: 'google-new-sub', email: 'collision@example.com' });
      }
      async issueTokens(): Promise<{ access_token: string; refresh_token: string }> {
        return Promise.resolve({ access_token: 'a', refresh_token: 'r' });
      }
    }
    mockFindByCognitoSub.mockResolvedValueOnce(null); // initial lookup by new sub
    mockFindAndUpdateCognitoSubByEmail.mockResolvedValueOnce(null); // not a dev-seeded row
    mockCreate.mockResolvedValueOnce(null); // INSERT hits users.email UNIQUE
    mockFindByCognitoSub.mockResolvedValueOnce(null); // re-read by sub still null
    mockFindByEmail.mockResolvedValueOnce({
      ...baseUser,
      email: 'collision@example.com',
      cognito_sub: 'pw-sub', // incumbent owns the email with a different identity
    });
    const log = makeMockLog();

    await expect(
      login(
        mockPool,
        new GoogleProvider(),
        { email: 'collision@example.com', id_token: 'fake.id.token' },
        log,
        'req-collision-1',
      ),
    ).rejects.toThrow(AccountExistsError);

    // audit log must fire BEFORE the throw (security.md: emit-before-throw).
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth.account.provider_collision',
        requestId: 'req-collision-1',
      }),
      'auth.account.provider_collision',
    );
    // No tokens issued on a collision.
    expect(mockInsert).not.toHaveBeenCalled();
  });

  // IMPL-MOBILE-SOCIAL-NATIVE-001 — native Apple may withhold email on a
  // first-ever sign-in (user previously deleted the app without revoking it in
  // iOS settings). We must NOT insert a blank email (users.email NOT NULL
  // UNIQUE); fail closed with the actionable APPLE_EMAIL_REQUIRED guidance.
  it('throws ValidationError (APPLE_EMAIL_REQUIRED) on first social sign-in without email', async () => {
    class AppleNoEmailProvider {
      async verifyIdToken(): Promise<{ sub: string; email: string }> {
        return Promise.resolve({ sub: 'apple:001.no-email', email: '' });
      }
      async issueTokens(): Promise<{ access_token: string; refresh_token: string }> {
        return Promise.resolve({ access_token: 'a', refresh_token: 'r' });
      }
    }
    mockFindByCognitoSub.mockResolvedValueOnce(null); // no prior user by sub
    mockFindAndUpdateCognitoSubByEmail.mockResolvedValueOnce(null); // not a dev-seeded row

    await expect(
      login(
        mockPool,
        new AppleNoEmailProvider(),
        { id_token: 'fake.id.token' },
        makeMockLog(),
        'req-apple-no-email',
      ),
    ).rejects.toThrow(ValidationError);

    // Must fail before any INSERT — no blank-email user is attempted.
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
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

// IMPL-ACCOUNT-RESTORE-001 — within-grace account restore.
describe('authService.restore', () => {
  class FakeCognitoProvider {
    async verifyIdToken(): Promise<{ sub: string; email: string }> {
      return Promise.resolve({ sub: 'cognito-restore-sub', email: 'restore@example.com' });
    }
    async issueTokens(): Promise<{ access_token: string; refresh_token: string }> {
      return Promise.resolve({ access_token: 'a', refresh_token: 'r' });
    }
  }

  const deletedUser = {
    ...baseUser,
    id: 'restore-uuid-1',
    email: 'restore@example.com',
    cognito_sub: 'cognito-restore-sub',
    deleted_at: new Date(),
  };

  afterEach(() => {
    jest.clearAllMocks();
    mockInsert.mockResolvedValue(undefined);
  });

  it('restores a soft-deleted account (atomic clearSoftDelete) and emits auth.account.restored', async () => {
    mockFindByCognitoSub.mockResolvedValueOnce(deletedUser);
    mockClearSoftDelete.mockResolvedValueOnce({ ...deletedUser, deleted_at: null });
    const log = makeMockLog();

    const result = await restore(
      mockPool,
      new FakeCognitoProvider(),
      { id_token: 'fake.id.token' },
      log,
      'req-restore-1',
      { ip: '10.0.0.7', userAgent: 'jest' },
    );

    expect(result.user.deleted_at).toBeNull();
    expect(result.access_token).toBeTruthy();
    expect(mockClearSoftDelete).toHaveBeenCalledWith(mockPool, 'cognito-restore-sub');
    // SECURITY: restore must NOT elevate tier — the restored row keeps its tier.
    expect(result.user.subscription_tier).toBe('free');
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'auth.account.restored', requestId: 'req-restore-1', ip: '10.0.0.7' }),
      'auth.account.restored',
    );
  });

  it('is idempotent for an already-active account (no clearSoftDelete call)', async () => {
    mockFindByCognitoSub.mockResolvedValueOnce({ ...deletedUser, deleted_at: null });

    const result = await restore(
      mockPool,
      new FakeCognitoProvider(),
      { id_token: 'fake.id.token' },
      makeMockLog(),
      'req-restore-2',
    );

    expect(result.user.deleted_at).toBeNull();
    expect(result.access_token).toBeTruthy();
    expect(mockClearSoftDelete).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when no account exists for the verified identity', async () => {
    mockFindByCognitoSub.mockResolvedValueOnce(null);

    await expect(
      restore(mockPool, new FakeCognitoProvider(), { id_token: 'fake.id.token' }, makeMockLog(), 'req-restore-3'),
    ).rejects.toThrow(NotFoundError);
    expect(mockClearSoftDelete).not.toHaveBeenCalled();
  });

  it('Apple restore with NO email claim resolves by verified sub (email is never read)', async () => {
    // Apple omits email on re-sign-in (the verifier yields email=''); restore()
    // resolves the user by `sub` only, so this must succeed with zero email use.
    class AppleNoEmailProvider {
      async verifyIdToken(): Promise<{ sub: string; email: string }> {
        return Promise.resolve({ sub: 'apple-restore-sub', email: '' });
      }
      async issueTokens(): Promise<{ access_token: string; refresh_token: string }> {
        return Promise.resolve({ access_token: 'a', refresh_token: 'r' });
      }
    }
    const appleDeleted = { ...deletedUser, cognito_sub: 'apple-restore-sub' };
    mockFindByCognitoSub.mockResolvedValueOnce(appleDeleted);
    mockClearSoftDelete.mockResolvedValueOnce({ ...appleDeleted, deleted_at: null });

    const result = await restore(
      mockPool,
      new AppleNoEmailProvider(),
      { id_token: 'apple.jwt', provider: 'apple' },
      makeMockLog(),
      'req-restore-apple',
    );

    expect(result.user.deleted_at).toBeNull();
    expect(mockClearSoftDelete).toHaveBeenCalledWith(mockPool, 'apple-restore-sub');
  });

  it('throws ValidationError when id_token is missing', async () => {
    await expect(
      restore(mockPool, new FakeCognitoProvider(), {}, makeMockLog(), 'req-restore-4'),
    ).rejects.toThrow(ValidationError);
  });
});
