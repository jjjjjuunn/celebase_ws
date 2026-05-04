import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { ValidationError, NotFoundError } from '@celebbase/service-core';
import { ClaimType, TrustGrade } from '@celebbase/shared-types';
import * as claimRepo from '../repositories/lifestyle-claim.repository.js';
import type { ListLifestyleClaimOptions } from '../repositories/lifestyle-claim.repository.js';
import * as celebrityRepo from '../repositories/celebrity.repository.js';

const SlugParamSchema = z.object({ slug: z.string().min(1) }).strict();
const ClaimIdParamSchema = z.object({ id: z.string().uuid() }).strict();

const CelebrityClaimsQuerySchema = z
  .object({
    claim_type: ClaimType.optional(),
    trust_grade: TrustGrade.optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

const FeedQuerySchema = z
  .object({
    claim_type: ClaimType.optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
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

function buildListOptions(query: {
  claim_type?: z.infer<typeof ClaimType> | undefined;
  trust_grade?: z.infer<typeof TrustGrade> | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}): ListLifestyleClaimOptions {
  return {
    ...(query.claim_type !== undefined ? { claim_type: query.claim_type } : {}),
    ...(query.trust_grade !== undefined ? { trust_grade: query.trust_grade } : {}),
    ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
  };
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function lifestyleClaimRoutes(
  app: FastifyInstance,
  options: { pool: pg.Pool },
): Promise<void> {
  const { pool } = options;

  app.get('/celebrities/:slug/claims', async (request) => {
    const { slug } = throwIfInvalid(
      SlugParamSchema.safeParse(request.params),
      'Invalid path parameters',
    );
    const query = throwIfInvalid(
      CelebrityClaimsQuerySchema.safeParse(request.query),
      'Invalid query parameters',
    );

    const celebrity = await celebrityRepo.findBySlug(pool, slug);
    if (!celebrity) {
      throw new NotFoundError('Celebrity not found');
    }

    const result = await claimRepo.listByCelebrity(
      pool,
      celebrity.id,
      buildListOptions(query),
    );

    return {
      claims: result.items,
      next_cursor: result.next_cursor,
      has_next: result.has_next,
    };
  });

  app.get('/claims/feed', async (request) => {
    const query = throwIfInvalid(
      FeedQuerySchema.safeParse(request.query),
      'Invalid query parameters',
    );

    const result = await claimRepo.listFeed(pool, buildListOptions(query));

    return {
      claims: result.items,
      next_cursor: result.next_cursor,
      has_next: result.has_next,
    };
  });

  app.get('/claims/:id', async (request) => {
    const { id } = throwIfInvalid(
      ClaimIdParamSchema.safeParse(request.params),
      'Invalid path parameters',
    );

    const result = await claimRepo.findById(pool, id);
    if (!result) {
      throw new NotFoundError('Claim not found');
    }

    const { sources, ...claim } = result;
    return { claim, sources };
  });
}
