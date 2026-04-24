import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { ValidationError } from '@celebbase/service-core';
import * as recipeService from '../services/recipe.service.js';

const IdParamSchema = z.object({
  id: z.string().uuid(),
}).strict();

const ListRecipesQuerySchema = z.object({
  meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'smoothie']).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict();

const PersonalizedQuerySchema = z.object({
  allergies: z.string().optional(),
}).strict();

// Plan 22 · Phase D3 — batch lookup. Max 32 UUIDs per call to keep SQL param
// budget bounded and prevent abusive fan-out from the BFF.
const MAX_BATCH_IDS = 32;
const BatchRecipesQuerySchema = z.object({
  ids: z
    .string()
    .min(1)
    .transform((raw) => raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0))
    .pipe(
      z
        .array(z.string().uuid())
        .min(1)
        .max(MAX_BATCH_IDS),
    ),
}).strict();

// eslint-disable-next-line @typescript-eslint/require-await
export async function recipeRoutes(app: FastifyInstance, options: { pool: pg.Pool }): Promise<void> {
  const { pool } = options;

  app.get('/base-diets/:id/recipes', async (request) => {
    const paramParsed = IdParamSchema.safeParse(request.params);
    if (!paramParsed.success) {
      throw new ValidationError('Invalid params', paramParsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    const queryParsed = ListRecipesQuerySchema.safeParse(request.query);
    if (!queryParsed.success) {
      throw new ValidationError('Invalid query params', queryParsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    return recipeService.listByBaseDiet(pool, paramParsed.data.id, queryParsed.data);
  });

  // Plan 22 · Phase D3 — batch fetch by id list. Registered before `/recipes/:id`
  // so Fastify's static route match wins over the parametric route.
  app.get('/recipes', async (request) => {
    const queryParsed = BatchRecipesQuerySchema.safeParse(request.query);
    if (!queryParsed.success) {
      throw new ValidationError('Invalid query params', queryParsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    const recipes = await recipeService.getRecipesByIds(pool, queryParsed.data.ids);
    return { recipes };
  });

  app.get('/recipes/:id', async (request) => {
    const parsed = IdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      throw new ValidationError('Invalid params', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    return recipeService.getRecipe(pool, parsed.data.id);
  });

  app.get('/recipes/:id/personalized', async (request) => {
    const paramParsed = IdParamSchema.safeParse(request.params);
    if (!paramParsed.success) {
      throw new ValidationError('Invalid params', paramParsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    const queryParsed = PersonalizedQuerySchema.safeParse(request.query);
    if (!queryParsed.success) {
      throw new ValidationError('Invalid query params', queryParsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    const allergies = queryParsed.data.allergies
      ? queryParsed.data.allergies.split(',').map((a) => a.trim()).filter(Boolean)
      : [];
    return recipeService.getPersonalized(pool, paramParsed.data.id, allergies);
  });
}
