import { Redis } from 'ioredis';

export async function pingRedis(url: string): Promise<void> {
  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2_000,
  });
  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong !== 'PONG') {
      throw new Error('Redis ping failed');
    }
  } finally {
    redis.disconnect();
  }
}
