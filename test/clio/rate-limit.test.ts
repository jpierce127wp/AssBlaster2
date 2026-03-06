import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis and Logger
const mockRedis = {
  incr: vi.fn(),
  pexpire: vi.fn(),
};
vi.mock('../../src/lib/infra/redis.js', () => ({
  getRedis: () => mockRedis,
}));
vi.mock('../../src/observability/logger.js', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { RateLimiter } from '../../src/clio/rate-limit.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tryAcquire', () => {
    it('returns true when under capacity', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.pexpire.mockResolvedValue(1);

      const limiter = new RateLimiter({ capacity: 10 });
      const result = await limiter.tryAcquire();
      expect(result).toBe(true);
    });

    it('returns true when exactly at capacity', async () => {
      mockRedis.incr.mockResolvedValue(10);

      const limiter = new RateLimiter({ capacity: 10 });
      const result = await limiter.tryAcquire();
      expect(result).toBe(true);
    });

    it('returns false when over capacity', async () => {
      mockRedis.incr.mockResolvedValue(11);

      const limiter = new RateLimiter({ capacity: 10 });
      const result = await limiter.tryAcquire();
      expect(result).toBe(false);
    });

    it('sets pexpire on first request in window', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.pexpire.mockResolvedValue(1);

      const limiter = new RateLimiter();
      await limiter.tryAcquire();

      expect(mockRedis.pexpire).toHaveBeenCalled();
    });

    it('does not set pexpire on subsequent requests', async () => {
      mockRedis.incr.mockResolvedValue(5);

      const limiter = new RateLimiter();
      await limiter.tryAcquire();

      expect(mockRedis.pexpire).not.toHaveBeenCalled();
    });
  });

  describe('acquire', () => {
    it('resolves immediately when under capacity', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.pexpire.mockResolvedValue(1);

      const limiter = new RateLimiter();
      await expect(limiter.acquire()).resolves.toBeUndefined();
    });

    it('retries when rate limited then succeeds', async () => {
      // First call: over capacity. Second call: under capacity.
      mockRedis.incr.mockResolvedValueOnce(11).mockResolvedValueOnce(1);
      mockRedis.pexpire.mockResolvedValue(1);

      const limiter = new RateLimiter({ capacity: 10 });
      await expect(limiter.acquire()).resolves.toBeUndefined();
      expect(mockRedis.incr).toHaveBeenCalledTimes(2);
    });
  });

  describe('waitForRetryAfter', () => {
    it('waits for the specified duration', async () => {
      vi.useFakeTimers();

      const limiter = new RateLimiter();
      const promise = limiter.waitForRetryAfter(2);

      // Advance past the 2-second wait
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      vi.useRealTimers();
    });
  });
});
