// IMPL-ACCOUNT-RESTORE-001 (3b-mobile) — clear a within-grace soft-delete by
// POSTing the already-verified id_token to the BFF restore route, then persist the
// returned internal tokens. No aws-amplify import: the caller already obtained the
// id_token (at the ACCOUNT_DELETED 401), so we never re-run Cognito/OAuth here.

import type { schemas } from '@celebbase/shared-types';

import { postJson } from './api-client';
import { setTokens } from './secure-store';
import { signalLogin } from './auth-events';

export async function restoreAccount(
  idToken: string,
  provider?: schemas.AuthProviderKind,
): Promise<schemas.RestoreResponse> {
  const body: schemas.RestoreRequest = {
    id_token: idToken,
    ...(provider !== undefined ? { provider } : {}),
  };
  const res = await postJson<schemas.RestoreResponse>('/api/auth/mobile/restore', body);
  if (res.access_token === '' || res.refresh_token === '') {
    throw new Error('[restore] BFF 응답에 빈 토큰 — 서버 측 계약 위반.');
  }
  await setTokens({ access_token: res.access_token, refresh_token: res.refresh_token });
  // A restored account is a RETURNING user → 'manual' (no first-login Selection).
  signalLogin('manual');
  return res;
}
