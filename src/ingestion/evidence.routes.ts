import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EvidenceService } from './evidence.service.js';
import { ingestRequestSchema } from './evidence.types.js';
import { ValidationError, NotFoundError } from '../domain/errors.js';
import type { EvidenceEventId } from '../domain/types.js';

const evidenceService = new EvidenceService();

export async function evidenceRoutes(app: FastifyInstance): Promise<void> {
  /** POST /api/v1/evidence — Ingest new evidence */
  app.post('/evidence', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ingestRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid ingest request', parsed.error.flatten());
    }

    const result = await evidenceService.ingest(parsed.data);

    if (!result.isNew) {
      return reply.status(200).send({
        id: result.id,
        status: 'duplicate',
        message: 'Evidence with this idempotency key already exists',
      });
    }

    return reply.status(201).send({
      id: result.id,
      status: 'accepted',
      message: 'Evidence accepted for processing',
    });
  });

  /** GET /api/v1/evidence/:id — Get evidence event by ID */
  app.get('/evidence/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const event = await evidenceService.findById(request.params.id as EvidenceEventId);
    if (!event) {
      throw new NotFoundError('EvidenceEvent', request.params.id);
    }
    return reply.send(event);
  });

  /** GET /api/v1/evidence — List evidence events */
  app.get('/evidence', async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>, reply: FastifyReply) => {
    const limit = Math.min(parseInt(request.query.limit || '20', 10), 100);
    const offset = parseInt(request.query.offset || '0', 10);

    const result = await evidenceService.findAll({ limit, offset });
    return reply.send(result);
  });

  // --- Alias routes per spec naming convention ---

  /** POST /api/v1/evidence-events — Alias for POST /evidence */
  app.post('/evidence-events', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ingestRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid ingest request', parsed.error.flatten());
    }

    const result = await evidenceService.ingest(parsed.data);

    if (!result.isNew) {
      return reply.status(200).send({
        id: result.id,
        status: 'duplicate',
        message: 'Evidence with this idempotency key already exists',
      });
    }

    return reply.status(201).send({
      id: result.id,
      status: 'accepted',
      message: 'Evidence accepted for processing',
    });
  });

  /** GET /api/v1/evidence-events/:id — Alias for GET /evidence/:id */
  app.get('/evidence-events/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const event = await evidenceService.findById(request.params.id as EvidenceEventId);
    if (!event) {
      throw new NotFoundError('EvidenceEvent', request.params.id);
    }
    return reply.send(event);
  });
}
