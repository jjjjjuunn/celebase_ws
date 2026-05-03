// Sprint A auth wire schemas (IMPL-APP-001a-1).
//
// Mirrors `services/user-service/src/routes/auth.routes.ts` request shapes and
// `services/user-service/src/services/auth.service.ts` response shapes.
// SignupResponse / LoginResponse wrappers live in `./users.ts` so they can compose
// `UserWireSchema` — avoids a forward-ref cycle.

import { z } from 'zod';

export const SignupRequestSchema = z.object({
  email: z.string().email().max(255),
  display_name: z.string().min(1).max(100),
  id_token: z.string().optional(),
});
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email().max(255),
  id_token: z.string().optional(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RefreshRequestSchema = z.object({
  refresh_token: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

/**
 * Tokens returned on signup / login / refresh. Rotation policy: both `access_token`
 * and `refresh_token` are re-issued on every refresh (see `auth.service.ts:77`).
 */
export const AuthTokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
});
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

export const RefreshResponseSchema = AuthTokensSchema;
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

// Phase B /auth/logout — stateless. Body is accepted but empty is fine; server
// performs no revocation (no refresh_tokens table). Schema exists as a client
// contract and to forward-declare the Phase C shape when jti-blacklist lands.
export const LogoutRequestSchema = z.object({
  refresh_token: z.string().optional(),
});
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

// 204 No Content — the response carries no body. The schema exists to document
// the contract (clients must not expect fields) and remain future-proof.
export const LogoutResponseSchema = z.object({}).strict();
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;
