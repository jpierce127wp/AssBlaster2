import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticationError } from '../../domain/errors.js';
import { loadConfig } from '../../app/config.js';

export async function authPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    // Skip auth for health checks, OAuth callbacks, and API docs
    if (request.url === '/health' || request.url === '/ready'
      || request.url.startsWith('/docs')
      || request.url.startsWith('/api/v1/clio/callback')
      || request.url.startsWith('/api/v1/clio/authorize')
      || request.url.startsWith('/api/v1/clio/status')) {
      return;
    }

    const apiKey = request.headers['x-api-key'] as string | undefined;
    const config = loadConfig();

    if (!apiKey || apiKey !== config.apiKey) {
      throw new AuthenticationError('Invalid or missing API key');
    }
  });
}
