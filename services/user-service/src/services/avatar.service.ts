// Avatar upload presigner (FEAT-PROFILE-EDIT). Issues a short-lived presigned
// S3 PUT URL so the client uploads image bytes directly to S3, then persists
// the resulting public URL via PATCH /users/me { avatar_url }.
//
// Security posture (CLAUDE.md §2): content type is allowlisted (request schema),
// the object key is namespaced per user (avatars/{user_id}/…), and the URL is
// short-lived. `max_bytes` is a CLIENT-side guard only — a presigned PUT cannot
// enforce size server-side (would require a presigned POST with policy
// conditions; tracked as a follow-up). The signed ContentType binds the upload
// to the declared type, so the client must send a matching Content-Type header.

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { uuidv7 } from 'uuidv7';
import type { schemas } from '@celebbase/shared-types';

const EXT_BY_CONTENT_TYPE: Record<schemas.AvatarContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface AvatarUploaderConfig {
  bucket: string;
  region: string;
  /** Public base URL for GETs (e.g. CDN or `https://{bucket}.s3.{region}.amazonaws.com`). */
  publicBaseUrl: string;
  maxBytes: number;
  ttlSeconds: number;
}

export interface AvatarUploader {
  presignUpload(
    userId: string,
    contentType: schemas.AvatarContentType,
  ): Promise<schemas.AvatarUploadUrlResponse>;
}

/**
 * Build an avatar uploader. `deps` is injectable so unit tests can stub the S3
 * presigner without network/credentials.
 */
export function createAvatarUploader(
  config: AvatarUploaderConfig,
  deps?: {
    s3?: S3Client;
    sign?: typeof getSignedUrl;
  },
): AvatarUploader {
  const s3 = deps?.s3 ?? new S3Client({ region: config.region });
  const sign = deps?.sign ?? getSignedUrl;
  // Normalize a trailing slash so `${base}/${key}` never doubles up.
  const base = config.publicBaseUrl.replace(/\/+$/, '');

  return {
    async presignUpload(userId, contentType) {
      const ext = EXT_BY_CONTENT_TYPE[contentType];
      const key = `avatars/${userId}/${uuidv7()}.${ext}`;
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ContentType: contentType,
      });
      const uploadUrl = await sign(s3, command, { expiresIn: config.ttlSeconds });
      return {
        upload_url: uploadUrl,
        public_url: `${base}/${key}`,
        key,
        expires_in: config.ttlSeconds,
        max_bytes: config.maxBytes,
      };
    },
  };
}
