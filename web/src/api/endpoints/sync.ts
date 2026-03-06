import { api } from '../client';
import type { SyncResult } from '../types';

export const syncApi = {
  syncTask: (canonicalTaskId: string) =>
    api.post<SyncResult>(`/sync/canonical-tasks/${canonicalTaskId}`),

  clioStatus: () =>
    api.get<{ connected: boolean }>('/clio/status'),
};
