/**
 * Token-bucket rate limiter for Clio API calls.
 * Uses Redis sliding-window counter for distributed rate limiting.
 */

import { getRedis } from '../lib/infra/redis.js';
import { getLogger } from '../observability/logger.js';

const DEFAULT_CAPACITY = 10; // requests per second
const WINDOW_MS = 1000;      // 1 second window

export class RateLimiter {
  private readonly capacity: number;
  private readonly keyPrefix: string;

  constructor(options?: { capacity?: number; keyPrefix?: string }) {
    this.capacity = options?.capacity ?? DEFAULT_CAPACITY;
    this.keyPrefix = options?.keyPrefix ?? 'rate_limit:clio';
  }

  private getWindowKey(): string {
    const windowId = Math.floor(Date.now() / WINDOW_MS);
    return `${this.keyPrefix}:${windowId}`;
  }

  /** Blocking acquire — waits until a token is available */
  async acquire(): Promise<void> {
    const logger = getLogger();

    while (true) {
      if (await this.tryAcquireInternal()) {
        return;
      }

      logger.debug({ limiter: this.keyPrefix }, 'Rate limit reached, waiting');
      await this.sleep(100);
    }
  }

  /** Non-blocking check — returns false if rate limit would be exceeded */
  async tryAcquire(): Promise<boolean> {
    return this.tryAcquireInternal();
  }

  /** Wait for Retry-After header duration */
  async waitForRetryAfter(retryAfterSecs: number): Promise<void> {
    const logger = getLogger();
    const waitMs = retryAfterSecs * 1000;
    logger.info({ retryAfterSecs }, 'Waiting for Retry-After');
    await this.sleep(waitMs);
  }

  private async tryAcquireInternal(): Promise<boolean> {
    const redis = getRedis();
    const key = this.getWindowKey();

    const count = await redis.incr(key);

    // Set expiry on first request in window
    if (count === 1) {
      await redis.pexpire(key, WINDOW_MS * 2);
    }

    return count <= this.capacity;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
