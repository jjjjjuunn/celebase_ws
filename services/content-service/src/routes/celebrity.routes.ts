import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { ValidationError } from '@celebbase/service-core';
import * as celebrityService from '../services/celebrity.service.js';

const ListQuerySchema = z.object({
  category: z.enum(['diet', 'protein', 'vegetarian', 'general']).optional(),
  featured: z.string().transform((v) => v === 'true').pipe(z.boolean()).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict();

const SlugParamSchema = z.object({
  slug: z.string().min(1),
}).strict();

// eslint-disable-next-line @typescript-eslint/require-await
export async function celebrityRoutes(app: FastifyInstance, options: { pool: pg.Pool }): Promise<void> {
  const { pool } = options;

  app.get('/celebrities', async (request) => {
    const parsed = ListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ValidationError('Invalid query params', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    return celebrityService.listCelebrities(pool, parsed.data);
  });

  app.get('/celebrities/:slug', async (request) => {
    const parsed = SlugParamSchema.safeParse(request.params);
    if (!parsed.success) {
      throw new ValidationError('Invalid params', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    return celebrityService.getCelebrity(pool, parsed.data.slug);
  });
}
