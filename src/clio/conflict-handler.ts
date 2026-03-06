/**
 * Sync conflict resolution between local canonical tasks and Clio state.
 * Strategy: "local wins with audit" — canonical registry is source of truth (policy D1).
 */

import { getLogger } from '../observability/logger.js';
import { AuditRepo } from '../observability/audit.repo.js';
import { RegistryRepo } from '../registry/registry.repo.js';
import { SyncRepo } from '../sync/sync.repo.js';
import { ClioClient } from './clio.client.js';
import { ReviewService } from '../review/review.service.js';
import { mapPriority, mapStatus } from './clio.field-map.js';
import { HUMAN_PROTECTED_FIELDS } from '../domain/policy.js';
import type { CanonicalTaskId, CandidateTaskId } from '../domain/types.js';

export interface ConflictResolution {
  action: 'overwritten' | 'review_created';
  details: string;
}

export class ConflictHandler {
  private registryRepo = new RegistryRepo();
  private syncRepo = new SyncRepo();
  private clioClient = new ClioClient();
  private reviewService = new ReviewService();
  private auditRepo = new AuditRepo();

  /** Resolve a sync conflict for a canonical task */
  async resolve(canonicalTaskId: CanonicalTaskId): Promise<ConflictResolution> {
    const logger = getLogger();

    // 1. Fetch current Clio task
    const link = await this.syncRepo.findByTaskId(canonicalTaskId);
    if (!link?.clio_task_id) {
      throw new Error(`No sync link found for canonical task ${canonicalTaskId}`);
    }

    const { task: clioTask, etag: newEtag } = await this.clioClient.getTask(link.clio_task_id);

    // 2. Fetch local canonical task
    const localTask = await this.registryRepo.findById(canonicalTaskId);
    if (!localTask) {
      throw new Error(`Canonical task not found: ${canonicalTaskId}`);
    }

    // 3. Compare fields to identify what changed remotely
    const changedFields: string[] = [];
    if (clioTask.name !== localTask.canonical_summary) changedFields.push('canonical_summary');
    if (clioTask.description !== (localTask.desired_outcome ?? undefined)) changedFields.push('desired_outcome');

    logger.info(
      { canonicalTaskId, clioTaskId: link.clio_task_id, changedFields },
      'Conflict detected, resolving',
    );

    // 4. If local has human_edited_at → force push local version
    if (localTask.human_edited_at) {
      const payload = {
        data: {
          name: localTask.canonical_summary,
          description: localTask.desired_outcome ?? undefined,
          priority: mapPriority(localTask.priority),
          due_at: localTask.due_date_window_start ?? undefined,
          status: mapStatus(localTask.status),
          ...(localTask.assignee_user_id
            ? { assignee: { id: parseInt(localTask.assignee_user_id, 10) } }
            : {}),
        },
      };

      const { etag: updatedEtag } = await this.clioClient.updateTask(
        link.clio_task_id,
        payload,
        newEtag,
      );

      // 6. Update sync link with new etag
      await this.syncRepo.upsert({
        canonicalTaskId,
        clioTaskId: link.clio_task_id,
        remoteVersionToken: updatedEtag,
      });

      // 7. Audit log
      await this.auditRepo.log({
        entityType: 'canonical_task',
        entityId: canonicalTaskId,
        action: 'updated',
        summary: 'Conflict resolved: local overwrite (human-edited)',
        metadata: {
          clio_task_id: link.clio_task_id,
          changed_fields: changedFields,
          resolution: 'overwritten',
        },
      });

      logger.info(
        { canonicalTaskId, clioTaskId: link.clio_task_id },
        'Conflict resolved: local version force-pushed (human-edited)',
      );

      return {
        action: 'overwritten',
        details: `Human-edited local task overwrote Clio changes (fields: ${changedFields.join(', ')})`,
      };
    }

    // 5. If no human edit → create review item for manual resolution
    // We need a candidate_task_id to create a review item. Since this is a conflict
    // on an existing canonical task, we use the canonical task ID cast as a reference.
    const reviewItem = await this.reviewService.createReviewItem({
      candidateTaskId: canonicalTaskId as unknown as CandidateTaskId,
      reason: 'conflict',
      priority: 5,
    });

    // 7. Audit log
    await this.auditRepo.log({
      entityType: 'canonical_task',
      entityId: canonicalTaskId,
      action: 'updated',
      summary: 'Conflict resolved: review item created for manual resolution',
      metadata: {
        clio_task_id: link.clio_task_id,
        changed_fields: changedFields,
        review_item_id: reviewItem.id,
        resolution: 'review_created',
      },
    });

    logger.info(
      { canonicalTaskId, reviewId: reviewItem.id },
      'Conflict resolved: review item created for manual resolution',
    );

    return {
      action: 'review_created',
      details: `Review item ${reviewItem.id} created for conflict on fields: ${changedFields.join(', ')}`,
    };
  }
}
