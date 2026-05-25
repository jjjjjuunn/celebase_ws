// User self read/update — Profile 화면, Settings 의 email 표시, 프로필 편집 등에서 사용.

import { schemas } from '@celebbase/shared-types';

import { authedFetch } from '../lib/fetch-with-refresh';

/**
 * GET /api/users/me — 현재 로그인 사용자의 user record.
 *
 * @throws ApiError BFF 4xx/5xx
 */
export async function getCurrentUser(): Promise<schemas.MeResponse> {
  const raw = await authedFetch<unknown>('/api/users/me');
  return schemas.MeResponseSchema.parse(raw);
}

/**
 * DELETE /api/users/me — 계정 삭제 (Apple Guideline 5.1.1(v) in-app 경로).
 *
 * user-service 가 `deleted_at` soft-delete → 이후 로그인/refresh 차단. PHI 파기
 * 배치는 별도 백엔드 처리 (security.md §계정 삭제). BFF 는 204 (no body) 반환 —
 * authedFetch 는 빈 본문을 null 로 통과시키므로 별도 파싱 없이 성공 = void.
 *
 * @throws ApiError BFF 4xx/5xx (호출자가 명시적으로 처리, silent ignore 금지)
 */
export async function deleteAccount(): Promise<void> {
  await authedFetch<unknown>('/api/users/me', { method: 'DELETE' });
}

/**
 * PATCH /api/users/me — merge-update the current user's profile fields
 * (display_name, avatar_url, …). Returns the refreshed user record.
 *
 * @throws ApiError BFF 4xx/5xx
 */
export async function updateMe(
  patch: schemas.UpdateMeRequest,
): Promise<schemas.MeResponse> {
  const raw = await authedFetch<unknown>('/api/users/me', { method: 'PATCH', body: patch });
  return schemas.MeResponseSchema.parse(raw);
}

/**
 * POST /api/users/me/avatar/upload-url — request a short-lived presigned S3 PUT
 * URL for the avatar image. The caller then PUTs the bytes (uploadAvatarFile)
 * and persists `public_url` via updateMe({ avatar_url }).
 *
 * @throws ApiError BFF 4xx/5xx (503 AVATAR_UPLOAD_NOT_CONFIGURED when the
 *   backend has no avatars bucket configured)
 */
export async function requestAvatarUploadUrl(
  contentType: schemas.AvatarContentType,
): Promise<schemas.AvatarUploadUrlResponse> {
  const raw = await authedFetch<unknown>('/api/users/me/avatar/upload-url', {
    method: 'POST',
    body: { content_type: contentType },
  });
  return schemas.AvatarUploadUrlResponseSchema.parse(raw);
}

/**
 * Upload the local image file to the presigned S3 URL via a direct PUT. This is
 * NOT a BFF call — it goes straight to S3 with no auth header. The Content-Type
 * MUST match the type the URL was signed for, or S3 rejects the signature.
 *
 * @throws Error on a non-2xx S3 response (caller surfaces a friendly message)
 */
export async function uploadAvatarFile(
  uploadUrl: string,
  fileUri: string,
  contentType: schemas.AvatarContentType,
): Promise<void> {
  // RN fetch can read a local file:// URI into a Blob, then PUT the bytes.
  const fileResponse = await fetch(fileUri);
  const blob = await fileResponse.blob();
  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!putResponse.ok) {
    throw new Error(`Avatar upload failed: ${String(putResponse.status)}`);
  }
}
