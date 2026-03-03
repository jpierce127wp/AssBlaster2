import { RegistryRepo } from './registry.repo.js';
import { AuditRepo } from '../observability/audit.repo.js';
import { getLogger } from '../kernel/logger.js';
import type { CanonicalTask, CreateTaskInput, UpdateTaskInput } from './registry.types.js';
import { HUMAN_SENSITIVE_FIELDS } from './registry.types.js';
import type { CanonicalTaskId, PaginationParams, PaginatedResult } from '../kernel/types.js';

export class RegistryService {
  private repo = new RegistryRepo();
  private auditRepo = new AuditRepo();

  async createTask(input: CreateTaskInput, evidenceEventId: string, actionSpanId: string | null): Promise<CanonicalTask> {
    const logger = getLogger();
    const task = await this.repo.create(input);

    // Add initial task evidence link
    await this.repo.addTaskEvidenceLink({
      canonicalTaskId: task.id,
      evidenceEventId,
      actionSpanId,
      relationType: 'supporting',
      changeImpact: 'major',
      impactedFields: ['canonical_summary', 'action_type', 'priority'],
      rationale: 'Initial task creation',
    });

    await this.auditRepo.log({
      entityType: 'canonical_task',
      entityId: task.id,
      action: 'created',
      summary: `Task created: ${task.canonical_summary}`,
      metadata: { priority: task.priority, action_type: task.action_type },
    });

    logger.info({ taskId: task.id, summary: task.canonical_summary }, 'Canonical task created');
    return task;
  }

  async updateTask(id: CanonicalTaskId, input: UpdateTaskInput): Promise<CanonicalTask> {
    const task = await this.repo.update(id, input);

    await this.auditRepo.log({
      entityType: 'canonical_task',
      entityId: id,
      action: 'updated',
      summary: `Task updated: ${Object.keys(input).join(', ')}`,
      metadata: { changes: Object.keys(input) },
    });

    return task;
  }

  /**
   * Enrich an existing task with new data from a candidate task.
   * Only fills in fields that are currently null/empty.
   * Respects human edit protection: if a human has edited the task,
   * sensitive fields are not overwritten.
   */
  async enrichTask(
    taskId: CanonicalTaskId,
    candidateData: {
      targetObject?: string | null;
      desiredOutcome?: string | null;
      assigneeUserId?: string | null;
      assigneeRole?: string | null;
      dueDateKind?: string | null;
      dueDateWindowStart?: string | null;
      dueDateWindowEnd?: string | null;
      priority?: string;
    },
    evidenceEventId: string,
    actionSpanId: string | null,
  ): Promise<{ enrichedFields: string[] }> {
    const logger = getLogger();
    const task = await this.repo.findById(taskId);
    if (!task) throw new Error(`Canonical task not found: ${taskId}`);

    const isHumanEdited = task.human_edited_at !== null;
    const updates: Record<string, unknown> = {};
    const enrichedFields: string[] = [];

    // Only fill blank fields, respecting human edit protection
    const candidates: Array<{ field: string; dbField: string; currentVal: unknown; newVal: unknown }> = [
      { field: 'target_object', dbField: 'target_object', currentVal: task.target_object, newVal: candidateData.targetObject },
      { field: 'desired_outcome', dbField: 'desired_outcome', currentVal: task.desired_outcome, newVal: candidateData.desiredOutcome },
      { field: 'assignee_user_id', dbField: 'assignee_user_id', currentVal: task.assignee_user_id, newVal: candidateData.assigneeUserId },
      { field: 'assignee_role', dbField: 'assignee_role', currentVal: task.assignee_role, newVal: candidateData.assigneeRole },
      { field: 'due_date_kind', dbField: 'due_date_kind', currentVal: task.due_date_kind, newVal: candidateData.dueDateKind },
      { field: 'due_date_window_start', dbField: 'due_date_window_start', currentVal: task.due_date_window_start, newVal: candidateData.dueDateWindowStart },
      { field: 'due_date_window_end', dbField: 'due_date_window_end', currentVal: task.due_date_window_end, newVal: candidateData.dueDateWindowEnd },
    ];

    for (const { field, dbField, currentVal, newVal } of candidates) {
      if (currentVal != null) continue; // Already has a value, skip
      if (newVal == null) continue; // No new value to fill

      // Human edit protection: skip sensitive fields if human has edited
      if (isHumanEdited && HUMAN_SENSITIVE_FIELDS.has(field)) {
        logger.info({ taskId, field }, 'Skipping enrichment of human-edited sensitive field');
        continue;
      }

      updates[dbField] = newVal;
      enrichedFields.push(field);
    }

    if (enrichedFields.length > 0) {
      await this.repo.update(taskId, updates as UpdateTaskInput);

      await this.repo.addTaskEvidenceLink({
        canonicalTaskId: taskId,
        evidenceEventId,
        actionSpanId,
        relationType: 'supporting',
        changeImpact: 'minor',
        impactedFields: enrichedFields,
        rationale: `Enriched fields: ${enrichedFields.join(', ')}`,
      });
      await this.repo.incrementEvidenceCount(taskId);

      await this.auditRepo.log({
        entityType: 'canonical_task',
        entityId: taskId,
        action: 'updated',
        summary: `Task enriched: ${enrichedFields.join(', ')}`,
        metadata: { enriched_fields: enrichedFields, evidence_event_id: evidenceEventId },
      });

      logger.info({ taskId, enrichedFields }, 'Task enriched with new evidence');
    } else {
      // Still link the evidence even if no fields enriched
      await this.repo.addTaskEvidenceLink({
        canonicalTaskId: taskId,
        evidenceEventId,
        actionSpanId,
        relationType: 'supporting',
        changeImpact: 'none',
        impactedFields: [],
        rationale: 'Evidence linked (no new fields to enrich)',
      });
      await this.repo.incrementEvidenceCount(taskId);
    }

    return { enrichedFields };
  }

  async mergeEvidence(
    taskId: CanonicalTaskId,
    evidenceEventId: string,
    actionSpanId: string | null,
    impactedFields: string[],
    rationale: string | null,
  ): Promise<void> {
    await this.repo.addTaskEvidenceLink({
      canonicalTaskId: taskId,
      evidenceEventId,
      actionSpanId,
      relationType: 'supporting',
      changeImpact: 'minor',
      impactedFields,
      rationale: rationale ?? 'Evidence merged via dedup',
    });
    await this.repo.incrementEvidenceCount(taskId);

    await this.auditRepo.log({
      entityType: 'canonical_task',
      entityId: taskId,
      action: 'merged',
      summary: 'Evidence merged into task',
      metadata: { evidence_event_id: evidenceEventId, impacted_fields: impactedFields },
    });
  }

  async findById(id: CanonicalTaskId): Promise<CanonicalTask | null> {
    return this.repo.findById(id);
  }

  async findAll(pagination: PaginationParams): Promise<PaginatedResult<CanonicalTask>> {
    return this.repo.findAll(pagination);
  }

  async getTaskEvidenceLinks(taskId: CanonicalTaskId) {
    return this.repo.getTaskEvidenceLinks(taskId);
  }
}
