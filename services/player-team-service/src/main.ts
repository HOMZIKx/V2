import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { resolveHttpListen } from '@v2/configuration';
import { createLogger } from '@v2/observability';

import { AppModule } from './interface/app.module.js';
import { PLAYER_TEAM_ENV } from './interface/player-team.tokens.js';
import { type PlayerTeamEnv } from './infrastructure/config/player-team-env.js';

const logger = createLogger('player-team-service');

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  const env = app.get<PlayerTeamEnv>(PLAYER_TEAM_ENV, { strict: false });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('Shutting down player-team service.', { signal });
    await app.close().catch(() => undefined);
    process.exit(0);
  };

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }

  const listen = resolveHttpListen({
    defaultPort: env.PLAYER_TEAM_SERVICE_PORT,
    defaultHost: env.PLAYER_TEAM_SERVICE_HOST,
  });

  await app.listen(listen.port, listen.host);
  logger.info('player-team-service started.', { host: listen.host, port: listen.port });
};

void bootstrap();

