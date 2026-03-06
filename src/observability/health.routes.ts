import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { collectMetrics } from './metrics.js';
import { queryAuditLog } from './audit.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/v1/metrics — System metrics */
  app.get('/metrics', async (_request: FastifyRequest, reply: FastifyReply) => {
    const metrics = await collectMetrics();
    return reply.send(metrics);
  });

  /** GET /api/v1/audit — Query audit log */
  app.get('/audit', async (
    request: FastifyRequest<{
      Querystring: {
        entity_type?: string;
        entity_id?: string;
        action?: string;
        limit?: string;
      };
    }>,
    reply: FastifyReply,
  ) => {
    const rawLimit = request.query.limit ? parseInt(request.query.limit, 10) : undefined;
    const entries = await queryAuditLog({
      entityType: request.query.entity_type,
      entityId: request.query.entity_id,
      action: request.query.action,
      limit: Number.isNaN(rawLimit) ? undefined : rawLimit,
    });
    return reply.send({ entries });
  });
}
