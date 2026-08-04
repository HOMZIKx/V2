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
    IDENTITY_SERVICE_PORT: z.coerce.number().int().positive().default(4200),
    IDENTITY_SERVICE_HOST: z.string().min(1).default('0.0.0.0'),
    IDENTITY_DATABASE_URL: z.string().url(),
  }),
);
const logger = createLogger(serviceName);

const bootstrap = async () => {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  logger.info('Identity Service started without a database connection.');
  await app.listen(config.IDENTITY_SERVICE_PORT, config.IDENTITY_SERVICE_HOST);
};

void bootstrap();
