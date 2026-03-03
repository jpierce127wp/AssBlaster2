import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RegistryService } from './registry.service.js';
import { NotFoundError } from '../kernel/errors.js';
import type { CanonicalTaskId } from '../kernel/types.js';

const registryService = new RegistryService();

export async function registryRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/v1/tasks — List canonical tasks */
  app.get('/tasks', async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>, reply: FastifyReply) => {
    const limit = Math.min(parseInt(request.query.limit || '20', 10), 100);
    const offset = parseInt(request.query.offset || '0', 10);

    const result = await registryService.findAll({ limit, offset });
    return reply.send(result);
  });

  /** GET /api/v1/tasks/:id — Get canonical task by ID */
  app.get('/tasks/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const task = await registryService.findById(request.params.id as CanonicalTaskId);
    if (!task) throw new NotFoundError('CanonicalTask', request.params.id);
    return reply.send(task);
  });

  /** GET /api/v1/tasks/:id/evidence — Get evidence links for a task */
  app.get('/tasks/:id/evidence', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const task = await registryService.findById(request.params.id as CanonicalTaskId);
    if (!task) throw new NotFoundError('CanonicalTask', request.params.id);

    const links = await registryService.getTaskEvidenceLinks(request.params.id as CanonicalTaskId);
    return reply.send({ task_id: request.params.id, entries: links });
  });

  /** PATCH /api/v1/tasks/:id — Update a canonical task */
  app.patch('/tasks/:id', async (request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>, reply: FastifyReply) => {
    const task = await registryService.findById(request.params.id as CanonicalTaskId);
    if (!task) throw new NotFoundError('CanonicalTask', request.params.id);

    const updated = await registryService.updateTask(request.params.id as CanonicalTaskId, request.body as any);
    return reply.send(updated);
  });
}
