/**
 * Pipeline orchestrator — read-only visibility and control layer over the BullMQ-based pipeline.
 * Does NOT replace the existing worker-based flow.
 */

import { getQueue, QUEUE_NAMES } from '../lib/infra/queue.js';
import { getRedis } from '../lib/infra/redis.js';
import { EvidenceRepo } from '../ingestion/evidence.repo.js';
import type { EvidenceEventId, ProcessingState } from '../domain/types.js';

/** Human-readable stage definitions with ordering */
const STAGE_MAP: Record<string, { name: string; order: number }> = {
  [QUEUE_NAMES.EVIDENCE_INGEST]:         { name: 'Ingestion',             order: 1 },
  [QUEUE_NAMES.EXTRACTION_EXTRACT]:      { name: 'Extraction',            order: 2 },
  [QUEUE_NAMES.NORMALIZATION_NORMALIZE]: { name: 'Normalization',         order: 3 },
  [QUEUE_NAMES.IDENTITY_RESOLVE]:        { name: 'Identity Resolution',   order: 4 },
  [QUEUE_NAMES.DEDUP_CHECK]:             { name: 'Deduplication',         order: 5 },
  [QUEUE_NAMES.ASSIGNMENT_ASSIGN]:       { name: 'Assignment',            order: 6 },
  [QUEUE_NAMES.SYNC_PUSH]:              { name: 'Sync',                  order: 7 },
};

export interface PipelineStatus {
  evidenceEventId: EvidenceEventId;
  processingState: ProcessingState | null;
  stages: Array<{ queue: string; name: string; order: number }>;
}

export interface StageMetrics {
  queue: string;
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface PipelineMetrics {
  stages: StageMetrics[];
  totalWaiting: number;
  totalActive: number;
  totalCompleted: number;
  totalFailed: number;
}

const PAUSE_KEY_PREFIX = 'pipeline:paused:';

export class Pipeline {
  private evidenceRepo = new EvidenceRepo();

  /** Get current pipeline status for a given evidence event */
  async getStatus(evidenceEventId: EvidenceEventId): Promise<PipelineStatus> {
    const state = await this.evidenceRepo.getState(evidenceEventId);

    const stages = Object.entries(STAGE_MAP)
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([queue, info]) => ({ queue, name: info.name, order: info.order }));

    return {
      evidenceEventId,
      processingState: state,
      stages,
    };
  }

  /** Aggregate queue depths and job counts per stage */
  async getMetrics(): Promise<PipelineMetrics> {
    const stages: StageMetrics[] = [];
    let totalWaiting = 0;
    let totalActive = 0;
    let totalCompleted = 0;
    let totalFailed = 0;

    for (const [queueName, info] of Object.entries(STAGE_MAP)) {
      const queue = getQueue(queueName as keyof typeof QUEUE_NAMES extends never ? string : any);
      const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');

      const stageMetrics: StageMetrics = {
        queue: queueName,
        name: info.name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      };

      stages.push(stageMetrics);
      totalWaiting += stageMetrics.waiting;
      totalActive += stageMetrics.active;
      totalCompleted += stageMetrics.completed;
      totalFailed += stageMetrics.failed;
    }

    return { stages, totalWaiting, totalActive, totalCompleted, totalFailed };
  }

  /** Pause a specific pipeline stage (circuit breaker) */
  async pause(stage: string): Promise<void> {
    const redis = getRedis();
    await redis.set(`${PAUSE_KEY_PREFIX}${stage}`, '1');

    const queue = getQueue(stage as any);
    await queue.pause();
  }

  /** Resume a paused pipeline stage */
  async resume(stage: string): Promise<void> {
    const redis = getRedis();
    await redis.del(`${PAUSE_KEY_PREFIX}${stage}`);

    const queue = getQueue(stage as any);
    await queue.resume();
  }

  /** Check if a stage is paused */
  async isPaused(stage: string): Promise<boolean> {
    const redis = getRedis();
    const val = await redis.get(`${PAUSE_KEY_PREFIX}${stage}`);
    return val === '1';
  }
}
