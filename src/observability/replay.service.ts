import { getLogger } from '../observability/logger.js';
import { getQueue, QUEUE_NAMES } from '../lib/infra/queue.js';
import { EvidenceRepo } from '../ingestion/evidence.repo.js';
import { ActionSpanRepo } from '../extraction/extraction.repo.js';
import { CandidateTaskRepo } from '../normalization/normalization.repo.js';
import { AuditRepo } from './audit.repo.js';
import type { EvidenceEventId } from '../domain/types.js';

export class ReplayService {
  private evidenceRepo = new EvidenceRepo();
  private actionSpanRepo = new ActionSpanRepo();
  private candidateTaskRepo = new CandidateTaskRepo();
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

    const jobId = `replay-${stage}-${evidenceEventId}-${Date.now()}`;

    switch (stage) {
      case 'ingest':
      case 'extract': {
        const queueName = stage === 'ingest' ? QUEUE_NAMES.EVIDENCE_INGEST : QUEUE_NAMES.EXTRACTION_EXTRACT;
        const queue = getQueue(queueName);
        await queue.add('replay', {
          eventType: 'evidence.received' as const,
          schemaVersion: 1 as const,
          evidenceEventId,
        }, { jobId });
        break;
      }
      case 'normalize': {
        const spans = await this.actionSpanRepo.findByEvidenceId(evidenceEventId);
        if (spans.length === 0) return { replayed: false, message: 'No action spans found for evidence event' };
        const queue = getQueue(QUEUE_NAMES.NORMALIZATION_NORMALIZE);
        await queue.add('replay', {
          eventType: 'action_spans.extracted' as const,
          schemaVersion: 1 as const,
          evidenceEventId,
          actionSpanIds: spans.map(s => s.id),
        }, { jobId });
        break;
      }
      case 'resolve': {
        const tasks = await this.candidateTaskRepo.findByEvidenceId(evidenceEventId);
        if (tasks.length === 0) return { replayed: false, message: 'No candidate tasks found for evidence event' };
        const queue = getQueue(QUEUE_NAMES.IDENTITY_RESOLVE);
        await queue.add('replay', {
          eventType: 'candidate_tasks.normalized' as const,
          schemaVersion: 1 as const,
          evidenceEventId,
          candidateTaskIds: tasks.map(t => t.id),
        }, { jobId });
        break;
      }
      case 'dedup': {
        const tasks = await this.candidateTaskRepo.findByEvidenceId(evidenceEventId);
        if (tasks.length === 0) return { replayed: false, message: 'No candidate tasks found for evidence event' };
        const dedupQueue = getQueue(QUEUE_NAMES.DEDUP_CHECK);
        for (let i = 0; i < tasks.length; i++) {
          await dedupQueue.add('replay', {
            eventType: 'candidate_task.resolved' as const,
            schemaVersion: 1 as const,
            evidenceEventId,
            candidateTaskId: tasks[i]!.id,
          }, { jobId: `${jobId}-${i}` });
        }
        break;
      }
    }

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
