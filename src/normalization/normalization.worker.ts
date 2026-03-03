import { Worker, type Job } from 'bullmq';
import { QUEUE_NAMES, getQueue, type JobDataMap } from '../kernel/queue.js';
import { loadConfig } from '../kernel/config.js';
import { getLogger } from '../kernel/logger.js';
import { NormalizationService } from './normalization.service.js';
import type { EvidenceEventId } from '../kernel/types.js';

const normalizationService = new NormalizationService();

async function processNormalization(job: Job<JobDataMap['normalization.normalize']>): Promise<void> {
  const logger = getLogger();
  const { evidenceEventId, actionSpanIds } = job.data;

  logger.info({ evidenceEventId, jobId: job.id, spanCount: actionSpanIds.length }, 'Processing normalization');

  const result = await normalizationService.normalize(
    evidenceEventId as EvidenceEventId,
    actionSpanIds,
  );

  if (result.candidateTaskIds.length === 0) {
    logger.info({ evidenceEventId }, 'No candidate tasks after normalization');
    return;
  }

  // Enqueue for identity resolution
  const identityQueue = getQueue(QUEUE_NAMES.IDENTITY_RESOLVE);
  await identityQueue.add('resolve', {
    evidenceEventId,
    candidateTaskIds: result.candidateTaskIds,
  }, {
    jobId: `resolve-${evidenceEventId}`,
  });

  logger.info({ evidenceEventId, taskCount: result.candidateTaskIds.length }, 'Normalization done, queued for identity resolution');
}

export function startNormalizationWorker(): Worker {
  const config = loadConfig();
  const logger = getLogger();

  const worker = new Worker(
    QUEUE_NAMES.NORMALIZATION_NORMALIZE,
    processNormalization,
    {
      connection: { url: config.redisUrl },
      concurrency: 3,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job?.id }, 'Normalization job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Normalization job failed');
  });

  logger.info('Normalization worker started');
  return worker;
}
