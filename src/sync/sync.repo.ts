import { getPool } from '../kernel/db.js';
import type pg from 'pg';
import type { ClioTaskLink } from './sync.types.js';
import type { CanonicalTaskId } from '../kernel/types.js';

export class SyncRepo {
  private get pool(): pg.Pool {
    return getPool();
  }

  async findByTaskId(taskId: CanonicalTaskId): Promise<ClioTaskLink | null> {
    const result = await this.pool.query(
      'SELECT * FROM clio_task_links WHERE canonical_task_id = $1',
      [taskId],
    );
    return (result.rows[0] as ClioTaskLink) ?? null;
  }

  async upsert(state: {
    canonicalTaskId: CanonicalTaskId;
    clioTaskId: string;
    remoteVersionToken: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO clio_task_links (canonical_task_id, clio_task_id, remote_version_token, last_synced_at, sync_status)
       VALUES ($1, $2, $3, NOW(), 'synced')
       ON CONFLICT (clio_task_id) DO UPDATE SET
         remote_version_token = EXCLUDED.remote_version_token,
         last_synced_at = NOW(),
         sync_status = 'synced',
         updated_at = NOW()`,
      [state.canonicalTaskId, state.clioTaskId, state.remoteVersionToken],
    );
  }

  async markConflict(taskId: CanonicalTaskId): Promise<void> {
    await this.pool.query(
      "UPDATE clio_task_links SET sync_status = 'conflict', updated_at = NOW() WHERE canonical_task_id = $1",
      [taskId],
    );
  }

  async markFailed(taskId: CanonicalTaskId): Promise<void> {
    await this.pool.query(
      "UPDATE clio_task_links SET sync_status = 'failed', updated_at = NOW() WHERE canonical_task_id = $1",
      [taskId],
    );
  }
}
