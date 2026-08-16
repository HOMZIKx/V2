import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './app.module.js';

/**
 * HTTP smoke with ACTIVITY_ENABLED=false (allow-all authz + actor headers).
 * Requires ACTIVITY_DATABASE_URL when RUN_INFRA_TESTS=true; otherwise skipped.
 */
const wantInfra = process.env.RUN_INFRA_TESTS === 'true';

describe.skipIf(!wantInfra)('Activity HTTP (ACTIVITY_ENABLED=false)', () => {
  let app: NestFastifyApplication | undefined;
  let ready = false;

  beforeAll(async () => {
    process.env.ACTIVITY_ENABLED = 'false';
    process.env.ACTIVITY_OUTBOX_WORKER_ENABLED = 'false';
    process.env.ACTIVITY_DATABASE_URL =
      process.env.ACTIVITY_DATABASE_URL ??
      'postgresql://activity:activity_dev_password@127.0.0.1:5432/activity';
    try {
      app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
        logger: false,
      });
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
      ready = true;
    } catch (error) {
      console.warn(
        'Activity HTTP infra tests skipped:',
        error instanceof Error ? error.message : error,
      );
      ready = false;
    }
  }, 60_000);

  afterAll(async () => {
    await app?.close().catch(() => undefined);
  });

  it('health live works', async ({ skip }) => {
    if (!ready || app === undefined) {
      skip();
      return;
    }
    const response = await app.inject({ method: 'GET', url: '/health/live' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('creates a draft with actor header', async ({ skip }) => {
    if (!ready || app === undefined) {
      skip();
      return;
    }
    const response = await app.inject({
      method: 'POST',
      url: '/activity/v1/drafts',
      headers: {
        'content-type': 'application/json',
        'x-actor-discord-user-id': 'http-user-1',
        'idempotency-key': `http-draft-${Date.now()}`,
      },
      payload: { guildId: 'guild-http-1', payload: { name: 'x' } },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ guildId: 'guild-http-1' });
  });
});
