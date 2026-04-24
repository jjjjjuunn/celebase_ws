// Sprint A users wire schemas (IMPL-APP-001a-2).
//
// Wire shape: entities.User with Date → IsoDateTime. `satisfies` compile-time
// assertion at the bottom guards against field-name / optionality drift.

import { z } from 'zod';
import { SubscriptionTier } from '../enums.js';
import type { User } from '../entities.js';
import { IsoDateTime, UuidV7 } from './_utils.js';
import { AuthTokensSchema } from './auth.js';

export const UserWireSchema = z.object({
  id: UuidV7,
  cognito_sub: z.string().min(1),
  email: z.string().email(),
  display_name: z.string(),
  avatar_url: z.string().url().nullable(),
  subscription_tier: SubscriptionTier,
  locale: z.string(),
  timezone: z.string(),
  preferred_celebrity_slug: z.string().min(1).max(100).nullable(),
  created_at: IsoDateTime,
  updated_at: IsoDateTime,
  deleted_at: IsoDateTime.nullable(),
});
export type UserWire = z.infer<typeof UserWireSchema>;

export const MeResponseSchema = z.object({
  user: UserWireSchema,
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const UpdateMeRequestSchema = z
  .object({
    display_name: z.string().min(1).max(100).optional(),
    avatar_url: z.string().url().nullable().optional(),
    locale: z.string().min(2).max(10).optional(),
    timezone: z.string().min(1).max(64).optional(),
    preferred_celebrity_slug: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9][a-z0-9-]*$/)
      .nullable()
      .optional(),
  })
  .strict();
export type UpdateMeRequest = z.infer<typeof UpdateMeRequestSchema>;

// Auth flow response envelopes that wrap UserWire + AuthTokens.
// Split from `auth.ts` so `auth.ts` doesn't import `users.ts` (avoids forward cycle).
export const SignupResponseSchema = AuthTokensSchema.extend({
  user: UserWireSchema,
});
export type SignupResponse = z.infer<typeof SignupResponseSchema>;

export const LoginResponseSchema = SignupResponseSchema;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// Wire↔Row parity guard (D1): typecheck fails if `entities.User` drifts.
// `satisfies` is a value-level operator, so we cast a phantom value through
// `UserWire` and check it against the row-flavored shape. Dates are
// intentionally `string` on the wire (consumers coerce at the call site).
const _userWireRowParity = null as unknown as UserWire satisfies {
  id: User['id'];
  cognito_sub: User['cognito_sub'];
  email: User['email'];
  display_name: User['display_name'];
  avatar_url: User['avatar_url'];
  subscription_tier: User['subscription_tier'];
  locale: User['locale'];
  timezone: User['timezone'];
  preferred_celebrity_slug: User['preferred_celebrity_slug'];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
void _userWireRowParity;
