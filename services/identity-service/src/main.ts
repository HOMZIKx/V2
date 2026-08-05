import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createConfig, resolveHttpListen } from '@v2/configuration';
import { createLogger } from '@v2/observability';
import { z } from 'zod';

import { serviceName } from './domain/service-name.js';
import { AppModule } from './interface/app.module.js';

const config = createConfig(
  z.object({
    IDENTITY_SERVICE_PORT: z.coerce.number().int().positive().default(4200),
    IDENTITY_SERVICE_HOST: z.string().min(1).default('127.0.0.1'),
    IDENTITY_DATABASE_URL: z.string().url(),
  }),
);
const logger = createLogger(serviceName);

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  const listen = resolveHttpListen({
    defaultPort: config.IDENTITY_SERVICE_PORT,
    defaultHost: config.IDENTITY_SERVICE_HOST,
  });
  logger.info('Identity Service started without a database connection.', {
    host: listen.host,
    port: listen.port,
  });
  await app.listen(listen.port, listen.host);
};

void bootstrap();
