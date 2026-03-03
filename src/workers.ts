import { getLogger } from './kernel/logger.js';
import { startEvidenceWorker } from './evidence/evidence.worker.js';
import { startExtractionWorker } from './extraction/extraction.worker.js';
import { startNormalizationWorker } from './normalization/normalization.worker.js';
import { startIdentityWorker } from './identity/identity.worker.js';
import { startDedupWorker } from './dedup/dedup.worker.js';
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
