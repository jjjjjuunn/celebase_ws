import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { AppError, NotFoundError, ValidationError } from '@celebbase/service-core';
import { ClaimStatus, ClaimType, TrustGrade, schemas } from '@celebbase/shared-types';
import type { ClaimStory } from '@celebbase/shared-types';
import * as claimRepo from '../../repositories/lifestyle-claim.repository.js';
import type {
  ListAdminClaimOptions,
  CreateClaimInput,
  UpdateClaimInput,
} from '../../repositories/lifestyle-claim.repository.js';
import { assertLegalGate, type GateFinding } from '../../lib/content-legal-gate.js';

const ClaimIdParamSchema = z.object({ id: z.string().uuid() }).strict();

const ListQuerySchema = z
  .object({
    status: ClaimStatus.optional(),
    claim_type: ClaimType.optional(),
    trust_grade: TrustGrade.optional(),
    celebrity_id: z.string().uuid().optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

const TransitionBodySchema = z
  .object({
    status: ClaimStatus,
    disclaimer_key: z.string().min(1).max(100).nullable().optional(),
  })
  .strict();

const HealthClaimBodySchema = z
  .object({
    is_health_claim: z.boolean(),
  })
  .strict();

function throwIfInvalid<T>(
  parsed: { success: true; data: T } | { success: false; error: z.ZodError },
  message: string,
): T {
  if (parsed.success) return parsed.data;
  throw new ValidationError(
    message,
    parsed.error.errors.map((e) => ({
      field: e.path.join('.'),
      issue: e.message,
    })),
  );
}

function buildListOptions(query: z.infer<typeof ListQuerySchema>): ListAdminClaimOptions {
  return {
    ...(query.status !== undefined ? { status: query.status } : {}),
    ...(query.claim_type !== undefined ? { claim_type: query.claim_type } : {}),
    ...(query.trust_grade !== undefined ? { trust_grade: query.trust_grade } : {}),
    ...(query.celebrity_id !== undefined ? { celebrity_id: query.celebrity_id } : {}),
    ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
  };
}

// 발행 choke-point — published 가 되는 모든 경로(create/update/transition)가 호출.
// story 카피가 있으면 법무 게이트 실행(BLOCK 시 assertLegalGate 가 400 throw). 통과 시 경고 반환.
// story 가 null(트렌드/철학 등 비-story claim)이면 게이트 대상 카피가 없어 N/A.
async function runPublishGate(
  pool: pg.Pool,
  story: ClaimStory | null,
  celebrityId: string | null,
  isHealthClaim: boolean,
): Promise<GateFinding[]> {
  if (story === null) return [];
  const celebName =
    celebrityId !== null ? await claimRepo.getCelebrityDisplayName(pool, celebrityId) : null;
  return assertLegalGate(story, celebName, isHealthClaim);
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function lifestyleClaimAdminRoutes(
  app: FastifyInstance,
  options: { pool: pg.Pool },
): Promise<void> {
  const { pool } = options;

  app.get('/admin/claims', async (request) => {
    const query = throwIfInvalid(
      ListQuerySchema.safeParse(request.query),
      'Invalid query parameters',
    );
    const result = await claimRepo.listForModeration(pool, buildListOptions(query));
    return {
      claims: result.items,
      next_cursor: result.next_cursor,
      has_next: result.has_next,
    };
  });

  app.get('/admin/claims/:id', async (request) => {
    const { id } = throwIfInvalid(
      ClaimIdParamSchema.safeParse(request.params),
      'Invalid path parameters',
    );
    const result = await claimRepo.findByIdAdmin(pool, id);
    if (!result) throw new NotFoundError('Claim not found');
    const { sources, ...claim } = result;
    return { claim, sources };
  });

  app.post('/admin/claims/:id/transition', async (request, reply) => {
    const { id } = throwIfInvalid(
      ClaimIdParamSchema.safeParse(request.params),
      'Invalid path parameters',
    );
    const body = throwIfInvalid(
      TransitionBodySchema.safeParse(request.body),
      'Invalid request body',
    );

    // 발행(→published) 직전 법무 게이트(choke-point). story 있으면 검사, BLOCK 시 400.
    let transitionWarnings: GateFinding[] = [];
    if (body.status === 'published') {
      const existing = await claimRepo.findByIdAdmin(pool, id);
      if (!existing) throw new NotFoundError('Claim not found');
      transitionWarnings = await runPublishGate(
        pool,
        existing.story,
        existing.celebrity_id,
        existing.is_health_claim,
      );
    }

    const result = await claimRepo.transitionStatus(pool, id, {
      toStatus: body.status,
      ...(body.disclaimer_key !== undefined ? { disclaimer_key: body.disclaimer_key } : {}),
    });

    if (!result.ok) {
      if (result.reason === 'not_found') throw new NotFoundError('Claim not found');
      if (result.reason === 'celebrity_inactive') {
        throw new AppError(
          'Celebrity is inactive — claim cannot be published',
          422,
          'CELEBRITY_INACTIVE',
          [
            {
              field: 'status',
              issue: 'parent celebrity.is_active=FALSE — cascade contract (spec §9.3 #3)',
            },
          ],
        );
      }
      if (result.reason === 'grade_E_blocked') {
        throw new ValidationError('trust_grade=E cannot be published', [
          { field: 'status', issue: 'trust_grade E is blocked from publishing (spec §9.3 #5)' },
        ]);
      }
      // grade_D_requires_disclaimer
      throw new ValidationError('trust_grade=D requires disclaimer_key for publish', [
        {
          field: 'disclaimer_key',
          issue: 'disclaimer_key is required when publishing trust_grade=D claims (spec §9.3 #5)',
        },
      ]);
    }

    void reply.status(200);
    return { claim: result.claim, gate_warnings: transitionWarnings };
  });

  app.patch('/admin/claims/:id/health-claim', async (request) => {
    const { id } = throwIfInvalid(
      ClaimIdParamSchema.safeParse(request.params),
      'Invalid path parameters',
    );
    const body = throwIfInvalid(
      HealthClaimBodySchema.safeParse(request.body),
      'Invalid request body',
    );

    const updated = await claimRepo.setHealthClaim(pool, id, body.is_health_claim);
    if (!updated) throw new NotFoundError('Claim not found');
    return { claim: updated };
  });

  // 새 claim 작성(admin CMS). published 면 write 전 법무 게이트(choke-point).
  app.post('/admin/claims', async (request, reply) => {
    const body = throwIfInvalid(
      schemas.AdminClaimCreateSchema.safeParse(request.body),
      'Invalid request body',
    );

    let celebrityId: string | null = null;
    if (body.celebrity_slug != null) {
      celebrityId = await claimRepo.resolveCelebrityIdBySlug(pool, body.celebrity_slug);
      if (celebrityId === null) {
        throw new NotFoundError(`Celebrity not found: ${body.celebrity_slug}`);
      }
    }
    let baseDietId: string | null = null;
    if (body.base_diet_id_slug != null) {
      baseDietId = await claimRepo.resolveBaseDietIdByCelebSlug(pool, body.base_diet_id_slug);
      if (baseDietId === null) {
        throw new NotFoundError(`No active base_diet for celebrity: ${body.base_diet_id_slug}`);
      }
    }

    const story: ClaimStory | null = body.story ?? null;
    const warnings =
      body.status === 'published'
        ? await runPublishGate(pool, story, celebrityId, body.is_health_claim)
        : [];

    const input: CreateClaimInput = {
      celebrity_id: celebrityId,
      claim_type: body.claim_type,
      headline: body.headline,
      body: body.body ?? null,
      trust_grade: body.trust_grade,
      primary_source_url: body.primary_source_url ?? null,
      verified_by: body.verified_by ?? null,
      is_health_claim: body.is_health_claim,
      disclaimer_key: body.disclaimer_key ?? null,
      base_diet_id: baseDietId,
      tags: body.tags,
      status: body.status,
      story,
      sources: body.sources,
    };
    const created = await claimRepo.createClaim(pool, input);
    const { sources, ...claim } = created;
    void reply.status(201);
    return { claim, sources, gate_warnings: warnings };
  });

  // 기존 claim 편집(admin CMS). 발행 결과면 write 전 법무 게이트. celebrity 변경은 v1 미지원.
  app.patch('/admin/claims/:id', async (request) => {
    const { id } = throwIfInvalid(
      ClaimIdParamSchema.safeParse(request.params),
      'Invalid path parameters',
    );
    const body = throwIfInvalid(
      schemas.AdminClaimUpdateSchema.safeParse(request.body),
      'Invalid request body',
    );

    const existing = await claimRepo.findByIdAdmin(pool, id);
    if (!existing) throw new NotFoundError('Claim not found');

    // base_diet 연결만 slug 로 변경 가능(CTA 라이브 토글). celebrity 는 생성 시 고정.
    let baseDietId: string | null | undefined;
    if (body.base_diet_id_slug !== undefined) {
      if (body.base_diet_id_slug === null) {
        baseDietId = null;
      } else {
        baseDietId = await claimRepo.resolveBaseDietIdByCelebSlug(pool, body.base_diet_id_slug);
        if (baseDietId === null) {
          throw new NotFoundError(`No active base_diet for celebrity: ${body.base_diet_id_slug}`);
        }
      }
    }

    const effectiveStatus = body.status ?? existing.status;
    let warnings: GateFinding[] = [];
    if (effectiveStatus === 'published') {
      const story: ClaimStory | null = body.story !== undefined ? (body.story ?? null) : existing.story;
      const isHealth = body.is_health_claim ?? existing.is_health_claim;
      warnings = await runPublishGate(pool, story, existing.celebrity_id, isHealth);
    }

    const patch: UpdateClaimInput = {
      ...(body.claim_type !== undefined ? { claim_type: body.claim_type } : {}),
      ...(body.headline !== undefined ? { headline: body.headline } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
      ...(body.trust_grade !== undefined ? { trust_grade: body.trust_grade } : {}),
      ...(body.primary_source_url !== undefined ? { primary_source_url: body.primary_source_url } : {}),
      ...(body.verified_by !== undefined ? { verified_by: body.verified_by } : {}),
      ...(body.is_health_claim !== undefined ? { is_health_claim: body.is_health_claim } : {}),
      ...(body.disclaimer_key !== undefined ? { disclaimer_key: body.disclaimer_key } : {}),
      ...(baseDietId !== undefined ? { base_diet_id: baseDietId } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.story !== undefined ? { story: body.story ?? null } : {}),
      ...(body.sources !== undefined ? { sources: body.sources } : {}),
    };
    const updated = await claimRepo.updateClaim(pool, id, patch);
    if (!updated) throw new NotFoundError('Claim not found');
    const { sources, ...claim } = updated;
    return { claim, sources, gate_warnings: warnings };
  });
}
