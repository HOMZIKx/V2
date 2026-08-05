import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { resolveHttpListen } from '@v2/configuration';
import { createLogger } from '@v2/observability';
import type { Pool } from 'pg';

import { serviceName } from './domain/service-name.js';
import {
  parseAuthorizationEnv,
  redactSecrets,
} from './infrastructure/config/authorization-env.js';
import { loadAuthorizationEnvFiles } from './infrastructure/config/load-env-file.js';
import { AppModule } from './interface/app.module.js';
import { AUTHORIZATION_POOL } from './interface/authorization.tokens.js';

loadAuthorizationEnvFiles();

const logger = createLogger(serviceName);

const bootstrap = async (): Promise<void> => {
  const config = parseAuthorizationEnv(process.env);

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  const pool = app.get<Pool>(AUTHORIZATION_POOL);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('Shutting down Authorization Service.', { signal });
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
    defaultPort: config.AUTHORIZATION_SERVICE_PORT,
    defaultHost: config.AUTHORIZATION_SERVICE_HOST,
  });

  await app.listen(listen.port, listen.host);
  logger.info(
    redactSecrets('Authorization Service started.', [
      config.AUTHORIZATION_SYSTEM_PRIVATE_KEY_PEM,
      config.AUTHORIZATION_DATABASE_URL,
    ]),
    {
      host: listen.host,
      port: listen.port,
      authorizationEnabled: config.AUTHORIZATION_ENABLED,
    },
  );
};

void bootstrap();
