import { getLogger } from '../kernel/logger.js';
import { AuditRepo } from '../observability/audit.repo.js';
import { RegistryRepo } from '../registry/registry.repo.js';
import type { AssignmentResult } from './assignment.types.js';
import type { CanonicalTaskId } from '../kernel/types.js';

export class AssignmentService {
  private registryRepo = new RegistryRepo();
  private auditRepo = new AuditRepo();

  async assign(canonicalTaskId: CanonicalTaskId): Promise<AssignmentResult> {
    const logger = getLogger();
    const task = await this.registryRepo.findById(canonicalTaskId);
    if (!task) throw new Error(`Canonical task not found: ${canonicalTaskId}`);

    // Method 1: Explicit assignee already set (from extraction/normalization/identity)
    if (task.assignee_user_id) {
      logger.info({ taskId: canonicalTaskId, assignee: task.assignee_user_id }, 'Using explicit assignee');
      return {
        assignee_user_id: task.assignee_user_id,
        assignee_role: task.assignee_role,
        method: 'explicit',
      };
    }

    // Method 2: Hardcoded fallback (no assignment_rules table)
    logger.info({ taskId: canonicalTaskId }, 'No assignee set, leaving unassigned');

    await this.auditRepo.log({
      entityType: 'canonical_task',
      entityId: canonicalTaskId,
      action: 'updated',
      summary: 'Assignment: no assignee, using fallback',
      metadata: { method: 'fallback' },
    });

    return {
      assignee_user_id: null,
      assignee_role: null,
      method: 'fallback',
    };
  }
}
