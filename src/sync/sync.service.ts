import { getLogger } from '../observability/logger.js';
import { AuditRepo } from '../observability/audit.repo.js';
import { RegistryRepo } from '../registry/registry.repo.js';
import { SyncRepo } from './sync.repo.js';
import { SyncReconciler } from './sync.reconciler.js';
import { ClioClient } from '../clio/clio.client.js';
import { ConflictHandler } from '../clio/conflict-handler.js';
import { mapPriority, mapStatus } from '../clio/clio.field-map.js';
import type { SyncResult } from './sync.types.js';
import { PipelineError } from '../domain/errors.js';
import type { CanonicalTaskId } from '../domain/types.js';

/**
 * The only pipeline stage that writes to Clio.
 * See policy D1 (SOURCE_OF_TRUTH) and D2 (DIRECT_SOURCE_TO_CLIO).
 */
export class SyncService {
  private registryRepo = new RegistryRepo();
  private syncRepo = new SyncRepo();
  private reconciler = new SyncReconciler();
  private clioClient = new ClioClient();
  private conflictHandler = new ConflictHandler();
  private auditRepo = new AuditRepo();

  async syncToClio(canonicalTaskId: CanonicalTaskId): Promise<SyncResult> {
    const logger = getLogger();
    const task = await this.registryRepo.findById(canonicalTaskId);
    if (!task) throw new PipelineError(`Canonical task not found: ${canonicalTaskId}`, {
      code: 'CANONICAL_TASK_NOT_FOUND', retryable: false, entityId: canonicalTaskId, stage: 'sync',
    });

    const link = await this.syncRepo.findByTaskId(canonicalTaskId);
    const currentHash = SyncReconciler.computeSyncHash(task);

    // Build Clio payload
    const payload = {
      data: {
        name: task.canonical_summary,
        description: task.desired_outcome ?? undefined,
        priority: mapPriority(task.priority),
        due_at: task.due_date_window_start ?? undefined,
        status: mapStatus(task.status),
        ...(task.assignee_user_id ? { assignee: { id: parseInt(task.assignee_user_id, 10) } } : {}),
      },
    };

    try {
      if (link?.clio_task_id) {
        // Check for conflicts first
        const hasConflict = await this.reconciler.detectConflict(canonicalTaskId);
        if (hasConflict) {
          const resolution = await this.conflictHandler.resolve(canonicalTaskId);
          if (resolution.action === 'overwritten') {
            // Conflict resolved by overwriting Clio — treat as updated
            return { canonical_task_id: canonicalTaskId, clio_task_id: link.clio_task_id, action: 'updated', details: resolution.details };
          }
          // Conflict sent to review
          return { canonical_task_id: canonicalTaskId, clio_task_id: link.clio_task_id, action: 'conflict', details: resolution.details };
        }

        // Update existing
        const { task: clioTask, etag } = await this.clioClient.updateTask(
          link.clio_task_id,
          payload,
          link.remote_version_token ?? '',
        );

        await this.syncRepo.upsert({
          canonicalTaskId,
          clioTaskId: String(clioTask.id),
          remoteVersionToken: etag,
        });

        await this.auditRepo.log({
          entityType: 'canonical_task',
          entityId: canonicalTaskId,
          action: 'synced',
          summary: `Synced to Clio (updated)`,
          metadata: { clio_task_id: clioTask.id },
        });

        return { canonical_task_id: canonicalTaskId, clio_task_id: String(clioTask.id), action: 'updated' };
      } else {
        // Create new
        const { task: clioTask, etag } = await this.clioClient.createTask(payload);

        await this.syncRepo.upsert({
          canonicalTaskId,
          clioTaskId: String(clioTask.id),
          remoteVersionToken: etag,
        });

        await this.auditRepo.log({
          entityType: 'canonical_task',
          entityId: canonicalTaskId,
          action: 'synced',
          summary: `Synced to Clio (created)`,
          metadata: { clio_task_id: clioTask.id },
        });

        return { canonical_task_id: canonicalTaskId, clio_task_id: String(clioTask.id), action: 'created' };
      }
    } catch (err) {
      await this.syncRepo.markFailed(canonicalTaskId);
      logger.error({ taskId: canonicalTaskId, err }, 'Sync to Clio failed');

      await this.auditRepo.log({
        entityType: 'canonical_task',
        entityId: canonicalTaskId,
        action: 'failed',
        summary: `Sync to Clio failed`,
        metadata: { error: String(err) },
      });

      return { canonical_task_id: canonicalTaskId, clio_task_id: null, action: 'failed', details: String(err) };
    }
  }

}
