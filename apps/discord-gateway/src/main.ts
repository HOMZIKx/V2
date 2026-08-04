import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { createConfig } from '@v2/configuration';
import { createLogger } from '@v2/observability';
import { z } from 'zod';

import { AppModule } from './app.module.js';

const config = createConfig(
  z.object({
    DISCORD_GATEWAY_PORT: z.coerce.number().int().positive().default(4100),
    DISCORD_GATEWAY_HOST: z.string().min(1).default('127.0.0.1'),
  }),
);
const logger = createLogger('discord-gateway');

const bootstrap = async () => {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  logger.info('Discord connection is deferred; gateway is running in safe mode.');
  await app.listen(config.DISCORD_GATEWAY_PORT, config.DISCORD_GATEWAY_HOST);
};

void bootstrap();
