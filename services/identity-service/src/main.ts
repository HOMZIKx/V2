import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { resolveHttpListen } from '@v2/configuration';
import {
  createLogger,
  registerFastifyRequestCorrelation,
  runBoundedShutdown,
} from '@v2/observability';

import { serviceName } from './domain/service-name.js';
import type { AuthRuntime } from './infrastructure/auth/create-better-auth.js';
import { parseIdentityEnv } from './infrastructure/config/identity-env.js';
import { loadIdentityEnvFiles } from './infrastructure/config/load-env-file.js';
import { AppModule } from './interface/app.module.js';
import { AUTH_RUNTIME } from './interface/identity.tokens.js';

loadIdentityEnvFiles();

const logger = createLogger(serviceName);

const bootstrap = async (): Promise<void> => {
  const config = parseIdentityEnv(process.env);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 262_144 }),
  );

  registerFastifyRequestCorrelation(app.getHttpAdapter().getInstance());

  const runtime = app.get<AuthRuntime | null>(AUTH_RUNTIME, { strict: false });

  const shutdown = async (signal: string): Promise<void> => {
    await runBoundedShutdown(logger, signal, async () => {
      await app.close().catch(() => undefined);
      if (runtime !== null) {
        await runtime.close().catch(() => undefined);
      }
    });
  };

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }

  const listen = resolveHttpListen({
    defaultPort: config.IDENTITY_SERVICE_PORT,
    defaultHost: config.IDENTITY_SERVICE_HOST,
  });

  await app.listen(listen.port, listen.host);
  logger.info('Identity Service started.', {
    host: listen.host,
    port: listen.port,
    authEnabled: config.IDENTITY_AUTH_ENABLED,
  });
};

void bootstrap();
