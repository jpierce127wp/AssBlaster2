import { Worker, type Job } from 'bullmq';
import { QUEUE_NAMES, getQueue, type JobDataMap } from '../kernel/queue.js';
import { loadConfig } from '../kernel/config.js';
import { getLogger } from '../kernel/logger.js';
import { ExtractionService } from './extraction.service.js';
import type { EvidenceEventId } from '../kernel/types.js';

const extractionService = new ExtractionService();

async function processExtraction(job: Job<JobDataMap['extraction.extract']>): Promise<void> {
  const logger = getLogger();
  const { evidenceEventId } = job.data;

  logger.info({ evidenceEventId, jobId: job.id }, 'Processing extraction');

  const result = await extractionService.extract(evidenceEventId as EvidenceEventId);

  if (result.actionSpanIds.length === 0) {
    logger.info({ evidenceEventId }, 'No action spans extracted, pipeline ends');
    return;
  }

  // Enqueue for normalization with action span IDs
  const normQueue = getQueue(QUEUE_NAMES.NORMALIZATION_NORMALIZE);
  await normQueue.add('normalize', {
    evidenceEventId,
    actionSpanIds: result.actionSpanIds,
  }, {
    jobId: `normalize-${evidenceEventId}`,
  });

  logger.info({ evidenceEventId, spanCount: result.actionSpanIds.length }, 'Extraction done, queued for normalization');
}

export function startExtractionWorker(): Worker {
  const config = loadConfig();
  const logger = getLogger();

  const worker = new Worker(
    QUEUE_NAMES.EXTRACTION_EXTRACT,
    processExtraction,
    {
      connection: { url: config.redisUrl },
      concurrency: 3,
      limiter: { max: 5, duration: 1000 },
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job?.id }, 'Extraction job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Extraction job failed');
  });

  logger.info('Extraction worker started');
  return worker;
}
