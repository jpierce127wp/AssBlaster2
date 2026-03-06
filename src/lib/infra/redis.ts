import { Redis } from 'ioredis';
import { getLogger } from '../../observability/logger.js';

let _redis: Redis | null = null;

export function createRedis(url: string): Redis {
  if (_redis) return _redis;

  _redis = new Redis(url, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: true,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 5000);
      return delay;
    },
  });

  _redis.on('error', (err: Error) => {
    getLogger().error({ err }, 'Redis connection error');
  });

  return _redis;
}

export function getRedis(): Redis {
  if (!_redis) {
    throw new Error('Redis not initialized. Call createRedis() first.');
  }
  return _redis;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}