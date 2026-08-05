import { Redis } from 'ioredis';

import { IdentityError } from '../../domain/errors.js';

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
        throw new IdentityError('CLIENT_ASSERTION_REPLAY', 'Client assertion jti was already used');
      }
    } catch (error) {
      if (error instanceof IdentityError) {
        throw error;
      }
      throw new IdentityError(
        'CLIENT_ASSERTION_REPLAY',
        'Client assertion replay store is unavailable',
      );
    }
  }

  public async close(): Promise<void> {
    await this.redis.quit();
  }
}

export function createAssertionJtiStore(redisUrl: string, prefix: string): RedisAssertionJtiStore {
  return new RedisAssertionJtiStore(new Redis(redisUrl, { lazyConnect: false }), prefix);
}
