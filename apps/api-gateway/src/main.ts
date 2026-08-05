import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createConfig, resolveHttpListen } from '@v2/configuration';
import { createLogger } from '@v2/observability';
import { z } from 'zod';

import { AppModule } from './app.module.js';

const config = createConfig(
  z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_GATEWAY_PORT: z.coerce.number().int().positive().default(4000),
    API_GATEWAY_HOST: z.string().min(1).default('127.0.0.1'),
  }),
);
const logger = createLogger('api-gateway');

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  if (config.NODE_ENV !== 'production') {
    SwaggerModule.setup(
      'openapi',
      app,
      SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('V2 API Gateway').setVersion('0.0.0').build(),
      ),
    );
  }

  const listen = resolveHttpListen({
    defaultPort: config.API_GATEWAY_PORT,
    defaultHost: config.API_GATEWAY_HOST,
  });
  logger.info('API Gateway started.', { host: listen.host, port: listen.port });
  await app.listen(listen.port, listen.host);
};

void bootstrap();
