import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Pipeline } from './pipeline.js';
import { ValidationError } from '../domain/errors.js';
import { getQueue, QUEUE_NAMES } from '../lib/infra/queue.js';

const pipeline = new Pipeline();

const VALID_STAGES = new Set(Object.values(QUEUE_NAMES));

function validateStage(stage: string): void {
  if (!VALID_STAGES.has(stage as any)) {
    throw new ValidationError(`Invalid stage: ${stage}. Valid: ${[...VALID_STAGES].join(', ')}`);
  }
}

export async function pipelineRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/v1/pipeline/metrics — Aggregate queue depths per stage */
  app.get('/pipeline/metrics', async (_request: FastifyRequest, reply: FastifyReply) => {
    const metrics = await pipeline.getMetrics();
    return reply.send(metrics);
  });

  /** POST /api/v1/pipeline/pause/:stage — Pause a pipeline stage */
  app.post('/pipeline/pause/:stage', async (request: FastifyRequest<{ Params: { stage: string } }>, reply: FastifyReply) => {
    validateStage(request.params.stage);
    await pipeline.pause(request.params.stage);
    return reply.send({ message: `Stage ${request.params.stage} paused` });
  });

  /** POST /api/v1/pipeline/resume/:stage — Resume a paused pipeline stage */
  app.post('/pipeline/resume/:stage', async (request: FastifyRequest<{ Params: { stage: string } }>, reply: FastifyReply) => {
    validateStage(request.params.stage);
    await pipeline.resume(request.params.stage);
    return reply.send({ message: `Stage ${request.params.stage} resumed` });
  });

  /** GET /api/v1/pipeline/failed-jobs — List failed jobs across all stages */
  app.get('/pipeline/failed-jobs', async (
    request: FastifyRequest<{ Querystring: { stage?: string; limit?: string } }>,
    reply: FastifyReply,
  ) => {
    const limit = Math.min(parseInt(request.query.limit ?? '50', 10) || 50, 200);
    const stagesToQuery = request.query.stage
      ? [request.query.stage]
      : Object.values(QUEUE_NAMES);

    if (request.query.stage) validateStage(request.query.stage);

    const failedJobs: Array<{
      stage: string;
      jobId: string | undefined;
      name: string;
      failedReason: string | undefined;
      attemptsMade: number;
      timestamp: number | undefined;
      data: unknown;
    }> = [];

    for (const stage of stagesToQuery) {
      const queue = getQueue(stage as any);
      const jobs = await queue.getFailed(0, limit);
      for (const job of jobs) {
        failedJobs.push({
          stage,
          jobId: job.id,
          name: job.name,
          failedReason: job.failedReason,
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
          data: job.data,
        });
      }
    }

    // Sort by timestamp descending (most recent first)
    failedJobs.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

    return reply.send({ items: failedJobs.slice(0, limit), total: failedJobs.length });
  });

  /** POST /api/v1/pipeline/retry-failed/:stage — Retry all failed jobs in a stage */
  app.post('/pipeline/retry-failed/:stage', async (request: FastifyRequest<{ Params: { stage: string } }>, reply: FastifyReply) => {
    validateStage(request.params.stage);
    const queue = getQueue(request.params.stage as any);
    const failedJobs = await queue.getFailed(0, 1000);

    let retried = 0;
    for (const job of failedJobs) {
      await job.retry();
      retried++;
    }

    return reply.send({ message: `Retried ${retried} failed jobs in ${request.params.stage}`, retried });
  });
}
