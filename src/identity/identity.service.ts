import { getLogger } from '../kernel/logger.js';
import { EvidenceRepo } from '../evidence/evidence.repo.js';
import { AuditRepo } from '../observability/audit.repo.js';
import { IdentityRepo } from './identity.repo.js';
import { CandidateTaskRepo } from '../normalization/normalization.repo.js';
import type { IdentityResolutionResult } from './identity.types.js';
import type { EvidenceEventId, CandidateTaskId } from '../kernel/types.js';

export class IdentityService {
  private identityRepo = new IdentityRepo();
  private evidenceRepo = new EvidenceRepo();
  private candidateTaskRepo = new CandidateTaskRepo();
  private auditRepo = new AuditRepo();

  async resolve(evidenceEventId: EvidenceEventId, candidateTaskIds: string[]): Promise<IdentityResolutionResult> {
    const logger = getLogger();
    const event = await this.evidenceRepo.findById(evidenceEventId);
    if (!event) throw new Error(`Evidence event not found: ${evidenceEventId}`);

    const resolvedIds: string[] = [];

    for (const ctId of candidateTaskIds) {
      const candidateTask = await this.candidateTaskRepo.findById(ctId as CandidateTaskId);
      if (!candidateTask) continue;

      let matterId: string | null = candidateTask.matter_id;
      let assigneeUserId: string | null = candidateTask.assignee_user_id;
      let resolutionKind = candidateTask.assignee_resolution_kind;

      // Resolve matter
      if (candidateTask.matter_id) {
        const matterResult = await this.identityRepo.resolveMatter(candidateTask.matter_id);
        if (matterResult) {
          matterId = matterResult.matterId;
        }
      }

      // Resolve assignee
      if (candidateTask.assignee_name && !candidateTask.assignee_user_id) {
        const assigneeResult = await this.identityRepo.resolveAssignee(candidateTask.assignee_name);
        if (assigneeResult) {
          assigneeUserId = assigneeResult.userId;
          resolutionKind = 'resolved';
        }
      }

      // Update the candidate task in-place with resolved IDs
      await this.candidateTaskRepo.updateResolution(ctId as CandidateTaskId, {
        matterId,
        assigneeUserId,
        assigneeResolutionKind: resolutionKind,
        confidenceResolution: assigneeUserId ? 0.9 : 0.5,
      });

      resolvedIds.push(ctId);
    }

    await this.evidenceRepo.updateState(evidenceEventId, 'resolved');

    await this.auditRepo.log({
      entityType: 'evidence_event',
      entityId: evidenceEventId,
      action: 'updated',
      summary: `Identity resolution completed: ${resolvedIds.length} tasks`,
      metadata: {
        tasks_resolved: resolvedIds.length,
      },
    });

    logger.info({ evidenceEventId, tasksResolved: resolvedIds.length }, 'Identity resolution complete');

    return { evidenceEventId, resolvedCandidateTaskIds: resolvedIds };
  }
}
