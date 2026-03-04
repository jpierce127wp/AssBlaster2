import type { CanonicalTaskId, SyncStatus, ClioTaskLinkId } from './types.js';

/** Clio task link as stored in DB */
export interface ClioTaskLink {
  id: ClioTaskLinkId;
  clio_task_id: string;
  canonical_task_id: CanonicalTaskId;
  remote_version_token: string | null;
  last_synced_at: Date | null;
  sync_status: SyncStatus;
  created_at: Date;
  updated_at: Date;
}

/** Sync result */
export interface SyncResult {
  canonical_task_id: CanonicalTaskId;
  clio_task_id: string | null;
  action: 'created' | 'updated' | 'conflict' | 'skipped' | 'failed';
  details?: string;
}
