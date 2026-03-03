import { getLogger } from '../kernel/logger.js';
import { AuditRepo } from '../observability/audit.repo.js';
import { RegistryRepo } from '../registry/registry.repo.js';
import type { AssignmentResult, AssignmentMethod } from './assignment.types.js';
import type { CanonicalTaskId } from '../kernel/types.js';

/** Ambiguous assignee tokens that should not be resolved to a person */
const AMBIGUOUS_ASSIGNEES = new Set(['we', 'someone', 'somebody', 'the team', 'us', 'anyone']);

export class AssignmentService {
  private registryRepo = new RegistryRepo();
  private auditRepo = new AuditRepo();

  async assign(canonicalTaskId: CanonicalTaskId): Promise<AssignmentResult> {
    const logger = getLogger();
    const task = await this.registryRepo.findById(canonicalTaskId);
    if (!task) throw new Error(`Canonical task not found: ${canonicalTaskId}`);

    // Guard: if assignee_role is an ambiguous term, do not resolve — fall through to triage
    if (task.assignee_role && AMBIGUOUS_ASSIGNEES.has(task.assignee_role.toLowerCase().trim())) {
      logger.info({ taskId: canonicalTaskId, role: task.assignee_role }, 'Ambiguous assignee, routing to triage');
      return this.logAndReturn(canonicalTaskId, null, null, 'triage');
    }

    // Tier 1: Explicit person named in evidence (user ID already resolved)
    if (task.assignee_user_id) {
      logger.info({ taskId: canonicalTaskId, assignee: task.assignee_user_id }, 'Tier 1: explicit assignee');
      return this.logAndReturn(canonicalTaskId, task.assignee_user_id, task.assignee_role, 'explicit');
    }

    // Tier 2: Explicit role named but no user ID resolved
    if (task.assignee_role) {
      logger.info({ taskId: canonicalTaskId, role: task.assignee_role }, 'Tier 2: role-based (no user ID)');
      return this.logAndReturn(canonicalTaskId, null, task.assignee_role, 'role');
    }

    // Tier 3: Existing owner of matching open canonical task (same matter + same action type)
    if (task.matter_id) {
      const existingOwner = await this.findExistingOwner(task.matter_id, task.action_type);
      if (existingOwner) {
        logger.info({ taskId: canonicalTaskId, existingOwner }, 'Tier 3: existing owner match');
        return this.logAndReturn(canonicalTaskId, existingOwner.userId, existingOwner.role, 'existing_owner');
      }

      // Tier 4: Matter owner / responsible attorney
      const matterOwner = await this.findMatterOwner(task.matter_id);
      if (matterOwner) {
        logger.info({ taskId: canonicalTaskId, matterOwner }, 'Tier 4: matter owner');
        return this.logAndReturn(canonicalTaskId, matterOwner.userId, matterOwner.role, 'matter_owner');
      }
    }

    // Tier 5: Practice area + action type rules (stub — no rules table yet)
    logger.info({ taskId: canonicalTaskId }, 'Tier 5: no assignment rules table, skipping');

    // Tier 6: Triage queue (unassigned)
    logger.info({ taskId: canonicalTaskId }, 'Tier 6: routing to triage queue');
    return this.logAndReturn(canonicalTaskId, null, null, 'triage');
  }

  /**
   * Find an existing assignee from open canonical tasks in the same matter
   * with the same action type.
   */
  private async findExistingOwner(
    matterId: string,
    actionType: string,
  ): Promise<{ userId: string; role: string | null } | null> {
    const result = await this.registryRepo.findAssignedTaskByMatterAndAction(matterId, actionType);
    if (result && result.assignee_user_id) {
      return { userId: result.assignee_user_id, role: result.assignee_role };
    }
    return null;
  }

  /**
   * Find the most common assignee (matter owner) for a given matter.
   */
  private async findMatterOwner(
    matterId: string,
  ): Promise<{ userId: string; role: string | null } | null> {
    const result = await this.registryRepo.findMatterOwner(matterId);
    if (result?.assignee_user_id) {
      return { userId: result.assignee_user_id, role: result.assignee_role };
    }
    return null;
  }

  private async logAndReturn(
    taskId: CanonicalTaskId,
    userId: string | null,
    role: string | null,
    method: AssignmentMethod,
  ): Promise<AssignmentResult> {
    await this.auditRepo.log({
      entityType: 'canonical_task',
      entityId: taskId,
      action: 'updated',
      summary: `Assignment: method=${method}`,
      metadata: { method, assignee_user_id: userId, assignee_role: role },
    });

    return { assignee_user_id: userId, assignee_role: role, method };
  }
}
