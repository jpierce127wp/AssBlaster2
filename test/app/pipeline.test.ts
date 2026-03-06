import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis, queue, and EvidenceRepo
const mockRedis = {
  set: vi.fn(),
  del: vi.fn(),
  get: vi.fn(),
};
const mockQueue = {
  getJobCounts: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
};
const mockEvidenceRepo = {
  getState: vi.fn(),
};

vi.mock('../../src/lib/infra/redis.js', () => ({
  getRedis: () => mockRedis,
}));
vi.mock('../../src/lib/infra/queue.js', () => ({
  getQueue: () => mockQueue,
  QUEUE_NAMES: {
    EVIDENCE_INGEST: 'evidence.ingest',
    EXTRACTION_EXTRACT: 'extraction.extract',
    NORMALIZATION_NORMALIZE: 'normalization.normalize',
    IDENTITY_RESOLVE: 'identity.resolve',
    DEDUP_CHECK: 'dedup.check',
    ASSIGNMENT_ASSIGN: 'assignment.assign',
    SYNC_PUSH: 'sync.push',
  },
}));
vi.mock('../../src/ingestion/evidence.repo.js', () => ({
  EvidenceRepo: vi.fn().mockImplementation(() => mockEvidenceRepo),
}));

import { Pipeline } from '../../src/app/pipeline.js';

describe('Pipeline', () => {
  let pipeline: Pipeline;

  beforeEach(() => {
    vi.clearAllMocks();
    pipeline = new Pipeline();
  });

  describe('getStatus', () => {
    it('returns processing state and sorted stages', async () => {
      mockEvidenceRepo.getState.mockResolvedValue('extracting');

      const status = await pipeline.getStatus('ev-001' as any);

      expect(status.evidenceEventId).toBe('ev-001');
      expect(status.processingState).toBe('extracting');
      expect(status.stages).toHaveLength(7);
      // Stages should be in order
      expect(status.stages[0]!.order).toBe(1);
      expect(status.stages[0]!.name).toBe('Ingestion');
      expect(status.stages[6]!.order).toBe(7);
      expect(status.stages[6]!.name).toBe('Sync');
    });

    it('returns null state for unknown evidence event', async () => {
      mockEvidenceRepo.getState.mockResolvedValue(null);

      const status = await pipeline.getStatus('unknown' as any);
      expect(status.processingState).toBeNull();
    });
  });

  describe('getMetrics', () => {
    it('aggregates counts across all 7 queues', async () => {
      mockQueue.getJobCounts.mockResolvedValue({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 1,
        delayed: 0,
      });

      const metrics = await pipeline.getMetrics();

      expect(metrics.stages).toHaveLength(7);
      expect(metrics.totalWaiting).toBe(35); // 5 * 7
      expect(metrics.totalActive).toBe(14);  // 2 * 7
      expect(metrics.totalCompleted).toBe(700); // 100 * 7
      expect(metrics.totalFailed).toBe(7); // 1 * 7
    });

    it('handles zero counts', async () => {
      mockQueue.getJobCounts.mockResolvedValue({
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      });

      const metrics = await pipeline.getMetrics();
      expect(metrics.totalWaiting).toBe(0);
      expect(metrics.totalFailed).toBe(0);
    });
  });

  describe('pause', () => {
    it('sets Redis key and pauses queue', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockQueue.pause.mockResolvedValue(undefined);

      await pipeline.pause('evidence.ingest');

      expect(mockRedis.set).toHaveBeenCalledWith('pipeline:paused:evidence.ingest', '1');
      expect(mockQueue.pause).toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    it('deletes Redis key and resumes queue', async () => {
      mockRedis.del.mockResolvedValue(1);
      mockQueue.resume.mockResolvedValue(undefined);

      await pipeline.resume('evidence.ingest');

      expect(mockRedis.del).toHaveBeenCalledWith('pipeline:paused:evidence.ingest');
      expect(mockQueue.resume).toHaveBeenCalled();
    });
  });

  describe('isPaused', () => {
    it('returns true when Redis key is set', async () => {
      mockRedis.get.mockResolvedValue('1');

      const paused = await pipeline.isPaused('evidence.ingest');
      expect(paused).toBe(true);
    });

    it('returns false when Redis key is not set', async () => {
      mockRedis.get.mockResolvedValue(null);

      const paused = await pipeline.isPaused('evidence.ingest');
      expect(paused).toBe(false);
    });
  });
});
