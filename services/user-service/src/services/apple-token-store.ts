// FEAT-APPLE-REVOKE-001 — store + revoke the user's Apple refresh_token.
//
// Both operations are BEST-EFFORT and NEVER throw: a token exchange must not
// break the login response, and a revoke failure must not strand the user
// undeleteable (an Apple outage shouldn't block account deletion). Every path
// is audited via emitAuthLog with an outcome enum (the App Store 4.8.1
// compliance signal). The authorization code / refresh token are never logged.

import type pg from 'pg';
import { encryptField, decryptField, type PhiKeyProvider } from '@celebbase/service-core';

import * as userRepo from '../repositories/user.repository.js';
import { emitAuthLog, hashId, type AuthLogger } from '../lib/auth-log.js';
import type { AppleOAuthClient } from './apple-oauth.js';

interface StoreArgs {
  pool: pg.Pool;
  userId: string;
  authorizationCode: string;
  appleOAuth: AppleOAuthClient;
  keyProvider: PhiKeyProvider;
  log: AuthLogger;
  requestId: string;
}

/**
 * Exchange the Apple authorization code for a refresh_token and persist it
 * encrypted. On any failure, the previously stored token is LEFT INTACT
 * (no-clobber) so a transient exchange failure on a later sign-in does not
 * destroy a still-revocable token.
 */
export async function storeAppleRefreshToken(args: StoreArgs): Promise<void> {
  const { pool, userId, authorizationCode, appleOAuth, keyProvider, log, requestId } = args;
  try {
    const refreshToken = await appleOAuth.exchangeAuthorizationCode(authorizationCode);
    const enc = await encryptField(keyProvider, userId, refreshToken);
    await userRepo.setAppleRefreshToken(pool, userId, enc);
    emitAuthLog(log, 'auth.apple.token_stored', {
      user_id_hash: hashId(userId),
      outcome: 'exchanged',
      requestId,
    });
  } catch {
    // Sanitized — AppleOAuthError already omits the code/secret; we add no detail.
    emitAuthLog(
      log,
      'auth.apple.token_stored',
      { user_id_hash: hashId(userId), outcome: 'exchange_failed', requestId },
      'warn',
    );
  }
}

interface RevokeArgs {
  pool: pg.Pool;
  userId: string;
  appleOAuth: AppleOAuthClient;
  keyProvider: PhiKeyProvider;
  log: AuthLogger;
  requestId: string;
}

/**
 * Revoke the stored Apple refresh_token at Apple (account deletion). No stored
 * token → audited 'no_token_stored' and returns. Any failure → audited
 * 'revoke_failed' and returns (deletion proceeds regardless).
 */
export async function revokeAppleRefreshToken(args: RevokeArgs): Promise<void> {
  const { pool, userId, appleOAuth, keyProvider, log, requestId } = args;
  try {
    const enc = await userRepo.getAppleRefreshToken(pool, userId);
    if (enc === null || enc === '') {
      emitAuthLog(log, 'auth.apple.token_revoked', {
        user_id_hash: hashId(userId),
        outcome: 'no_token_stored',
        requestId,
      });
      return;
    }
    const refreshToken = await decryptField(keyProvider, userId, enc);
    await appleOAuth.revokeRefreshToken(refreshToken);
    emitAuthLog(log, 'auth.apple.token_revoked', {
      user_id_hash: hashId(userId),
      outcome: 'revoked',
      requestId,
    });
  } catch {
    emitAuthLog(
      log,
      'auth.apple.token_revoked',
      { user_id_hash: hashId(userId), outcome: 'revoke_failed', requestId },
      'warn',
    );
  }
}
