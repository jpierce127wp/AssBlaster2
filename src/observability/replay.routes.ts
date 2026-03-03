import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ReplayService } from './replay.service.js';
import { ValidationError } from '../kernel/errors.js';
import type { EvidenceEventId } from '../kernel/types.js';

const replayService = new ReplayService();

export async function replayRoutes(app: FastifyInstance): Promise<void> {
  /** POST /api/v1/replay/:evidenceEventId — Replay from start */
  app.post('/replay/:evidenceEventId', async (request: FastifyRequest<{ Params: { evidenceEventId: string } }>, reply: FastifyReply) => {
    const result = await replayService.replayFromStart(request.params.evidenceEventId as EvidenceEventId);
    return reply.send(result);
  });

  /** POST /api/v1/replay/:evidenceEventId/:stage — Replay from stage */
  app.post('/replay/:evidenceEventId/:stage', async (
    request: FastifyRequest<{ Params: { evidenceEventId: string; stage: string } }>,
    reply: FastifyReply,
  ) => {
    const validStages = ['ingest', 'extract', 'normalize', 'resolve', 'dedup'];
    if (!validStages.includes(request.params.stage)) {
      throw new ValidationError(`Invalid stage: ${request.params.stage}. Valid: ${validStages.join(', ')}`);
    }

    const result = await replayService.replayFromStage(
      request.params.evidenceEventId as EvidenceEventId,
      request.params.stage as any,
    );
    return reply.send(result);
  });
}
