import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RegistryService } from './registry.service.js';
import { RegistryRepo } from './registry.repo.js';
import { NotFoundError } from '../kernel/errors.js';
import { getQueue, QUEUE_NAMES } from '../kernel/queue.js';
import type { CanonicalTaskId } from '../kernel/types.js';

const registryService = new RegistryService();
const registryRepo = new RegistryRepo();

/** Shared handler: get canonical task by ID */
async function getTaskById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const task = await registryService.findById(request.params.id as CanonicalTaskId);
  if (!task) throw new NotFoundError('CanonicalTask', request.params.id);
  return reply.send(task);
}

export async function registryRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/v1/tasks — List canonical tasks */
  app.get('/tasks', async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>, reply: FastifyReply) => {
    const limit = Math.min(parseInt(request.query.limit || '20', 10), 100);
    const offset = parseInt(request.query.offset || '0', 10);

    const result = await registryService.findAll({ limit, offset });
    return reply.send(result);
  });

  /** GET /api/v1/tasks/:id — Get canonical task by ID */
  app.get('/tasks/:id', getTaskById);

  /** GET /api/v1/tasks/:id/evidence — Get evidence links for a task */
  app.get('/tasks/:id/evidence', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const task = await registryService.findById(request.params.id as CanonicalTaskId);
    if (!task) throw new NotFoundError('CanonicalTask', request.params.id);

    const links = await registryService.getTaskEvidenceLinks(request.params.id as CanonicalTaskId);
    return reply.send({ task_id: request.params.id, entries: links });
  });

  /** PATCH /api/v1/tasks/:id — Update a canonical task (human edit) */
  app.patch('/tasks/:id', async (request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>, reply: FastifyReply) => {
    const task = await registryService.findById(request.params.id as CanonicalTaskId);
    if (!task) throw new NotFoundError('CanonicalTask', request.params.id);

    // Mark this as a human edit — protects these fields from future pipeline overwrites
    const body = {
      ...request.body,
      human_edited_at: new Date(),
      human_edited_by: (request.headers['x-user-id'] as string) ?? 'unknown',
    };

    const updated = await registryService.updateTask(request.params.id as CanonicalTaskId, body as any);
    return reply.send(updated);
  });

  // --- Spec-aligned aliases and new endpoints ---

  /** GET /api/v1/canonical-tasks/:id — Alias for GET /tasks/:id */
  app.get('/canonical-tasks/:id', getTaskById);

  /** GET /api/v1/canonical-tasks/open — List open canonical tasks */
  app.get('/canonical-tasks/open', async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>, reply: FastifyReply) => {
    const limit = Math.min(parseInt(request.query.limit || '20', 10), 100);
    const offset = parseInt(request.query.offset || '0', 10);

    const result = await registryRepo.findOpen({ limit, offset });
    return reply.send(result);
  });

  /** POST /api/v1/canonical-tasks/:id/recompute — Re-enqueue task for assignment + sync */
  app.post('/canonical-tasks/:id/recompute', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const task = await registryService.findById(request.params.id as CanonicalTaskId);
    if (!task) throw new NotFoundError('CanonicalTask', request.params.id);

    const assignQueue = getQueue(QUEUE_NAMES.ASSIGNMENT_ASSIGN);
    await assignQueue.add('assign', {
      eventType: 'candidate_task.decided',
      schemaVersion: 1,
      evidenceEventId: '',
      canonicalTaskId: request.params.id,
    }, {
      jobId: `recompute-assign-${request.params.id}-${Date.now()}`,
    });

    return reply.status(202).send({ message: 'Task queued for recomputation', id: request.params.id });
  });
}
