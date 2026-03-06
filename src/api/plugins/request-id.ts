import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}

export async function requestIdPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request, _reply) => {
    request.correlationId = (request.headers['x-request-id'] as string) || randomUUID();
  });

  app.addHook('onSend', async (request, reply, payload) => {
    if (request.correlationId) {
      reply.header('x-request-id', request.correlationId);
    }
    return payload;
  });
}
