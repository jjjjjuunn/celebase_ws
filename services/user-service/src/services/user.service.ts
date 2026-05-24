import type pg from 'pg';
import type { User, UserPreferencesPatch } from '@celebbase/shared-types';
import { NotFoundError, UnauthorizedError, type PhiKeyProvider } from '@celebbase/service-core';
import * as userRepo from '../repositories/user.repository.js';
import type { AuthLogger } from '../lib/auth-log.js';
import type { AppleOAuthClient } from './apple-oauth.js';
import { revokeAppleRefreshToken } from './apple-token-store.js';

// FEAT-APPLE-REVOKE-001 — optional deps so deleteMe can revoke the user's Apple
// token before soft-delete. Absent (or appleOAuth null) → revoke is skipped.
export interface AppleRevokeDeps {
  appleOAuth: AppleOAuthClient;
  keyProvider: PhiKeyProvider;
  log: AuthLogger;
  requestId: string;
}

type UpdateableUserFields = {
  display_name?: string | undefined;
  avatar_url?: string | null | undefined;
  locale?: string | undefined;
  timezone?: string | undefined;
  preferred_celebrity_slug?: string | null | undefined;
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

export async function deleteMe(
  pool: pg.Pool,
  userId: string,
  appleRevoke?: AppleRevokeDeps,
): Promise<void> {
  await getMe(pool, userId); // ensure exists
  // Revoke the Apple token (best-effort, audited) before soft-delete so an
  // Apple/SiwA user's token is invalidated per App Store 4.8.1. Never throws.
  if (appleRevoke) {
    await revokeAppleRefreshToken({ pool, userId, ...appleRevoke });
  }
  await userRepo.softDelete(pool, userId);
}

// Plan 22-vast-adleman · Phase C1 — merge-patch users.preferences.
export async function mergePreferences(
  pool: pg.Pool,
  userId: string,
  patch: UserPreferencesPatch,
): Promise<User> {
  await getMe(pool, userId); // ensure exists and not deleted
  return userRepo.mergePreferences(pool, userId, patch);
}
