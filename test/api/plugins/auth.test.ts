import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { authPlugin } from '../../../src/api/plugins/auth.js';
import { errorHandlerPlugin } from '../../../src/api/plugins/error-handler.js';

vi.mock('../../../src/app/config.js', () => ({
  loadConfig: () => ({ apiKey: 'test-secret-key' }),
}));
vi.mock('../../../src/observability/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

describe('authPlugin', () => {
  async function buildTestApp() {
    const app = Fastify();
    // Call directly to avoid Fastify encapsulation
    await errorHandlerPlugin(app);
    await authPlugin(app);

    app.get('/health', async () => ({ status: 'ok' }));
    app.get('/ready', async () => ({ status: 'ready' }));
    app.get('/api/v1/clio/callback', async () => ({ status: 'callback' }));
    app.get('/api/v1/protected', async () => ({ data: 'secret' }));

    return app;
  }

  it('returns 401 when X-API-Key is missing', async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/api/v1/protected' });
    expect(response.statusCode).toBe(401);
  });

  it('returns 401 when X-API-Key is wrong', async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/protected',
      headers: { 'x-api-key': 'wrong-key' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('passes through with correct API key', async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/protected',
      headers: { 'x-api-key': 'test-secret-key' },
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data).toBe('secret');
  });

  it('skips auth for /health', async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
  });

  it('skips auth for /ready', async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(200);
  });

  it('skips auth for /api/v1/clio/callback', async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/api/v1/clio/callback' });
    expect(response.statusCode).toBe(200);
  });
});
