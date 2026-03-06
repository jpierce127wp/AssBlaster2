import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis and Logger
const mockRedis = {
  zadd: vi.fn(),
  expire: vi.fn(),
  zrange: vi.fn(),
};
vi.mock('../../src/lib/infra/redis.js', () => ({
  getRedis: () => mockRedis,
}));
vi.mock('../../src/observability/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

import { traceStage, getTrace } from '../../src/observability/tracing.js';

describe('traceStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.zadd.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
  });

  it('records start and completed entries on success', async () => {
    const result = await traceStage('extraction', 'ev-001', async () => 'done');

    expect(result).toBe('done');
    // Should call zadd twice: once for start, once for completed
    expect(mockRedis.zadd).toHaveBeenCalledTimes(2);
    // Should set expire twice
    expect(mockRedis.expire).toHaveBeenCalledTimes(2);

    // Verify first call has 'started' status
    const startEntry = JSON.parse(mockRedis.zadd.mock.calls[0]![2]);
    expect(startEntry.status).toBe('started');
    expect(startEntry.stage).toBe('extraction');
    expect(startEntry.entityId).toBe('ev-001');

    // Verify second call has 'completed' status
    const completedEntry = JSON.parse(mockRedis.zadd.mock.calls[1]![2]);
    expect(completedEntry.status).toBe('completed');
    expect(completedEntry.durationMs).toBeTypeOf('number');
  });

  it('records failed entry and re-throws on error', async () => {
    const error = new Error('extraction failed');

    await expect(
      traceStage('extraction', 'ev-002', async () => {
        throw error;
      }),
    ).rejects.toThrow('extraction failed');

    // Should call zadd twice: start + failed
    expect(mockRedis.zadd).toHaveBeenCalledTimes(2);

    const failedEntry = JSON.parse(mockRedis.zadd.mock.calls[1]![2]);
    expect(failedEntry.status).toBe('failed');
    expect(failedEntry.metadata?.error).toContain('extraction failed');
  });

  it('uses correct Redis key format', async () => {
    await traceStage('normalization', 'ev-003', async () => null);

    expect(mockRedis.zadd.mock.calls[0]![0]).toBe('trace:ev-003');
  });

  it('sets TTL to 3600 seconds', async () => {
    await traceStage('dedup', 'ev-004', async () => null);

    expect(mockRedis.expire).toHaveBeenCalledWith('trace:ev-004', 3600);
  });
});

describe('getTrace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses Redis zrange results', async () => {
    const entries = [
      JSON.stringify({ stage: 'extraction', entityId: 'ev-001', status: 'started', startedAt: '2026-03-01T10:00:00Z', endedAt: null, durationMs: null }),
      JSON.stringify({ stage: 'extraction', entityId: 'ev-001', status: 'completed', startedAt: '2026-03-01T10:00:00Z', endedAt: '2026-03-01T10:00:01Z', durationMs: 1000 }),
    ];
    mockRedis.zrange.mockResolvedValue(entries);

    const trace = await getTrace('ev-001');
    expect(trace).toHaveLength(2);
    expect(trace[0]!.status).toBe('started');
    expect(trace[1]!.status).toBe('completed');
    expect(trace[1]!.durationMs).toBe(1000);
  });

  it('returns empty array for missing key', async () => {
    mockRedis.zrange.mockResolvedValue([]);

    const trace = await getTrace('nonexistent');
    expect(trace).toEqual([]);
  });

  it('queries correct key', async () => {
    mockRedis.zrange.mockResolvedValue([]);

    await getTrace('ev-005');
    expect(mockRedis.zrange).toHaveBeenCalledWith('trace:ev-005', 0, -1);
  });
});
