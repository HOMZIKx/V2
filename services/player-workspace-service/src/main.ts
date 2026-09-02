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
import { loadPlayerWorkspaceEnvFiles } from './infrastructure/config/load-env-file.js';
import {
  parsePlayerWorkspaceEnv,
  redactSecrets,
} from './infrastructure/config/player-workspace-env.js';
import type { AssertionJtiStore } from './infrastructure/internal/assertion-jti-store.js';
import { AppModule } from './interface/app.module.js';
import { PlayerWorkspaceExceptionFilter } from './interface/player-workspace-exception.filter.js';
import { ASSERTION_JTI_STORE, PLAYER_WORKSPACE_POOL } from './interface/player-workspace.tokens.js';

loadPlayerWorkspaceEnvFiles();

const logger = createLogger(serviceName);

const bootstrap = async (): Promise<void> => {
  const config = parsePlayerWorkspaceEnv(process.env);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 262_144 }),
  );
  app.useGlobalFilters(new PlayerWorkspaceExceptionFilter());
  registerFastifyRequestCorrelation(app.getHttpAdapter().getInstance());

  const pool = app.get<Pool>(PLAYER_WORKSPACE_POOL);
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
    defaultPort: config.PLAYER_WORKSPACE_SERVICE_PORT,
    defaultHost: config.PLAYER_WORKSPACE_SERVICE_HOST,
  });

  await app.listen(listen.port, listen.host);
  logger.info(
    redactSecrets('Player Workspace Service started.', [
      config.PLAYER_WORKSPACE_TO_IDENTITY_PRIVATE_KEY_PEM,
      config.PLAYER_WORKSPACE_DATABASE_URL,
    ]),
    {
      event: 'listen',
      host: listen.host,
      port: listen.port,
    },
  );
};

void bootstrap();
