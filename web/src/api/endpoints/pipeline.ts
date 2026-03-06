import { api } from '../client';
import type { FailedJob, PipelineMetrics } from '../types';

export const pipelineApi = {
  metrics: () =>
    api.get<PipelineMetrics>('/pipeline/metrics'),

  pause: (stage: string) =>
    api.post<{ message: string }>(`/pipeline/pause/${stage}`),

  resume: (stage: string) =>
    api.post<{ message: string }>(`/pipeline/resume/${stage}`),

  failedJobs: (stage?: string, limit = 50) => {
    const params = new URLSearchParams();
    if (stage) params.set('stage', stage);
    params.set('limit', String(limit));
    return api.get<{ items: FailedJob[]; total: number }>(`/pipeline/failed-jobs?${params}`);
  },

  retryFailed: (stage: string) =>
    api.post<{ message: string; retried: number }>(`/pipeline/retry-failed/${stage}`),
};
