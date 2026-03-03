import { Worker, type Job } from 'bullmq';
import { QUEUE_NAMES, getQueue, type JobDataMap } from '../kernel/queue.js';
import { loadConfig } from '../kernel/config.js';
import { getLogger } from '../kernel/logger.js';
import { DedupService } from './dedup.service.js';
import type { CandidateTaskId, EvidenceEventId } from '../kernel/types.js';

const dedupService = new DedupService();

async function processDedupCheck(job: Job<JobDataMap['dedup.check']>): Promise<void> {
  const logger = getLogger();
  const { evidenceEventId, candidateTaskId } = job.data;

  if (!candidateTaskId) {
    logger.warn({ jobId: job.id }, 'No candidateTaskId in dedup job data');
    return;
  }

  const { decision, canonicalTaskId } = await dedupService.checkAndProcess(
    evidenceEventId as EvidenceEventId,
    candidateTaskId as CandidateTaskId,
  );

  // Terminal states that don't need assignment
  if (decision.action === 'review' || decision.action === 'discard') {
    logger.info({ evidenceEventId, action: decision.action }, `Dedup ${decision.action}`);
    return;
  }

  // Enrich doesn't need re-assignment (task already exists)
  if (decision.action === 'enrich') {
    logger.info({ canonicalTaskId, action: 'enrich' }, 'Dedup enriched existing task');
    return;
  }

  // Create, merge, and follow_up all produce a canonical task that needs assignment
  if (canonicalTaskId) {
    const assignQueue = getQueue(QUEUE_NAMES.ASSIGNMENT_ASSIGN);
    await assignQueue.add('assign', {
      eventType: 'candidate_task.decided',
      schemaVersion: 1,
      evidenceEventId,
      canonicalTaskId,
    }, {
      jobId: `assign-${canonicalTaskId}-${evidenceEventId}`,
    });

    logger.info({ canonicalTaskId, decision: decision.action }, 'Dedup done, queued for assignment');
  }
}

export function startDedupWorker(): Worker {
  const config = loadConfig();
  const logger = getLogger();

  const worker = new Worker(
    QUEUE_NAMES.DEDUP_CHECK,
    processDedupCheck,
    {
      connection: { url: config.redisUrl },
      concurrency: 3,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job?.id }, 'Dedup job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Dedup job failed');
  });

  logger.info('Dedup worker started');
  return worker;
}
