import { createApp, createPool, registerJwtAuth } from '@celebbase/service-core';
import { z } from 'zod';
import { celebrityRoutes } from './routes/celebrity.routes.js';
import { baseDietRoutes } from './routes/baseDiet.routes.js';
import { recipeRoutes } from './routes/recipe.routes.js';
import { lifestyleClaimRoutes } from './routes/lifestyle-claim.routes.js';
import { lifestyleClaimAdminRoutes } from './routes/admin/lifestyle-claim.admin.routes.js';
import { registerAdminAuth } from './middleware/admin-auth.js';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
});

const start = async (): Promise<void> => {
  const env = EnvSchema.parse(process.env);
  const pool = createPool(env.DATABASE_URL);
  const app = await createApp({ serviceName: 'content-service' });

  // /admin/* 는 user JWT 검증에서 제외 (admin 토큰 가드가 별도로 보호).
  // /celebrities* + /base-diets* 는 public catalog 읽기 — BFF (`/api/celebrities*`,
  // `/api/base-diets/:id`) 가 createPublicRoute (토큰 미forward) 로 호출하고,
  // meal-plan-engine 의 server-side content_client 도 토큰 없이 catalog 를 fetch 한다.
  // base_diets / recipes 는 celebrities 와 동일한 content-service catalog 테이블
  // (api-conventions.md 서비스 경계표) 이고 핸들러가 userId 를 쓰지 않는다.
  // FIX-STAGING-CATALOG-PUBLIC-001 이 /celebrities* 만 추가하고 /base-diets* 를
  // 누락 → JWKS/internal 모드 (staging) 에서 meal-plan 생성이 base-diets 401 로 실패.
  registerJwtAuth(app, {
    mode: 'internal',
    // Recipe reads are unauthenticated public catalog (like celebrities/base-diets):
    //   `/recipes`                  — batch by id
    //   `/recipes/:id`              — detail (mobile Recipe Detail; includes ingredients join)
    //   `/recipes/:id/personalized` — PII-free: computes allergen conflicts from the
    //                                 `allergies` query param only, no user identity.
    // The BFF recipe routes are public and can't mint an internal token, so
    // content-service must not require auth here. `/recipes/*` covers detail + personalized.
    publicPaths: ['/admin/*', '/celebrities', '/celebrities/*', '/base-diets', '/base-diets/*', '/recipes', '/recipes/*'],
  });
  registerAdminAuth(app);

  await app.register(celebrityRoutes, { pool });
  await app.register(baseDietRoutes, { pool });
  await app.register(recipeRoutes, { pool });
  await app.register(lifestyleClaimRoutes, { pool });
  await app.register(lifestyleClaimAdminRoutes, { pool });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (error: unknown) {
    app.log.error({ err: error }, 'Failed to start content-service');
    await pool.end();
    await app.close();
    process.exitCode = 1;
  }
};

void start();
