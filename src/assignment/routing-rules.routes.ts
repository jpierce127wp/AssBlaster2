import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RoutingRulesRepo } from './routing-rules.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';
import { validateId } from '../lib/schema/index.js';

const routingRulesRepo = new RoutingRulesRepo();

export async function routingRulesRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/v1/routing-rules — List active routing rules */
  app.get('/routing-rules', async (_request: FastifyRequest, reply: FastifyReply) => {
    const rules = await routingRulesRepo.listActive();
    return reply.send({ items: rules, total: rules.length });
  });

  /** POST /api/v1/routing-rules — Create a routing rule */
  app.post('/routing-rules', async (request: FastifyRequest<{
    Body: {
      practice_area: string;
      action_type: string;
      assignee_user_id?: string | null;
      assignee_role?: string | null;
      priority?: number;
    };
  }>, reply: FastifyReply) => {
    const { practice_area, action_type, assignee_user_id, assignee_role, priority } = request.body;

    if (!practice_area || !action_type) {
      throw new ValidationError('practice_area and action_type are required');
    }
    if (!assignee_user_id && !assignee_role) {
      throw new ValidationError('At least one of assignee_user_id or assignee_role is required');
    }

    const rule = await routingRulesRepo.create({
      practice_area,
      action_type,
      assignee_user_id: assignee_user_id ?? null,
      assignee_role: assignee_role ?? null,
      priority: priority ?? 0,
    });

    return reply.status(201).send(rule);
  });

  /** DELETE /api/v1/routing-rules/:id — Deactivate a routing rule */
  app.delete('/routing-rules/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    validateId(request.params.id, 'RoutingRuleId');
    await routingRulesRepo.deactivate(request.params.id);
    return reply.status(204).send();
  });
}
