import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '../../../src/api/plugins/error-handler.js';
import { PipelineError, DomainError, NotFoundError } from '../../../src/domain/errors.js';

vi.mock('../../../src/observability/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

describe('errorHandlerPlugin', () => {
  async function buildTestApp(errorToThrow: Error) {
    const app = Fastify();
    // Call directly to set error handler on root instance (avoids Fastify encapsulation)
    await errorHandlerPlugin(app);
    app.get('/test', async () => {
      throw errorToThrow;
    });
    return app;
  }

  it('handles PipelineError with statusCode and retryable flag', async () => {
    const err = new PipelineError('Pipeline failed', {
      retryable: true,
      entityId: 'ev-001',
      stage: 'extraction',
      statusCode: 503,
    });
    const app = await buildTestApp(err);

    const response = await app.inject({ method: 'GET', url: '/test' });
    expect(response.statusCode).toBe(503);

    const body = JSON.parse(response.body);
    expect(body.error).toBe('PIPELINE_ERROR');
    expect(body.retryable).toBe(true);
    expect(body.entityId).toBe('ev-001');
    expect(body.stage).toBe('extraction');
  });

  it('handles DomainError with correct status code', async () => {
    const err = new DomainError('Bad request', 'VALIDATION', 400);
    const app = await buildTestApp(err);

    const response = await app.inject({ method: 'GET', url: '/test' });
    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.error).toBe('VALIDATION');
  });

  it('handles NotFoundError with 404', async () => {
    const err = new NotFoundError('Task', 'task-123');
    const app = await buildTestApp(err);

    const response = await app.inject({ method: 'GET', url: '/test' });
    expect(response.statusCode).toBe(404);

    const body = JSON.parse(response.body);
    expect(body.error).toBe('NOT_FOUND');
    expect(body.message).toContain('task-123');
  });

  it('handles Fastify validation error with 400', async () => {
    const app = Fastify();
    await errorHandlerPlugin(app);
    app.get('/test', {
      schema: {
        querystring: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string' } },
        },
      },
    }, async () => ({ ok: true }));

    const response = await app.inject({ method: 'GET', url: '/test' });
    expect(response.statusCode).toBe(400);

    const body = JSON.parse(response.body);
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('handles unknown error with 500', async () => {
    const err = new Error('Something unexpected');
    const app = await buildTestApp(err);

    const response = await app.inject({ method: 'GET', url: '/test' });
    expect(response.statusCode).toBe(500);

    const body = JSON.parse(response.body);
    expect(body.error).toBe('INTERNAL_ERROR');
    expect(body.message).toBe('An internal error occurred');
  });

  it('does not leak internal error details for unknown errors', async () => {
    const err = new Error('database password: secret123');
    const app = await buildTestApp(err);

    const response = await app.inject({ method: 'GET', url: '/test' });
    const body = JSON.parse(response.body);
    expect(body.message).not.toContain('secret123');
  });
});
