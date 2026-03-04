import { createHash } from 'node:crypto';
import { getLogger } from '../observability/logger.js';
import { SyncRepo } from './sync.repo.js';
import { ClioClient } from '../clio/clio.client.js';
import type { CanonicalTask } from '../registry/registry.types.js';
import type { CanonicalTaskId } from '../domain/types.js';

export class SyncReconciler {
  private syncRepo = new SyncRepo();
  private clioClient = new ClioClient();

  /** Compute a hash of the task's syncable fields */
  static computeSyncHash(task: CanonicalTask): string {
    const data = JSON.stringify({
      canonical_summary: task.canonical_summary,
      desired_outcome: task.desired_outcome,
      priority: task.priority,
      due_date_window_start: task.due_date_window_start,
      assignee_user_id: task.assignee_user_id,
      status: task.status,
    });
    return createHash('sha256').update(data).digest('hex');
  }

  /** Check if a synced task has been modified in Clio */
  async detectConflict(taskId: CanonicalTaskId): Promise<boolean> {
    const logger = getLogger();
    const link = await this.syncRepo.findByTaskId(taskId);

    if (!link?.clio_task_id || !link.remote_version_token) {
      return false;
    }

    try {
      const { task: clioTask, etag } = await this.clioClient.getTask(link.clio_task_id);

      // If etag changed, the task was modified in Clio
      if (etag !== link.remote_version_token) {
        logger.info({ taskId, clioTaskId: link.clio_task_id }, 'Conflict detected: Clio task was modified');
        await this.syncRepo.markConflict(taskId);
        return true;
      }

      return false;
    } catch (err) {
      logger.warn({ taskId, err }, 'Failed to check for conflicts');
      return false;
    }
  }
}
