import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ReviewService } from './review.service.js';
import { ContextBuilder } from './context-builder.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import { z } from 'zod';

const reviewService = new ReviewService();
const contextBuilder = new ContextBuilder();

const decisionSchema = z.object({
  status: z.enum(['resolved', 'dismissed']),
  decided_by: z.string().min(1),
});

export async function reviewRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/v1/reviews — List open review items */
  app.get('/reviews', async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>, reply: FastifyReply) => {
    const limit = Math.min(parseInt(request.query.limit || '20', 10), 100);
    const offset = parseInt(request.query.offset || '0', 10);

    const result = await reviewService.getOpen({ limit, offset });
    return reply.send(result);
  });

  /** GET /api/v1/reviews/:id — Get review item by ID */
  app.get('/reviews/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const item = await reviewService.findById(request.params.id);
    if (!item) throw new NotFoundError('ReviewItem', request.params.id);
    return reply.send(item);
  });

  /** GET /api/v1/reviews/:id/context — Get full review context */
  app.get('/reviews/:id/context', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const context = await contextBuilder.build(request.params.id);
    return reply.send(context);
  });

  /** POST /api/v1/reviews/:id/decide — Submit a review decision */
  app.post('/reviews/:id/decide', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = decisionSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid decision', parsed.error.flatten());
    }

    const item = await reviewService.decide(request.params.id, parsed.data);
    return reply.send(item);
  });

  // --- Spec-aligned alias routes ---

  /** GET /api/v1/review-items/open — Alias for GET /reviews */
  app.get('/review-items/open', async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>, reply: FastifyReply) => {
    const limit = Math.min(parseInt(request.query.limit || '20', 10), 100);
    const offset = parseInt(request.query.offset || '0', 10);

    const result = await reviewService.getOpen({ limit, offset });
    return reply.send(result);
  });

  /** POST /api/v1/review-items/:id/resolve — Alias for POST /reviews/:id/decide */
  app.post('/review-items/:id/resolve', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsed = decisionSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid decision', parsed.error.flatten());
    }

    const item = await reviewService.decide(request.params.id, parsed.data);
    return reply.send(item);
  });
}
