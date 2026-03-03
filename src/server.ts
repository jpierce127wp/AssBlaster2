import { buildApp } from './api/app.js';
import { loadConfig } from './kernel/config.js';
import { getLogger } from './kernel/logger.js';
import { evidenceRoutes } from './evidence/evidence.routes.js';
import { registryRoutes } from './registry/registry.routes.js';
import { reviewRoutes } from './review/review.routes.js';
import { healthRoutes } from './observability/health.routes.js';
import { replayRoutes } from './observability/replay.routes.js';

export async function startServer(): Promise<void> {
  const config = loadConfig();
  const logger = getLogger();
  const app = await buildApp();

  // Register domain route modules
  await app.register(evidenceRoutes, { prefix: '/api/v1' });
  await app.register(registryRoutes, { prefix: '/api/v1' });
  await app.register(reviewRoutes, { prefix: '/api/v1' });
  await app.register(healthRoutes, { prefix: '/api/v1' });
  await app.register(replayRoutes, { prefix: '/api/v1' });

  await app.listen({ port: config.port, host: config.host });
  logger.info({ port: config.port, host: config.host }, 'Server started');
}
