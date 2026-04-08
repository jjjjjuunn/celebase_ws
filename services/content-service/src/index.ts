import { createApp } from '@celebbase/service-core';
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  HOST: z.string().min(1).default('0.0.0.0'),
});

const start = async (): Promise<void> => {
  const env = EnvSchema.parse(process.env);
  const app = await createApp({ serviceName: 'content-service' });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (error: unknown) {
    app.log.error({ err: error }, 'Failed to start content-service');
    await app.close();
    process.exitCode = 1;
  }
};

void start();
