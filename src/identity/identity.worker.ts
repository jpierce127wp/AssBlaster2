import { Worker, type Job } from 'bullmq';
import { QUEUE_NAMES, getQueue, type JobDataMap } from '../kernel/queue.js';
import { loadConfig } from '../kernel/config.js';
import { getLogger } from '../kernel/logger.js';
import { IdentityService } from './identity.service.js';
import type { EvidenceEventId } from '../kernel/types.js';

const identityService = new IdentityService();

async function processIdentityResolve(job: Job<JobDataMap['identity.resolve']>): Promise<void> {
  const logger = getLogger();
  const { evidenceEventId, candidateTaskIds } = job.data;

  logger.info({ evidenceEventId, jobId: job.id, taskCount: candidateTaskIds.length }, 'Processing identity resolution');

  const result = await identityService.resolve(
    evidenceEventId as EvidenceEventId,
    candidateTaskIds,
  );

  // Enqueue each resolved candidate task for dedup individually
  const dedupQueue = getQueue(QUEUE_NAMES.DEDUP_CHECK);
  for (let i = 0; i < result.resolvedCandidateTaskIds.length; i++) {
    const candidateTaskId = result.resolvedCandidateTaskIds[i]!;
    await dedupQueue.add('check', {
      evidenceEventId,
      candidateTaskId,
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
