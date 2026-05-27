// IMPL-ACCOUNT-RESTORE-001 (3b-mobile) — thrown by the auth services when the BFF
// reports a soft-deleted account (code ACCOUNT_DELETED) during login. Carries the
// VERIFIED id_token + provider already obtained at the 401, so the screen can offer
// in-place account restore (POST /api/auth/mobile/restore) WITHOUT re-running the
// Cognito SRP / native OAuth dance.
//
// Lives in lib/ (not services/auth.ts) so services/social-auth.ts can throw it
// without importing the heavy aws-amplify barrel (social-auth deliberately avoids
// Amplify — see its header).

import type { schemas } from '@celebbase/shared-types';

export class AccountDeletedError extends Error {
  readonly idToken: string;
  /** 'cognito' for email login; 'apple' / 'google' for native social. */
  readonly provider: schemas.AuthProviderKind | undefined;

  constructor(idToken: string, provider?: schemas.AuthProviderKind) {
    super('Account has been deleted');
    this.name = 'AccountDeletedError';
    this.idToken = idToken;
    this.provider = provider;
  }
}
