import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { resolveHttpListen } from '@v2/configuration';
import { createLogger } from '@v2/observability';
import path from 'node:path';

import { loadEnvFile } from './infrastructure/discord/load-env-file.js';
import { AppModule } from './interface/app.module.js';
import { loadDiscordConfig } from './interface/discord/discord-bootstrap.service.js';

loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), 'apps/discord-gateway/.env'));

const config = loadDiscordConfig();
const logger = createLogger('discord-gateway');

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}; shutting down Discord gateway.`);
    await app.close();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  const listen = resolveHttpListen({
    defaultPort: config.DISCORD_GATEWAY_PORT,
    defaultHost: config.DISCORD_GATEWAY_HOST,
  });
  await app.listen(listen.port, listen.host);
  logger.info('Discord gateway HTTP listener started', {
    host: listen.host,
    port: listen.port,
    discordEnabled: config.DISCORD_ENABLED,
  });
};

void bootstrap();
