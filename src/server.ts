import type { FastifyInstance } from 'fastify';
import { buildApp } from './api/app.js';
import { loadConfig } from './app/config.js';
import { getLogger } from './observability/logger.js';
import { evidenceRoutes } from './ingestion/evidence.routes.js';
import { registryRoutes } from './registry/registry.routes.js';
import { reviewRoutes } from './review/review.routes.js';
import { normalizationRoutes } from './normalization/normalization.routes.js';
import { syncRoutes } from './sync/sync.routes.js';
import { healthRoutes } from './observability/health.routes.js';
import { replayRoutes } from './observability/replay.routes.js';
import { clioRoutes } from './clio/clio.routes.js';
import { identityRoutes } from './resolution/identity.routes.js';

export async function startServer(): Promise<FastifyInstance> {
  const config = loadConfig();
  const logger = getLogger();
  const app = await buildApp();

  // Register domain route modules
  await app.register(evidenceRoutes, { prefix: '/api/v1' });
  await app.register(registryRoutes, { prefix: '/api/v1' });
  await app.register(reviewRoutes, { prefix: '/api/v1' });
  await app.register(normalizationRoutes, { prefix: '/api/v1' });
  await app.register(syncRoutes, { prefix: '/api/v1' });
  await app.register(healthRoutes, { prefix: '/api/v1' });
  await app.register(replayRoutes, { prefix: '/api/v1' });
  await app.register(clioRoutes, { prefix: '/api/v1' });
  await app.register(identityRoutes, { prefix: '/api/v1' });

  await app.listen({ port: config.port, host: config.host });
  logger.info({ port: config.port, host: config.host }, 'Server started');
  return app;
}
