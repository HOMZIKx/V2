import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { resolveHttpListen } from '@v2/configuration';
import {
  createLogger,
  registerFastifyRequestCorrelation,
  runBoundedShutdown,
} from '@v2/observability';
import type { Pool } from 'pg';

import { serviceName } from './domain/service-name.js';
import { parseActivityEnv, redactSecrets } from './infrastructure/config/activity-env.js';
import { loadActivityEnvFiles } from './infrastructure/config/load-env-file.js';
import type { AssertionJtiStore } from './infrastructure/internal/assertion-jti-store.js';
import { UnhandledActivityExceptionFilter } from './interface/activity-exception.filter.js';
import { ACTIVITY_POOL, ASSERTION_JTI_STORE } from './interface/activity.tokens.js';
import { AppModule } from './interface/app.module.js';

loadActivityEnvFiles();

const logger = createLogger(serviceName);

const bootstrap = async (): Promise<void> => {
  const config = parseActivityEnv(process.env);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 262_144 }),
  );
  app.useGlobalFilters(new UnhandledActivityExceptionFilter());

  registerFastifyRequestCorrelation(app.getHttpAdapter().getInstance());

  const pool = app.get<Pool>(ACTIVITY_POOL);
  const jtiStore = app.get<AssertionJtiStore | null>(ASSERTION_JTI_STORE, { strict: false });

  const shutdown = async (signal: string): Promise<void> => {
    await runBoundedShutdown(logger, signal, async () => {
      await app.close().catch(() => undefined);
      await pool.end().catch(() => undefined);
      await jtiStore?.close().catch(() => undefined);
    });
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
      event: 'listen',
      host: listen.host,
      port: listen.port,
      activityEnabled: config.ACTIVITY_ENABLED,
      outboxWorkerEnabled: config.ACTIVITY_OUTBOX_WORKER_ENABLED,
    },
  );
};

void bootstrap();
