import { Redis } from 'ioredis';

import { ActivityError } from '../../domain/errors.js';

export interface AssertionJtiStore {
  assertOnce(jti: string, ttlSeconds: number): Promise<void>;
  close(): Promise<void>;
}

export class RedisAssertionJtiStore implements AssertionJtiStore {
  public constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
  ) {}

  public async assertOnce(jti: string, ttlSeconds: number): Promise<void> {
    const key = `${this.prefix}${jti}`;
    try {
      const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
      if (result !== 'OK') {
        throw new ActivityError('CLIENT_ASSERTION_REPLAY', 'Client assertion jti was already used');
      }
    } catch (error) {
      if (error instanceof ActivityError) {
        throw error;
      }
      throw new ActivityError(
        'CLIENT_ASSERTION_REPLAY',
        'Client assertion replay store is unavailable',
      );
    }
  }

  public async close(): Promise<void> {
    await this.redis.quit();
  }
}

export class MemoryAssertionJtiStore implements AssertionJtiStore {
  private readonly seen = new Map<string, ReturnType<typeof setTimeout>>();

  public assertOnce(jti: string, ttlSeconds: number): Promise<void> {
    if (this.seen.has(jti)) {
      return Promise.reject(
        new ActivityError('CLIENT_ASSERTION_REPLAY', 'Client assertion jti was already used'),
      );
    }
    const timeout = setTimeout(() => {
      this.seen.delete(jti);
    }, ttlSeconds * 1000);
    timeout.unref?.();
    this.seen.set(jti, timeout);
    return Promise.resolve();
  }

  public close(): Promise<void> {
    for (const timeout of this.seen.values()) {
      clearTimeout(timeout);
    }
    this.seen.clear();
    return Promise.resolve();
  }
}

export function createAssertionJtiStore(redisUrl: string, prefix: string): RedisAssertionJtiStore {
  return new RedisAssertionJtiStore(new Redis(redisUrl, { lazyConnect: false }), prefix);
}
