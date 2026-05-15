import { createHash } from 'node:crypto';

// Structured auth event logger (IMPL-010-e).
//
// Emits pino-compatible JSON lines with `event: '<name>'`. Pino redaction
// configured in `@celebbase/service-core/logger.ts` already strips
// `*.access_token`, `*.refresh_token`, `*.password`, etc., but per
// Absolute Rule #8 the call sites here must ALSO avoid raw tokens and raw
// emails — use the hashId helper to emit short sha256 prefixes only.

/** SHA-256 prefix (first 8 hex chars). Used for log-only identifiers. */
export function hashId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

/** Minimal structural shape for pino / FastifyBaseLogger. */
export interface AuthLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
}

export interface CognitoVerifyFields {
  result: 'ok' | 'fail';
  reason?: string;
  latency_ms: number;
  requestId: string;
  cognito_sub_hash?: string;
  email_hash?: string;
}

export interface InternalTokenIssuedFields {
  flow: 'login' | 'signup' | 'refresh';
  requestId: string;
}

export interface EmailBridgeFields {
  cognito_sub_hash: string;
  email_hash: string;
  requestId: string;
}

export interface LogoutFields {
  user_id_hash: string;
  requestId: string;
  jti_hash?: string;
  chain_len?: number;
}

export interface RefreshRotatedFields {
  user_id_hash: string;
  old_jti_hash: string;
  new_jti_hash: string;
}

export interface RefreshExpiredOrMissingFields {
  user_id_hash: string;
  requestId: string;
}

export interface TokenReuseDetectedFields {
  user_id_hash: string;
  jti_hash: string;
  original_revoked_reason: string | null;
  requestId: string;
}

// IMPL-AUTH-LAZY-PROVISION-001 — emitted when /auth/login finds neither a
// cognito_sub match nor a dev-seeded email-bridge candidate and falls through
// to auto-create the user row from the JWKS-verified Cognito payload. The
// `reason` enum captures the trigger so future paths (e.g. recovery flows)
// can be distinguished from the initial signup-without-prior-signup case.
export interface LazyProvisionedFields {
  user_id_hash: string;
  cognito_sub_hash: string;
  email_hash: string;
  reason: 'login_without_prior_signup';
  requestId: string;
}

export interface AuthLogFieldMap {
  'auth.cognito.verify': CognitoVerifyFields;
  'auth.internal_token.issued': InternalTokenIssuedFields;
  'auth.email_bridge.applied': EmailBridgeFields;
  'auth.user.lazy_provisioned': LazyProvisionedFields;
  'auth.logout': LogoutFields;
  'auth.refresh.rotated': RefreshRotatedFields;
  'auth.refresh.expired_or_missing': RefreshExpiredOrMissingFields;
  'auth.token.reuse_detected': TokenReuseDetectedFields;
}

export type AuthLogEventName = keyof AuthLogFieldMap;

export function emitAuthLog<E extends AuthLogEventName>(
  logger: AuthLogger,
  event: E,
  fields: AuthLogFieldMap[E],
  level: 'info' | 'warn' = 'info',
): void {
  logger[level]({ event, ...fields }, event);
}
