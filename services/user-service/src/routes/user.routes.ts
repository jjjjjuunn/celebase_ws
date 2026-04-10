import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { ValidationError } from '@celebbase/service-core';
import * as userService from '../services/user.service.js';

const UpdateMeSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  avatar_url: z.string().url().optional(),
  locale: z.string().max(10).optional(),
  timezone: z.string().max(50).optional(),
}).strict();

// eslint-disable-next-line @typescript-eslint/require-await
export async function userRoutes(app: FastifyInstance, options: { pool: pg.Pool }): Promise<void> {
  const { pool } = options;

  app.get('/users/me', async (request: FastifyRequest) => {
    return userService.getMe(pool, request.userId);
  });

  app.patch('/users/me', async (request: FastifyRequest) => {
    const parsed = UpdateMeSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    return userService.updateMe(pool, request.userId, parsed.data);
  });

  app.delete('/users/me', async (request: FastifyRequest, reply: FastifyReply) => {
    await userService.deleteMe(pool, request.userId);
    return reply.status(204).send();
  });
}
