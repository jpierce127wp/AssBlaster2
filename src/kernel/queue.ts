import { Queue } from 'bullmq';
import { loadConfig } from './config.js';
import { getLogger } from './logger.js';

/** All queue names in the pipeline */
export const QUEUE_NAMES = {
  EVIDENCE_INGEST: 'evidence.ingest',
  EXTRACTION_EXTRACT: 'extraction.extract',
  NORMALIZATION_NORMALIZE: 'normalization.normalize',
  IDENTITY_RESOLVE: 'identity.resolve',
  DEDUP_CHECK: 'dedup.check',
  ASSIGNMENT_ASSIGN: 'assignment.assign',
  SYNC_PUSH: 'sync.push',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Job data types for each queue */
export interface JobDataMap {
  'evidence.ingest': { evidenceEventId: string };
  'extraction.extract': { evidenceEventId: string };
  'normalization.normalize': { evidenceEventId: string; actionSpanIds: string[] };
  'identity.resolve': { evidenceEventId: string; candidateTaskIds: string[] };
  'dedup.check': { evidenceEventId: string; candidateTaskId: string };
  'assignment.assign': { evidenceEventId: string; canonicalTaskId: string };
  'sync.push': { canonicalTaskId: string };
}

const _queues = new Map<string, Queue>();

export function getQueue<N extends QueueName>(name: N): Queue<JobDataMap[N]> {
  let queue = _queues.get(name);
  if (!queue) {
    const config = loadConfig();
    queue = new Queue(name, {
      connection: { url: config.redisUrl },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
    _queues.set(name, queue);
    getLogger().info({ queue: name }, 'Queue created');
  }
  return queue as Queue<JobDataMap[N]>;
}

export async function closeQueues(): Promise<void> {
  for (const [name, queue] of _queues) {
    await queue.close();
    getLogger().info({ queue: name }, 'Queue closed');
  }
  _queues.clear();
}
