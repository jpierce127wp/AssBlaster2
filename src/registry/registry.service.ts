import { RegistryRepo } from './registry.repo.js';
import { AuditRepo } from '../observability/audit.repo.js';
import { getLogger } from '../kernel/logger.js';
import type { CanonicalTask, CreateTaskInput, UpdateTaskInput } from './registry.types.js';
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
