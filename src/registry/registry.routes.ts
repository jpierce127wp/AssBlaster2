import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RegistryService } from './registry.service.js';
import { RegistryRepo } from './registry.repo.js';
import { NotFoundError } from '../domain/errors.js';
import { parsePagination, validateId } from '../lib/schema/index.js';
import { getQueue, QUEUE_NAMES } from '../lib/infra/queue.js';
import type { CanonicalTaskId } from '../domain/types.js';
import { ValidationError } from '../domain/errors.js';

const registryService = new RegistryService();

/** Fields allowed in PATCH /tasks/:id (human edit). Matches UpdateTaskInput. */
const TASK_PATCH_FIELDS = new Set([
  'canonical_summary',
  'status',
  'priority',
  'due_date_kind',
  'due_date_window_start',
  'due_date_window_end',
  'assignee_user_id',
  'assignee_role',
]);
const registryRepo = new RegistryRepo();

/** Shared handler: get canonical task by ID */
async function getTaskById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  validateId(request.params.id, 'CanonicalTaskId');
  const task = await registryService.findById(request.params.id as CanonicalTaskId);
  if (!task) throw new NotFoundError('CanonicalTask', request.params.id);
  return reply.send(task);
}

export async function registryRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/v1/tasks — List canonical tasks */
  app.get('/tasks', async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>, reply: FastifyReply) => {
    const { limit, offset } = parsePagination(request.query);
    const result = await registryService.findAll({ limit, offset });
    return reply.send(result);
  });

  /** GET /api/v1/tasks/:id — Get canonical task by ID */
  app.get('/tasks/:id', getTaskById);

  /** GET /api/v1/tasks/:id/evidence — Get evidence links for a task */
  app.get('/tasks/:id/evidence', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    validateId(request.params.id, 'CanonicalTaskId');
    const task = await registryService.findById(request.params.id as CanonicalTaskId);
    if (!task) throw new NotFoundError('CanonicalTask', request.params.id);

    const links = await registryService.getTaskEvidenceLinks(request.params.id as CanonicalTaskId);
    return reply.send({ task_id: request.params.id, entries: links });
  });

  /** PATCH /api/v1/tasks/:id — Update a canonical task (human edit) */
  app.patch('/tasks/:id', async (request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>, reply: FastifyReply) => {
    validateId(request.params.id, 'CanonicalTaskId');
    const task = await registryService.findById(request.params.id as CanonicalTaskId);
    if (!task) throw new NotFoundError('CanonicalTask', request.params.id);

    // Filter body to only allowed fields
    const rawBody = request.body ?? {};
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawBody)) {
      if (TASK_PATCH_FIELDS.has(key)) filtered[key] = value;
    }
    if (Object.keys(filtered).length === 0) {
      throw new ValidationError(`No valid fields to update. Allowed: ${[...TASK_PATCH_FIELDS].join(', ')}`);
    }

    // Mark this as a human edit — protects these fields from future pipeline overwrites
    filtered.human_edited_at = new Date();
    filtered.human_edited_by = (request.headers['x-user-id'] as string) ?? 'unknown';

    const updated = await registryService.updateTask(request.params.id as CanonicalTaskId, filtered as import('./registry.types.js').UpdateTaskInput);
    return reply.send(updated);
  });

  // --- Spec-aligned aliases and new endpoints ---

  /** GET /api/v1/canonical-tasks/:id — Alias for GET /tasks/:id */
  app.get('/canonical-tasks/:id', getTaskById);

  /** GET /api/v1/canonical-tasks/open — List open canonical tasks */
  app.get('/canonical-tasks/open', async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>, reply: FastifyReply) => {
    const { limit, offset } = parsePagination(request.query);
    const result = await registryRepo.findOpen({ limit, offset });
    return reply.send(result);
  });

  /** POST /api/v1/canonical-tasks/:id/recompute — Re-enqueue task for assignment + sync */
  app.post('/canonical-tasks/:id/recompute', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    validateId(request.params.id, 'CanonicalTaskId');
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
