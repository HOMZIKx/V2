import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createConfig } from '@v2/configuration';
import { createLogger } from '@v2/observability';
import { z } from 'zod';

import { AppModule } from './app.module.js';

const config = createConfig(
  z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_GATEWAY_PORT: z.coerce.number().int().positive().default(4000),
    API_GATEWAY_HOST: z.string().min(1).default('0.0.0.0'),
  }),
);
const logger = createLogger('api-gateway');

const bootstrap = async () => {
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

  logger.info('API Gateway started.');
  await app.listen(config.API_GATEWAY_PORT, config.API_GATEWAY_HOST);
};

void bootstrap();
