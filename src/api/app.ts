import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { getLogger } from '../observability/logger.js';
import { loadConfig } from '../app/config.js';
import { getRedis } from '../lib/infra/redis.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { authPlugin } from './plugins/auth.js';
import { requestIdPlugin } from './plugins/request-id.js';

function parseCorsOrigin(raw: string): true | string | string[] {
  if (raw === '*') return true;
  const origins = raw.split(',').map((o) => o.trim()).filter(Boolean);
  return origins.length === 1 ? origins[0]! : origins;
}

export async function buildApp(): Promise<FastifyInstance> {
  const logger = getLogger();
  const config = loadConfig();

  const app = Fastify({
    logger: false, // We use Pino directly
    trustProxy: true,
    bodyLimit: 1_048_576, // 1 MiB
  });

  // Security plugins
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    redis: getRedis(),
  });

  // Core plugins
  await app.register(cors, { origin: parseCorsOrigin(config.corsOrigin) });
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
