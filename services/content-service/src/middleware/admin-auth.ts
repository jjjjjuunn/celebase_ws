import type { FastifyInstance, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { ForbiddenError, UnauthorizedError } from '@celebbase/service-core';

const ADMIN_PATH_PREFIX = '/admin/';

function isAdminPath(urlPath: string): boolean {
  return urlPath === '/admin' || urlPath.startsWith(ADMIN_PATH_PREFIX);
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function extractAdminToken(request: FastifyRequest): string | null {
  const headerVal = request.headers['x-admin-token'];
  if (typeof headerVal === 'string' && headerVal.length > 0) return headerVal;
  if (Array.isArray(headerVal) && headerVal[0]) return headerVal[0];
  return null;
}

/**
 * Admin moderation guard for `/admin/*` routes (spec §9.3 #5/#6, IMPL-021).
 *
 * Phase 1 단순 모델: `ADMIN_API_TOKEN` 환경변수 + `X-Admin-Token` 헤더.
 * - prod 에서 토큰 미설정 시 fatal exit (silent bypass 차단).
 * - dev 에서 미설정 시 stub 모드 (로그 경고 + 모든 admin 요청 허용).
 * - 검증은 `crypto.timingSafeEqual` 로 timing side-channel 차단.
 */
export function registerAdminAuth(app: FastifyInstance): void {
  const adminToken = process.env['ADMIN_API_TOKEN'];
  const nodeEnv = process.env['NODE_ENV'];

  // Unset NODE_ENV must NOT default to 'development' — that would re-open
  // the fail-open hole codex+gemini flagged in review-r2 (F4-bis).
  const isLocalDev = nodeEnv === 'development' || nodeEnv === 'test';

  if (!adminToken) {
    if (!isLocalDev) {
      app.log.fatal(
        { nodeEnv },
        'ADMIN_API_TOKEN must be set outside development/test for /admin/* routes',
      );
      process.exit(1);
    }
    app.log.warn('Admin auth running in STUB mode (ADMIN_API_TOKEN not set, dev/test only)');
    // eslint-disable-next-line @typescript-eslint/require-await
    app.addHook('onRequest', async (request: FastifyRequest) => {
      const urlPath = request.url.split('?')[0];
      if (urlPath !== undefined && isAdminPath(urlPath)) {
        (request as FastifyRequest & { adminAuth: { stub: boolean } }).adminAuth = { stub: true };
      }
    });
    return;
  }

  app.log.info('Admin auth enabled via ADMIN_API_TOKEN');

  // eslint-disable-next-line @typescript-eslint/require-await
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const urlPath = request.url.split('?')[0];
    if (urlPath === undefined || !isAdminPath(urlPath)) return;

    const provided = extractAdminToken(request);
    if (provided === null) {
      app.log.warn(
        { url: request.url, ip: request.ip, reason: 'missing_header' },
        'admin.auth.denied',
      );
      throw new UnauthorizedError('Missing X-Admin-Token header');
    }
    if (!safeEqual(provided, adminToken)) {
      app.log.warn(
        { url: request.url, ip: request.ip, reason: 'invalid_token' },
        'admin.auth.denied',
      );
      throw new ForbiddenError('Invalid admin token');
    }

    (request as FastifyRequest & { adminAuth: { stub: boolean } }).adminAuth = { stub: false };
  });
}
