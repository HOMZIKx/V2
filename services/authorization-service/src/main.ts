import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { createConfig } from '@v2/configuration';
import { createLogger } from '@v2/observability';
import { z } from 'zod';

import { serviceName } from './domain/service-name.js';
import { AppModule } from './interface/app.module.js';

const config = createConfig(
  z.object({
    AUTHORIZATION_SERVICE_PORT: z.coerce.number().int().positive().default(4300),
    AUTHORIZATION_SERVICE_HOST: z.string().min(1).default('127.0.0.1'),
    AUTHORIZATION_DATABASE_URL: z.string().url(),
  }),
);
const logger = createLogger(serviceName);

const bootstrap = async () => {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  logger.info('Authorization Service started without a database connection.');
  await app.listen(config.AUTHORIZATION_SERVICE_PORT, config.AUTHORIZATION_SERVICE_HOST);
};

void bootstrap();
