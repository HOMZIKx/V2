import { Redis } from 'ioredis';
import { describe, expect, it } from 'vitest';

import { RedisAssertionJtiStore } from './assertion-jti-store.js';

describe('RedisAssertionJtiStore', () => {
  const runInfra = process.env.RUN_INFRA_TESTS === 'true' ? describe : describe.skip;
  const redisUrl = process.env.IDENTITY_REDIS_URL ?? 'redis://127.0.0.1:6379/1';

  runInfra('with Redis', () => {
    it('accepts first jti and rejects replay', async () => {
      const store = new RedisAssertionJtiStore(
        new Redis(redisUrl),
        `v2:identity:test-assertion-jti:${Date.now()}:`,
      );
      const jti = `jti-${Date.now()}`;

      await store.assertOnce(jti, 30);
      await expect(store.assertOnce(jti, 30)).rejects.toMatchObject({
        code: 'CLIENT_ASSERTION_REPLAY',
      });

      await store.close();
    });
  });

  it('fails closed when redis is unavailable', async () => {
    const store = new RedisAssertionJtiStore(
      new Redis('redis://127.0.0.1:63999/9', {
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        connectTimeout: 200,
        retryStrategy: () => null,
      }),
      'v2:identity:test-unavailable:',
    );

    await expect(store.assertOnce('jti-down', 30)).rejects.toMatchObject({
      code: 'CLIENT_ASSERTION_REPLAY',
    });
    await store.close().catch(() => undefined);
  });
});
