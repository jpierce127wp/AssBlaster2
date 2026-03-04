import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { getLogger } from '../observability/logger.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { authPlugin } from './plugins/auth.js';
import { requestIdPlugin } from './plugins/request-id.js';

export async function buildApp(): Promise<FastifyInstance> {
  const logger = getLogger();

  const app = Fastify({
    logger: false, // We use Pino directly
    trustProxy: true,
  });

  // Core plugins
  await app.register(cors, { origin: true });
  await app.register(requestIdPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);

  // Health endpoints (no auth)
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
  app.get('/ready', async () => {
    // Could add DB/Redis checks here
    return { status: 'ready', timestamp: new Date().toISOString() };
  });

  logger.info('Fastify app built');
  return app;
}
