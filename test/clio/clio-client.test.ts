import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockAuth = { getAccessToken: vi.fn() };
const mockRateLimiter = { acquire: vi.fn() };

vi.mock('../../src/clio/clio.auth.js', () => ({
  ClioAuth: vi.fn().mockImplementation(() => mockAuth),
}));
vi.mock('../../src/clio/rate-limit.js', () => ({
  RateLimiter: vi.fn().mockImplementation(() => mockRateLimiter),
}));
vi.mock('../../src/app/config.js', () => ({
  loadConfig: () => ({ clioApiBase: 'https://app.clio.com/api/v4' }),
}));
vi.mock('../../src/observability/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

import { ClioClient } from '../../src/clio/clio.client.js';

describe('ClioClient', () => {
  let client: ClioClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new ClioClient();
    mockAuth.getAccessToken.mockResolvedValue('test-token');
    mockRateLimiter.acquire.mockResolvedValue(undefined);
  });

  it('createTask sends POST with correct url and headers', async () => {
    const mockResponse = {
      ok: true,
      status: 201,
      headers: new Headers({ etag: 'etag-123' }),
      json: async () => ({ data: { id: 'clio-1', name: 'Test' } }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const result = await client.createTask({ data: { name: 'Test' } } as any);

    expect(fetch).toHaveBeenCalledWith(
      'https://app.clio.com/api/v4/tasks.json',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(result.task.id).toBe('clio-1');
    expect(result.etag).toBe('etag-123');
  });

  it('updateTask sends PATCH with If-Match header', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ etag: 'etag-456' }),
      json: async () => ({ data: { id: 'clio-1', name: 'Updated' } }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const result = await client.updateTask('clio-1', { data: { name: 'Updated' } } as any, 'etag-123');

    expect(fetch).toHaveBeenCalledWith(
      'https://app.clio.com/api/v4/tasks/clio-1.json',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'If-Match': 'etag-123' }),
      }),
    );
    expect(result.etag).toBe('etag-456');
  });

  it('getTask sends GET request', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ etag: 'etag-789' }),
      json: async () => ({ data: { id: 'clio-1', name: 'Task' } }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const result = await client.getTask('clio-1');

    expect(fetch).toHaveBeenCalledWith(
      'https://app.clio.com/api/v4/tasks/clio-1.json',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.task.name).toBe('Task');
  });

  it('throws ExternalServiceError on 409 Conflict', async () => {
    const mockResponse = {
      ok: false,
      status: 409,
      headers: new Headers(),
      text: async () => 'Conflict',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    await expect(client.getTask('clio-1')).rejects.toThrow('Conflict');
  });

  it('throws ExternalServiceError on non-ok response', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      headers: new Headers(),
      text: async () => 'Internal Server Error',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    await expect(client.getTask('clio-1')).rejects.toThrow('failed: 500');
  });

  it('calls rateLimiter.acquire before every request', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ etag: '' }),
      json: async () => ({ data: { id: 'clio-1' } }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    await client.getTask('clio-1');

    expect(mockRateLimiter.acquire).toHaveBeenCalledTimes(1);
  });

  it('calls auth.getAccessToken for Bearer token', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      headers: new Headers({ etag: '' }),
      json: async () => ({ data: { id: 'clio-1' } }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    await client.getTask('clio-1');

    expect(mockAuth.getAccessToken).toHaveBeenCalledTimes(1);
  });
});
