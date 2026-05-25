import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';

import { AppError } from './errors.js';
import { BaseConfigSchema } from './config.js';
import { createLogger } from './logger.js';
import { initSentry, captureException } from './sentry.js';

export interface CreateAppOptions {
  serviceName: string;
  logLevel?: string;
  corsOrigins?: string[];
}

export async function createApp(options: CreateAppOptions): Promise<FastifyInstance> {
  const logger = createLogger(options.serviceName, options.logLevel ?? 'info');

  const app = Fastify({
    loggerInstance: logger as unknown as FastifyBaseLogger,
    genReqId: () => randomUUID(),
    disableRequestLogging: false,
  });

  const baseConfig = BaseConfigSchema.parse(process.env);

  // Errors-only Sentry; fail-open when SENTRY_DSN is unset (launch default).
  initSentry(options.serviceName, baseConfig.SENTRY_DSN, baseConfig.NODE_ENV);

  const origins = options.corsOrigins ?? baseConfig.CORS_ORIGINS;

  await app.register(cors, {
    origin: origins,
  });

  await app.register(helmet);

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Health check — shallow (no DB/Redis dependency)
  app.get('/health', () => ({ status: 'ok' as const }));

  // Error handler — maps AppError to spec §4.1 error format
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      // Server-side AppErrors (5xx, e.g. AuditFailureError) are operationally
      // important; 4xx (validation/auth) are expected and stay out of Sentry.
      if (error.statusCode >= 500) captureException(error);
      void reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId: request.id,
        },
      });
      return;
    }

    request.log.error({ err: error }, 'Unhandled error');
    captureException(error);
    void reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        requestId: request.id,
      },
    });
  });

  return app;
}
