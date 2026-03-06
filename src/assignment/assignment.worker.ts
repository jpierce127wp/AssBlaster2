import { Worker, type Job } from 'bullmq';
import { QUEUE_NAMES, getQueue, type JobDataMap } from '../lib/infra/queue.js';
import { loadConfig } from '../app/config.js';
import { getLogger } from '../observability/logger.js';
import { AssignmentService } from './assignment.service.js';
import type { CanonicalTaskId } from '../domain/types.js';

const assignmentService = new AssignmentService();

async function processAssignment(job: Job<JobDataMap['assignment.assign']>): Promise<void> {
  const logger = getLogger();
  const { evidenceEventId, canonicalTaskId, correlationId } = job.data;

  logger.info({ canonicalTaskId, evidenceEventId, correlationId, jobId: job.id }, 'Processing assignment');

  const result = await assignmentService.assign(canonicalTaskId as CanonicalTaskId);

  // Enqueue for sync with event contract
  const syncQueue = getQueue(QUEUE_NAMES.SYNC_PUSH);
  await syncQueue.add('push', {
    eventType: 'canonical_task.changed',
    schemaVersion: 1,
    canonicalTaskId,
    correlationId,
  }, {
    jobId: `sync-${canonicalTaskId}`,
  });

  logger.info({ canonicalTaskId, assignee: result.assignee_user_id, method: result.method }, 'Assignment done, queued for sync');
}

export function startAssignmentWorker(): Worker {
  const config = loadConfig();
  const logger = getLogger();

  const worker = new Worker(
    QUEUE_NAMES.ASSIGNMENT_ASSIGN,
    processAssignment,
    {
      connection: { url: config.redisUrl },
      concurrency: 5,
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job?.id }, 'Assignment job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Assignment job failed');
  });

  logger.info('Assignment worker started');
  return worker;
}
