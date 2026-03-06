import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ReplayService } from './replay.service.js';
import { ValidationError } from '../domain/errors.js';
import { validateId } from '../lib/schema/index.js';
import type { EvidenceEventId } from '../domain/types.js';

const replayService = new ReplayService();

const VALID_STAGES = ['ingest', 'extract', 'normalize', 'resolve', 'dedup'] as const;
type ReplayStage = typeof VALID_STAGES[number];

export async function replayRoutes(app: FastifyInstance): Promise<void> {
  /** POST /api/v1/replay/:evidenceEventId — Replay from start */
  app.post('/replay/:evidenceEventId', async (request: FastifyRequest<{ Params: { evidenceEventId: string } }>, reply: FastifyReply) => {
    validateId(request.params.evidenceEventId, 'EvidenceEventId');
    const result = await replayService.replayFromStart(request.params.evidenceEventId as EvidenceEventId);
    return reply.send(result);
  });

  /** POST /api/v1/replay/:evidenceEventId/:stage — Replay from stage */
  app.post('/replay/:evidenceEventId/:stage', async (
    request: FastifyRequest<{ Params: { evidenceEventId: string; stage: string } }>,
    reply: FastifyReply,
  ) => {
    validateId(request.params.evidenceEventId, 'EvidenceEventId');
    if (!VALID_STAGES.includes(request.params.stage as ReplayStage)) {
      throw new ValidationError(`Invalid stage: ${request.params.stage}. Valid: ${VALID_STAGES.join(', ')}`);
    }

    const result = await replayService.replayFromStage(
      request.params.evidenceEventId as EvidenceEventId,
      request.params.stage as ReplayStage,
    );
    return reply.send(result);
  });
}
