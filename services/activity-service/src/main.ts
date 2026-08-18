import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { resolveHttpListen } from '@v2/configuration';
import { createLogger } from '@v2/observability';
import type { Pool } from 'pg';

import { serviceName } from './domain/service-name.js';
import { parseActivityEnv, redactSecrets } from './infrastructure/config/activity-env.js';
import { loadActivityEnvFiles } from './infrastructure/config/load-env-file.js';
import { ACTIVITY_POOL } from './interface/activity.tokens.js';
import { AppModule } from './interface/app.module.js';

loadActivityEnvFiles();

const logger = createLogger(serviceName);

const bootstrap = async (): Promise<void> => {
  const config = parseActivityEnv(process.env);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 262_144 }),
  );

  const pool = app.get<Pool>(ACTIVITY_POOL);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('Shutting down Activity Service.', { signal });
    await app.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
    process.exit(0);
  };

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }

  const listen = resolveHttpListen({
    defaultPort: config.ACTIVITY_SERVICE_PORT,
    defaultHost: config.ACTIVITY_SERVICE_HOST,
  });

  await app.listen(listen.port, listen.host);
  logger.info(
    redactSecrets('Activity Service started.', [
      config.ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM,
      config.ACTIVITY_DATABASE_URL,
    ]),
    {
      host: listen.host,
      port: listen.port,
      activityEnabled: config.ACTIVITY_ENABLED,
      outboxWorkerEnabled: config.ACTIVITY_OUTBOX_WORKER_ENABLED,
    },
  );
};

void bootstrap();
