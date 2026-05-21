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

/**
 * Sign-in source. Absent / 'cognito' = email+password (Cognito SRP) or web —
 * the BE selects the CognitoAuthProvider. 'apple' / 'google' = native social
 * sign-in (expo-apple-authentication / @react-native-google-signin); the BE
 * dispatches to the matching provider's verifier (per-provider JWKS + strict
 * iss/aud). The discriminator is client-supplied but NOT trusted for identity —
 * each provider's verifyIdToken fails closed on iss/aud/exp, so a forged
 * `provider` only selects which strict verifier rejects the token.
 * (IMPL-MOBILE-SOCIAL-NATIVE-001.)
 */
export const AuthProviderKindSchema = z.enum(['cognito', 'apple', 'google']);
export type AuthProviderKind = z.infer<typeof AuthProviderKindSchema>;

export const LoginRequestSchema = z.object({
  // Optional: only the email+password (dev/Cognito) path supplies it as a hint.
  // For id_token flows the verified token's email claim is authoritative, and
  // native Apple re-sign-in may omit email entirely (resolved server-side by
  // looking the user up by provider sub).
  email: z.string().email().max(255).optional(),
  id_token: z.string().optional(),
  provider: AuthProviderKindSchema.optional(),
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
