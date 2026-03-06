import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SyncService } from './sync.service.js';
import { NotFoundError } from '../domain/errors.js';
import { validateId } from '../lib/schema/index.js';
import { RegistryRepo } from '../registry/registry.repo.js';
import type { CanonicalTaskId } from '../domain/types.js';

const syncService = new SyncService();
const registryRepo = new RegistryRepo();

export async function syncRoutes(app: FastifyInstance): Promise<void> {
  /** POST /api/v1/sync/canonical-tasks/:id — Manually trigger sync for a task */
  app.post('/sync/canonical-tasks/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    validateId(request.params.id, 'CanonicalTaskId');
    const task = await registryRepo.findById(request.params.id as CanonicalTaskId);
    if (!task) throw new NotFoundError('CanonicalTask', request.params.id);

    const result = await syncService.syncToClio(request.params.id as CanonicalTaskId);
    return reply.send(result);
  });
}
