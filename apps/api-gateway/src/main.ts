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
    /** Upstream activity-service for Admin/WWW BFF proxy (`/activity/v1/*`). */
    ACTIVITY_SERVICE_BASE_URL: z.string().url().optional(),
    /** Identity base for session→actor resolution (WWW). */
    IDENTITY_SERVICE_BASE_URL: z.string().url().optional(),
    INTERNAL_JWT_IDENTITY_BASE_URL: z.string().url().optional(),
    /** Comma-separated browser origins allowed for credentialed CORS (apps/web). */
    API_GATEWAY_CORS_ORIGINS: z.string().optional(),
  }),
);
const logger = createLogger('api-gateway');

function parseCorsOrigins(raw: string | undefined): string[] {
  if (raw === undefined || raw.trim() === '') {
    return ['http://127.0.0.1:3000', 'http://localhost:3000'];
  }
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

type CorsRequest = { headers: { origin?: string | string[] | undefined }; method: string };
type CorsReply = {
  header: (key: string, value: string) => unknown;
  status: (code: number) => { send: (body?: unknown) => unknown };
};

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  const corsOrigins = parseCorsOrigins(config.API_GATEWAY_CORS_ORIGINS);
  const instance = app.getHttpAdapter().getInstance() as unknown as {
    addHook: (
      name: 'onRequest',
      hook: (request: CorsRequest, reply: CorsReply, done: () => void) => void,
    ) => void;
  };
  instance.addHook('onRequest', (request, reply, done) => {
    const originHeader = request.headers.origin;
    const origin = typeof originHeader === 'string' ? originHeader : undefined;
    if (origin !== undefined && corsOrigins.includes(origin)) {
      void reply.header('Access-Control-Allow-Origin', origin);
      void reply.header('Access-Control-Allow-Credentials', 'true');
      void reply.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Accept, Idempotency-Key, If-Match, X-Request-Id, X-Correlation-Id',
      );
      void reply.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
      void reply.header('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') {
      void reply.status(204).send();
      return;
    }
    done();
  });

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
