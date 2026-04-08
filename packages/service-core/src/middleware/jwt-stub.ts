import type { FastifyInstance } from 'fastify';

/**
 * JWT auth stub — Phase 1-A에서는 구조만 잡고 실제 검증은 하지 않음.
 * NODE_ENV=production에서는 앱 기동을 차단하여 stub이 프로덕션에 배포되는 것을 방지.
 */
export function registerJwtStub(app: FastifyInstance): void {
  if (process.env['NODE_ENV'] === 'production') {
    app.log.fatal('JWT stub is not allowed in production. Configure real JWT verification.');
    process.exit(1);
  }

  app.log.warn('JWT authentication is running in STUB mode — not suitable for production');
}
