import type { ApiError } from './types';

const API_BASE = '/api/v1';

export class ApiClientError extends Error {
  statusCode: number;
  errorBody: ApiError;

  constructor(statusCode: number, errorBody: ApiError) {
    super(errorBody.message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.errorBody = errorBody;
  }
}

function getApiKey(): string | null {
  return localStorage.getItem('taskmaster_api_key');
}

function getUserId(): string | null {
  return localStorage.getItem('taskmaster_user_id');
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const apiKey = getApiKey();
  const userId = getUserId();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  if (userId) {
    headers['X-User-Id'] = userId;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorBody: ApiError;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = {
        error: 'UNKNOWN_ERROR',
        message: response.statusText || 'Request failed',
      };
    }
    throw new ApiClientError(response.status, errorBody);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  delete: <T>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
};
