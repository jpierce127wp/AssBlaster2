/**
 * Matter-Scoped Distributed Locking
 *
 * Redis-based lock using SET NX EX pattern to serialize
 * registry mutations within the same matter.
 */

import { randomUUID } from 'node:crypto';
import { getRedis } from './redis.js';
import { getLogger } from './logger.js';

const DEFAULT_TTL_MS = 30_000;
const RETRY_DELAY_MS = 50;
const MAX_RETRIES = 20;

function lockKey(matterId: string): string {
  return `lock:matter:${matterId}`;
}

export async function acquireMatterLock(
  matterId: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<string | null> {
  const redis = getRedis();
  const lockId = randomUUID();
  const ttlSeconds = Math.ceil(ttlMs / 1000);

  const result = await redis.set(lockKey(matterId), lockId, 'EX', ttlSeconds, 'NX');
  return result === 'OK' ? lockId : null;
}

export async function releaseMatterLock(
  matterId: string,
  lockId: string,
): Promise<void> {
  const redis = getRedis();
  const key = lockKey(matterId);

  // Only release if we still own the lock (Lua script for atomicity)
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(script, 1, key, lockId);
}

export async function withMatterLock<T>(
  matterId: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  // If no matterId, run without locking (triage path)
  if (!matterId) {
    return fn();
  }

  const logger = getLogger();

  // Retry loop to acquire lock
  let lockId: string | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    lockId = await acquireMatterLock(matterId);
    if (lockId) break;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  }

  if (!lockId) {
    logger.warn({ matterId }, 'Failed to acquire matter lock after retries, proceeding without lock');
    return fn();
  }

  try {
    return await fn();
  } finally {
    await releaseMatterLock(matterId, lockId);
  }
}
