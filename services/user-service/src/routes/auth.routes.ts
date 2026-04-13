import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { ValidationError } from '@celebbase/service-core';
import type { AuthProvider } from '../services/auth.service.js';
import * as authService from '../services/auth.service.js';

const SignupSchema = z.object({
  email: z.string().email().max(255),
  display_name: z.string().min(1).max(100),
  id_token: z.string().optional(),
});

const LoginSchema = z.object({
  email: z.string().email().max(255),
  id_token: z.string().optional(),
});

const RefreshSchema = z.object({
  refresh_token: z.string().min(1),
});

// eslint-disable-next-line @typescript-eslint/require-await
export async function authRoutes(
  app: FastifyInstance,
  options: { pool: pg.Pool; authProvider: AuthProvider },
): Promise<void> {
  const { pool, authProvider } = options;

  app.post('/auth/signup', async (request: FastifyRequest) => {
    const parsed = SignupSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    return authService.signup(pool, authProvider, parsed.data);
  });

  app.post('/auth/login', async (request: FastifyRequest) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    return authService.login(pool, authProvider, parsed.data);
  });

  app.post('/auth/refresh', async (request: FastifyRequest) => {
    const parsed = RefreshSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.errors.map((e) => ({
        field: e.path.join('.'),
        issue: e.message,
      })));
    }
    return authService.refresh(authProvider, parsed.data.refresh_token);
  });
}
