import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { AppError, NotFoundError, ValidationError } from '@celebbase/service-core';
import { ClaimStatus, ClaimType, TrustGrade } from '@celebbase/shared-types';
import * as claimRepo from '../../repositories/lifestyle-claim.repository.js';
import type { ListAdminClaimOptions } from '../../repositories/lifestyle-claim.repository.js';

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
    return { claim: result.claim };
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
}
