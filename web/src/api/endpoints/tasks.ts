import { api } from '../client';
import type {
  CanonicalTask,
  PaginatedResult,
  TaskEvidenceLink,
  UpdateTaskInput,
} from '../types';

export const tasksApi = {
  list: (limit = 20, offset = 0) =>
    api.get<PaginatedResult<CanonicalTask>>(`/tasks?limit=${limit}&offset=${offset}`),

  listOpen: (limit = 20, offset = 0) =>
    api.get<PaginatedResult<CanonicalTask>>(`/canonical-tasks/open?limit=${limit}&offset=${offset}`),

  get: (id: string) =>
    api.get<CanonicalTask>(`/tasks/${id}`),

  getEvidence: (id: string) =>
    api.get<{ task_id: string; entries: TaskEvidenceLink[] }>(`/tasks/${id}/evidence`),

  update: (id: string, data: UpdateTaskInput) =>
    api.patch<CanonicalTask>(`/tasks/${id}`, data),

  recompute: (id: string) =>
    api.post<{ message: string; id: string }>(`/canonical-tasks/${id}/recompute`),
};
