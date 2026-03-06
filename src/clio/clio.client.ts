import { loadConfig } from '../app/config.js';
import { getLogger } from '../observability/logger.js';
import { ExternalServiceError } from '../domain/errors.js';
import { ClioAuth } from './clio.auth.js';
import { RateLimiter } from './rate-limit.js';
import type { ClioTask, ClioTaskPayload } from './clio.types.js';

export class ClioClient {
  private auth = new ClioAuth();
  private rateLimiter = new RateLimiter();

  private async request<T>(method: string, path: string, body?: unknown, etag?: string): Promise<{ data: T; etag: string }> {
    const config = loadConfig();
    await this.rateLimiter.acquire();
    const accessToken = await this.auth.getAccessToken();
    const url = `${config.clioApiBase}${path}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    if (etag && (method === 'PATCH' || method === 'PUT')) {
      headers['If-Match'] = etag;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 409) {
      throw new ExternalServiceError('Clio', 'Conflict: resource was modified externally');
    }

    if (!response.ok) {
      const responseBody = await response.text();
      throw new ExternalServiceError('Clio', `${method} ${path} failed: ${response.status} ${responseBody}`);
    }

    const responseEtag = response.headers.get('etag') ?? '';
    const responseData = (await response.json()) as { data: T };

    return { data: responseData.data, etag: responseEtag };
  }

  /** Create a task in Clio */
  async createTask(payload: ClioTaskPayload): Promise<{ task: ClioTask; etag: string }> {
    const { data, etag } = await this.request<ClioTask>('POST', '/tasks.json', payload);
    getLogger().info({ clioTaskId: data.id }, 'Clio task created');
    return { task: data, etag };
  }

  /** Update a task in Clio */
  async updateTask(taskId: string, payload: ClioTaskPayload, etag: string): Promise<{ task: ClioTask; etag: string }> {
    const { data, etag: newEtag } = await this.request<ClioTask>('PATCH', `/tasks/${taskId}.json`, payload, etag);
    getLogger().info({ clioTaskId: data.id }, 'Clio task updated');
    return { task: data, etag: newEtag };
  }

  /** Get a task from Clio */
  async getTask(taskId: string): Promise<{ task: ClioTask; etag: string }> {
    const { data, etag } = await this.request<ClioTask>('GET', `/tasks/${taskId}.json`);
    return { task: data, etag };
  }
}
