import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { AppError, ValidationError, type PhiKeyProvider } from '@celebbase/service-core';
import { UserPreferencesPatchSchema, schemas } from '@celebbase/shared-types';
import * as userService from '../services/user.service.js';
import type { AppleOAuthClient } from '../services/apple-oauth.js';
import type { AvatarUploader } from '../services/avatar.service.js';
import { hashId } from '../lib/auth-log.js';

const UpdateMeSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  avatar_url: z.string().url().optional(),
  locale: z.string().max(10).optional(),
  timezone: z.string().max(50).optional(),
  // Plan 20-vast-adleman · Phase C-0 — persona-first onboarding selection.
  // Validated as slug shape only; existence is checked at onboarding time by
  // the BFF against content-service (Rule #10 no cross-service FK).
  preferred_celebrity_slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .nullable()
    .optional(),
}).strict();

// eslint-disable-next-line @typescript-eslint/require-await
export async function userRoutes(
  app: FastifyInstance,
  options: {
    pool: pg.Pool;
    // FEAT-APPLE-REVOKE-001 — when both present, DELETE /users/me revokes the
    // user's Apple token. Absent (unconfigured) → revoke skipped (soft-delete only).
    appleOAuth?: AppleOAuthClient | null;
    phiKeyProvider?: PhiKeyProvider;
    // FEAT-PROFILE-EDIT — present only when AVATARS_BUCKET is configured (index.ts).
    // Absent → the avatar upload-url route fails closed with 503.
    avatarUploader?: AvatarUploader | null;
  },
): Promise<void> {
  const { pool, appleOAuth, phiKeyProvider, avatarUploader } = options;

  app.get('/users/me', async (request: FastifyRequest) => {
    return userService.getMe(pool, request.userId);
  });

  app.patch('/users/me', async (request: FastifyRequest) => {
    const parsed = UpdateMeSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    return userService.updateMe(pool, request.userId, parsed.data);
  });

  // FEAT-PROFILE-EDIT — issue a presigned S3 PUT URL for the avatar image. The
  // client uploads bytes directly to S3 then PATCHes /users/me { avatar_url }.
  // Fails closed (503) when avatar uploads are not configured for this env.
  app.post('/users/me/avatar/upload-url', async (request: FastifyRequest) => {
    if (!avatarUploader) {
      throw new AppError(
        'Avatar uploads are not configured',
        503,
        'AVATAR_UPLOAD_NOT_CONFIGURED',
      );
    }
    const parsed = schemas.AvatarUploadUrlRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid input',
        parsed.error.errors.map((e) => ({ field: e.path.join('.'), issue: e.message })),
      );
    }
    return avatarUploader.presignUpload(request.userId, parsed.data.content_type);
  });

  app.delete('/users/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const appleRevoke =
      appleOAuth && phiKeyProvider
        ? { appleOAuth, keyProvider: phiKeyProvider, log: request.log, requestId: request.id }
        : undefined;
    await userService.deleteMe(pool, request.userId, appleRevoke);
    return reply.status(204).send();
  });

  // Plan 22-vast-adleman · Phase C1 — RFC 7396 merge-patch on users.preferences.
  // `.strict()` on the schema rejects unknown top-level keys so clients cannot
  // write to undeclared paths until shared-types is updated.
  app.patch('/users/me/preferences', async (request: FastifyRequest) => {
    const parsed = UserPreferencesPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid preferences payload',
        parsed.error.errors.map((e: z.ZodIssue) => ({
          field: e.path.join('.'),
          issue: e.message,
        })),
      );
    }
    const updated = await userService.mergePreferences(pool, request.userId, parsed.data);
    request.log.info(
      {
        event: 'user.preferences.updated',
        user_id_hash: hashId(request.userId),
        keys: Object.keys(parsed.data),
      },
      'user.preferences.updated',
    );
    return updated;
  });
}
