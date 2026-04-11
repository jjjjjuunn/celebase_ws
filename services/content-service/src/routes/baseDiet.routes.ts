import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { ValidationError } from '@celebbase/service-core';
import * as baseDietService from '../services/baseDiet.service.js';

const IdParamSchema = z.object({
  id: z.string().uuid(),
}).strict();

const SlugParamSchema = z.object({
  slug: z.string().min(1),
}).strict();

// eslint-disable-next-line @typescript-eslint/require-await
export async function baseDietRoutes(app: FastifyInstance, options: { pool: pg.Pool }): Promise<void> {
  const { pool } = options;

  app.get('/celebrities/:slug/diets', async (request) => {
    const parsed = SlugParamSchema.safeParse(request.params);
    if (!parsed.success) {
      throw new ValidationError('Invalid params', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    const items = await baseDietService.listByCelebrity(pool, parsed.data.slug);
    return { items };
  });

  app.get('/base-diets/:id', async (request) => {
    const parsed = IdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      throw new ValidationError('Invalid params', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    return baseDietService.getBaseDiet(pool, parsed.data.id);
  });
}
