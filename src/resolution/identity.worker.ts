import { Worker, type Job } from 'bullmq';
import { QUEUE_NAMES, getQueue, type JobDataMap } from '../lib/infra/queue.js';
import { loadConfig } from '../app/config.js';
import { getLogger } from '../observability/logger.js';
import { IdentityService } from './identity.service.js';
import { EvidenceRepo } from '../ingestion/evidence.repo.js';
import type { EvidenceEventId } from '../domain/types.js';

const identityService = new IdentityService();
const evidenceRepo = new EvidenceRepo();

async function processIdentityResolve(job: Job<JobDataMap['identity.resolve']>): Promise<void> {
  const logger = getLogger();
  const { evidenceEventId, candidateTaskIds, correlationId } = job.data;

  // Idempotency guard: skip if already past resolution stage
  const currentState = await evidenceRepo.getState(evidenceEventId as EvidenceEventId);
  if (currentState && currentState !== 'normalized') {
    logger.info({ evidenceEventId, correlationId, currentState }, 'Evidence already past resolution stage, skipping');
    return;
  }

  logger.info({ evidenceEventId, correlationId, jobId: job.id, taskCount: candidateTaskIds.length }, 'Processing identity resolution');

  const result = await identityService.resolve(
    evidenceEventId as EvidenceEventId,
    candidateTaskIds,
  );

  // Enqueue each resolved candidate task for dedup individually with event contract
  const dedupQueue = getQueue(QUEUE_NAMES.DEDUP_CHECK);
  for (let i = 0; i < result.resolvedCandidateTaskIds.length; i++) {
    const candidateTaskId = result.resolvedCandidateTaskIds[i]!;
    await dedupQueue.add('check', {
      eventType: 'candidate_task.resolved',
      schemaVersion: 1,
      evidenceEventId,
      candidateTaskId,
      correlationId,
    }, {
      jobId: `dedup-${evidenceEventId}-${i}`,
    });
  }

  logger.info({ evidenceEventId, taskCount: result.resolvedCandidateTaskIds.length }, 'Identity resolved, queued for dedup');
}

export function startIdentityWorker(): Worker {
  const config = loadConfig();
  const logger = getLogger();

  const worker = new Worker(
    QUEUE_NAMES.IDENTITY_RESOLVE,
    processIdentityResolve,
    {
      connection: { url: config.redisUrl },
      concurrency: 5,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job?.id }, 'Identity resolve job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Identity resolve job failed');
  });

  logger.info('Identity resolve worker started');
  return worker;
}
