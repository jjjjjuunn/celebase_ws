import { jest, describe, it, expect } from '@jest/globals';
import type pg from 'pg';

const mockFindById = jest.fn();
const mockUpdateUser = jest.fn();
const mockSoftDelete = jest.fn();

jest.unstable_mockModule('../../src/repositories/user.repository.js', () => ({
  findById: mockFindById,
  findByEmail: jest.fn(),
  updateUser: mockUpdateUser,
  softDelete: mockSoftDelete,
}));

const { getMe, updateMe, deleteMe } = await import('../../src/services/user.service.js');
const { NotFoundError, UnauthorizedError } = await import('@celebbase/service-core');

const baseUser = {
  id: 'user-1',
  cognito_sub: 'cognito-1',
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

const mockPool = {} as pg.Pool;

describe('userService.getMe', () => {
  it('returns user when found and not deleted', async () => {
    mockFindById.mockResolvedValueOnce(baseUser);
    const result = await getMe(mockPool, 'user-1');
    expect(result).toEqual(baseUser);
  });

  it('throws NotFoundError when user does not exist', async () => {
    mockFindById.mockResolvedValueOnce(null);
    await expect(getMe(mockPool, 'user-1')).rejects.toThrow(NotFoundError);
  });

  it('throws UnauthorizedError when user is soft-deleted', async () => {
    mockFindById.mockResolvedValueOnce({ ...baseUser, deleted_at: new Date() });
    await expect(getMe(mockPool, 'user-1')).rejects.toThrow(UnauthorizedError);
  });
});

describe('userService.updateMe', () => {
  it('updates display_name and returns updated user', async () => {
    const updated = { ...baseUser, display_name: 'New Name' };
    mockFindById.mockResolvedValueOnce(baseUser);
    mockUpdateUser.mockResolvedValueOnce(updated);
    const result = await updateMe(mockPool, 'user-1', { display_name: 'New Name' });
    expect(result.display_name).toBe('New Name');
  });
});

describe('userService.deleteMe', () => {
  it('calls softDelete when user exists', async () => {
    mockFindById.mockResolvedValueOnce(baseUser);
    mockSoftDelete.mockResolvedValueOnce(undefined);
    await deleteMe(mockPool, 'user-1');
    expect(mockSoftDelete).toHaveBeenCalledWith(mockPool, 'user-1');
  });

  it('throws NotFoundError when user does not exist', async () => {
    mockFindById.mockResolvedValueOnce(null);
    await expect(deleteMe(mockPool, 'user-1')).rejects.toThrow(NotFoundError);
  });
});
