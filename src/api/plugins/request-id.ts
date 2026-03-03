import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

export async function requestIdPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request, _reply) => {
    // Use incoming request ID or generate one
    const requestId = (request.headers['x-request-id'] as string) || randomUUID();
    (request as any).correlationId = requestId;
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    const requestId = (_request as any).correlationId;
    if (requestId) {
      reply.header('x-request-id', requestId);
    }
    return payload;
  });
}
