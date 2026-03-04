import { getLogger } from '../observability/logger.js';
import { getQueue, QUEUE_NAMES } from '../lib/infra/queue.js';
import { EvidenceRepo } from '../ingestion/evidence.repo.js';
import { AuditRepo } from './audit.repo.js';
import type { EvidenceEventId } from '../domain/types.js';

export class ReplayService {
  private evidenceRepo = new EvidenceRepo();
  private auditRepo = new AuditRepo();

  /** Replay an evidence event through the pipeline from the beginning */
  async replayFromStart(evidenceEventId: EvidenceEventId): Promise<{ replayed: boolean; message: string }> {
    const logger = getLogger();
    const event = await this.evidenceRepo.findById(evidenceEventId);

    if (!event) {
      return { replayed: false, message: `Evidence event not found: ${evidenceEventId}` };
    }

    // Reset state to received
    await this.evidenceRepo.updateState(evidenceEventId, 'received');

    // Re-enqueue for processing with event contract
    const queue = getQueue(QUEUE_NAMES.EVIDENCE_INGEST);
    await queue.add('replay', {
      eventType: 'evidence.received' as const,
      schemaVersion: 1 as const,
      evidenceEventId,
    }, {
      jobId: `replay-${evidenceEventId}-${Date.now()}`,
    });

    await this.auditRepo.log({
      entityType: 'evidence_event',
      entityId: evidenceEventId,
      action: 'replayed',
      summary: `Replay started from beginning`,
      metadata: { original_state: event.processing_state },
    });

    logger.info({ evidenceEventId, originalState: event.processing_state }, 'Replay started');
    return { replayed: true, message: 'Evidence event re-queued for processing' };
  }

  /** Replay from a specific pipeline stage */
  async replayFromStage(
    evidenceEventId: EvidenceEventId,
    stage: 'ingest' | 'extract' | 'normalize' | 'resolve' | 'dedup',
  ): Promise<{ replayed: boolean; message: string }> {
    const logger = getLogger();
    const event = await this.evidenceRepo.findById(evidenceEventId);

    if (!event) {
      return { replayed: false, message: `Evidence event not found: ${evidenceEventId}` };
    }

    const stageQueueMap: Record<string, string> = {
      ingest: QUEUE_NAMES.EVIDENCE_INGEST,
      extract: QUEUE_NAMES.EXTRACTION_EXTRACT,
      normalize: QUEUE_NAMES.NORMALIZATION_NORMALIZE,
      resolve: QUEUE_NAMES.IDENTITY_RESOLVE,
      dedup: QUEUE_NAMES.DEDUP_CHECK,
    };

    const queueName = stageQueueMap[stage];
    if (!queueName) {
      return { replayed: false, message: `Unknown stage: ${stage}` };
    }

    const queue = getQueue(queueName as any);
    await queue.add('replay', { evidenceEventId } as any, {
      jobId: `replay-${stage}-${evidenceEventId}-${Date.now()}`,
    });

    await this.auditRepo.log({
      entityType: 'evidence_event',
      entityId: evidenceEventId,
      action: 'replayed',
      summary: `Replay started from ${stage} stage`,
      metadata: { stage, original_state: event.processing_state },
    });

    logger.info({ evidenceEventId, stage }, 'Stage replay started');
    return { replayed: true, message: `Re-queued from ${stage} stage` };
  }
}
