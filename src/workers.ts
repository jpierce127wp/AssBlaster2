import { getLogger } from './observability/logger.js';
import { startEvidenceWorker } from './ingestion/evidence.worker.js';
import { startExtractionWorker } from './extraction/extraction.worker.js';
import { startNormalizationWorker } from './normalization/normalization.worker.js';
import { startIdentityWorker } from './resolution/identity.worker.js';
import { startDedupWorker } from './dedupe/dedup.worker.js';
import { startAssignmentWorker } from './assignment/assignment.worker.js';
import { startSyncWorker } from './sync/sync.worker.js';

export async function startWorkers(): Promise<void> {
  const logger = getLogger();

  startEvidenceWorker();
  startExtractionWorker();
  startNormalizationWorker();
  startIdentityWorker();
  startDedupWorker();
  startAssignmentWorker();
  startSyncWorker();

  logger.info('Workers bootstrap complete');
}
