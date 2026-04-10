import type pg from 'pg';
import type { User } from '@celebbase/shared-types';
import { NotFoundError, UnauthorizedError } from '@celebbase/service-core';
import * as userRepo from '../repositories/user.repository.js';

type UpdateableUserFields = {
  display_name?: string | undefined;
  avatar_url?: string | null | undefined;
  locale?: string | undefined;
  timezone?: string | undefined;
};

export async function getMe(pool: pg.Pool, userId: string): Promise<User> {
  const user = await userRepo.findById(pool, userId);
  if (!user) throw new NotFoundError('User not found');
  if (user.deleted_at !== null) throw new UnauthorizedError('Account has been deleted');
  return user;
}

export async function updateMe(
  pool: pg.Pool,
  userId: string,
  data: UpdateableUserFields,
): Promise<User> {
  await getMe(pool, userId); // ensure exists and not deleted
  return userRepo.updateUser(pool, userId, data);
}

export async function deleteMe(pool: pg.Pool, userId: string): Promise<void> {
  await getMe(pool, userId); // ensure exists
  await userRepo.softDelete(pool, userId);
}
