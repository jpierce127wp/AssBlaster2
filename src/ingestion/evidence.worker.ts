import { Worker, type Job } from 'bullmq';
import { QUEUE_NAMES, getQueue, type JobDataMap } from '../lib/infra/queue.js';
import { loadConfig } from '../app/config.js';
import { getLogger } from '../observability/logger.js';
import { EvidenceService } from './evidence.service.js';
import { EvidenceRepo } from './evidence.repo.js';
import type { EvidenceEventId } from '../domain/types.js';

const evidenceService = new EvidenceService();
const evidenceRepo = new EvidenceRepo();

async function processIngest(job: Job<JobDataMap['evidence.ingest']>): Promise<void> {
  const logger = getLogger();
  const { evidenceEventId, correlationId } = job.data;

  // Idempotency guard: skip if already past ingest stage
  const currentState = await evidenceRepo.getState(evidenceEventId as EvidenceEventId);
  if (currentState && currentState !== 'received') {
    logger.info({ evidenceEventId, correlationId, currentState }, 'Evidence already past ingest stage, skipping');
    return;
  }

  logger.info({ evidenceEventId, correlationId, jobId: job.id }, 'Processing evidence ingest');

  // Step 1: Clean the evidence (skip if already cleaned on retry)
  const event = await evidenceRepo.findById(evidenceEventId as EvidenceEventId);
  if (event?.cleaned_text) {
    logger.info({ evidenceEventId }, 'Evidence already cleaned, skipping to extraction enqueue');
  } else {
    await evidenceService.cleanEvidence(evidenceEventId as EvidenceEventId);
  }

  // Step 2: Enqueue for extraction with event contract
  const extractionQueue = getQueue(QUEUE_NAMES.EXTRACTION_EXTRACT);
  await extractionQueue.add('extract', {
    eventType: 'evidence.received',
    schemaVersion: 1,
    evidenceEventId,
    correlationId,
  }, {
    jobId: `extract-${evidenceEventId}`,
  });

  logger.info({ evidenceEventId }, 'Evidence cleaned, queued for extraction');
}

export function startEvidenceWorker(): Worker {
  const config = loadConfig();
  const logger = getLogger();

  const worker = new Worker(
    QUEUE_NAMES.EVIDENCE_INGEST,
    processIngest,
    {
      connection: { url: config.redisUrl },
      concurrency: 5,
      limiter: { max: 10, duration: 1000 },
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job?.id }, 'Evidence ingest job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Evidence ingest job failed');
  });

  logger.info('Evidence ingest worker started');
  return worker;
}
