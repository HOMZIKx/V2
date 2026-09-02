import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { createConfig, resolveHttpListen } from '@v2/configuration';
import { createLogger, runBoundedShutdown } from '@v2/observability';
import { z } from 'zod';

import { AppModule } from './app.module.js';
import { applyCorsOnRequest, parseCorsOrigins } from './cors.js';
import { applyRateLimitOnRequest } from './rate-limit.js';
import { applyRequestCorrelation } from './request-correlation.js';

const config = createConfig(
  z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_GATEWAY_PORT: z.coerce.number().int().positive().default(4000),
    API_GATEWAY_HOST: z.string().min(1).default('127.0.0.1'),
    /**
     * Zeabur: api-gateway sits behind Zeabur edge proxy (single hop).
     * Fastify trustProxy lets request.ip reflect the real client; never parse XFF manually.
     * Local dev/test default false — direct socket IP unless explicitly enabled.
     */
    API_GATEWAY_TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
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

type GatewayRequest = {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
  ip?: string;
};
type GatewayReply = {
  header: (key: string, value: string) => unknown;
  code: (status: number) => GatewayReply;
  status: (code: number) => { send: (body?: unknown) => unknown };
  send: (body?: unknown) => unknown;
};

const bootstrap = async (): Promise<void> => {
  const trustProxy =
    config.API_GATEWAY_TRUST_PROXY ||
    (config.NODE_ENV === 'production' && process.env['API_GATEWAY_TRUST_PROXY'] !== 'false');
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 262_144, trustProxy }),
  );
  const corsOrigins = parseCorsOrigins(config.API_GATEWAY_CORS_ORIGINS);
  const instance = app.getHttpAdapter().getInstance() as unknown as {
    addHook: (
      name: 'onRequest',
      hook: (request: GatewayRequest, reply: GatewayReply, done: (err?: Error) => void) => void,
    ) => void;
  };

  instance.addHook('onRequest', (request, reply, done) => {
    applyRequestCorrelation(request, reply);
    if (applyRateLimitOnRequest(request, reply)) {
      return;
    }
    const ended = applyCorsOnRequest(request, reply, corsOrigins);
    if (ended) {
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

  const shutdown = async (signal: string): Promise<void> => {
    await runBoundedShutdown(logger, signal, async () => {
      await app.close();
    });
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }

  const listen = resolveHttpListen({
    defaultPort: config.API_GATEWAY_PORT,
    defaultHost: config.API_GATEWAY_HOST,
  });
  logger.info('API Gateway started.', { host: listen.host, port: listen.port, event: 'listen' });
  await app.listen(listen.port, listen.host);
};

void bootstrap();
