import { jest, describe, it, expect } from '@jest/globals';
import type pg from 'pg';

const mockFindByEmail = jest.fn();
const mockFindByCognitoSub = jest.fn();
const mockCreate = jest.fn();

jest.unstable_mockModule('../../src/repositories/user.repository.js', () => ({
  findById: jest.fn(),
  findByEmail: mockFindByEmail,
  findByCognitoSub: mockFindByCognitoSub,
  create: mockCreate,
  updateUser: jest.fn(),
  softDelete: jest.fn(),
}));

const { signup, login, refresh, DevAuthProvider } = await import('../../src/services/auth.service.js');
const { UnauthorizedError, ValidationError } = await import('@celebbase/service-core');

const mockPool = {} as pg.Pool;
const devProvider = new DevAuthProvider();

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
});

describe('authService.login', () => {
  it('returns user and tokens for existing user', async () => {
    mockFindByEmail.mockResolvedValueOnce(baseUser);

    const result = await login(mockPool, devProvider, {
      email: 'test@example.com',
    });

    expect(result.user).toEqual(baseUser);
    expect(result.access_token).toBeTruthy();
    expect(result.refresh_token).toBeTruthy();
  });

  it('throws UnauthorizedError if user not found', async () => {
    mockFindByEmail.mockResolvedValueOnce(null);

    await expect(
      login(mockPool, devProvider, { email: 'nobody@example.com' }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('throws UnauthorizedError if user is soft-deleted', async () => {
    mockFindByEmail.mockResolvedValueOnce({ ...baseUser, deleted_at: new Date() });

    await expect(
      login(mockPool, devProvider, { email: 'test@example.com' }),
    ).rejects.toThrow(UnauthorizedError);
  });
});

describe('authService.refresh', () => {
  it('returns new tokens from a valid refresh token', async () => {
    // First get a token to use as refresh
    mockFindByEmail.mockResolvedValueOnce(baseUser);
    const loginResult = await login(mockPool, devProvider, { email: 'test@example.com' });

    const result = await refresh(devProvider, loginResult.refresh_token);

    expect(result.access_token).toBeTruthy();
    expect(result.refresh_token).toBeTruthy();

    // Decode to verify sub claim is preserved
    const parts = result.access_token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()) as { sub: string };
    expect(payload.sub).toBe(baseUser.id);
  });
});

describe('DevAuthProvider', () => {
  it('issues tokens with sub claim matching userId', async () => {
    const tokens = await devProvider.issueTokens('user-123');

    // Decode access token payload
    const parts = tokens.access_token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()) as { sub: string };
    expect(payload.sub).toBe('user-123');
  });
});
