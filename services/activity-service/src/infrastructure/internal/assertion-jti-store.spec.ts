import { describe, expect, it } from 'vitest';

import { ActivityError } from '../../domain/errors.js';
import { MemoryAssertionJtiStore } from './assertion-jti-store.js';

describe('MemoryAssertionJtiStore', () => {
  it('accepts first jti and rejects replay', async () => {
    const store = new MemoryAssertionJtiStore();
    const jti = 'jti-test-1';
    await store.assertOnce(jti, 30);
    await expect(store.assertOnce(jti, 30)).rejects.toMatchObject({
      code: 'CLIENT_ASSERTION_REPLAY',
    });
    await store.close();
  });

  it('fails one of concurrent double-assert attempts', async () => {
    const store = new MemoryAssertionJtiStore();
    const jti = 'jti-concurrent';
    const results = await Promise.allSettled([
      store.assertOnce(jti, 30),
      store.assertOnce(jti, 30),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ActivityError);
    await store.close();
  });
});
