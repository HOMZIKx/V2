import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
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

  await app.listen(config.DISCORD_GATEWAY_PORT, config.DISCORD_GATEWAY_HOST);
  logger.info('Discord gateway HTTP listener started', {
    host: config.DISCORD_GATEWAY_HOST,
    port: config.DISCORD_GATEWAY_PORT,
    discordEnabled: config.DISCORD_ENABLED,
  });
};

void bootstrap();
