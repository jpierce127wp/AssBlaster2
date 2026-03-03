import { Worker, type Job } from 'bullmq';
import { QUEUE_NAMES, type JobDataMap } from '../kernel/queue.js';
import { loadConfig } from '../kernel/config.js';
import { getLogger } from '../kernel/logger.js';
import { SyncService } from './sync.service.js';
import type { CanonicalTaskId } from '../kernel/types.js';

const syncService = new SyncService();

async function processSyncPush(job: Job<JobDataMap['sync.push']>): Promise<void> {
  const logger = getLogger();
  const { canonicalTaskId } = job.data;

  logger.info({ canonicalTaskId, jobId: job.id }, 'Processing sync push');

  const result = await syncService.syncToClio(canonicalTaskId as CanonicalTaskId);

  logger.info({ canonicalTaskId, action: result.action, clioTaskId: result.clio_task_id }, 'Sync push complete');
}

export function startSyncWorker(): Worker {
  const config = loadConfig();
  const logger = getLogger();

  const worker = new Worker(
    QUEUE_NAMES.SYNC_PUSH,
    processSyncPush,
    {
      connection: { url: config.redisUrl },
      concurrency: 3,
      limiter: { max: 5, duration: 1000 },
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job?.id }, 'Sync push job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Sync push job failed');
  });

  logger.info('Sync push worker started');
  return worker;
}
