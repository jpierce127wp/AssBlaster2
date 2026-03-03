import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CandidateTaskRepo } from './normalization.repo.js';
import { NotFoundError } from '../kernel/errors.js';
import type { CandidateTaskId } from '../kernel/types.js';

const candidateTaskRepo = new CandidateTaskRepo();

export async function normalizationRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/v1/candidate-tasks/:id — Get candidate task by ID */
  app.get('/candidate-tasks/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const task = await candidateTaskRepo.findById(request.params.id as CandidateTaskId);
    if (!task) throw new NotFoundError('CandidateTask', request.params.id);
    return reply.send(task);
  });
}
