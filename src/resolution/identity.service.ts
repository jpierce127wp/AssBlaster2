import { getLogger } from '../observability/logger.js';
import { EvidenceRepo } from '../ingestion/evidence.repo.js';
import { AuditRepo } from '../observability/audit.repo.js';
import { ReviewService } from '../review/review.service.js';
import { IdentityRepo } from './identity.repo.js';
import { CandidateTaskRepo } from '../normalization/normalization.repo.js';
import { TIER_CONFIDENCE } from './identity.types.js';
import type { IdentityResolutionResult } from './identity.types.js';
import { PipelineError } from '../domain/errors.js';
import type { EvidenceEventId, CandidateTaskId } from '../domain/types.js';

export class IdentityService {
  private identityRepo = new IdentityRepo();
  private evidenceRepo = new EvidenceRepo();
  private candidateTaskRepo = new CandidateTaskRepo();
  private auditRepo = new AuditRepo();
  private reviewService = new ReviewService();

  async resolve(evidenceEventId: EvidenceEventId, candidateTaskIds: string[]): Promise<IdentityResolutionResult> {
    const logger = getLogger();
    const event = await this.evidenceRepo.findById(evidenceEventId);
    if (!event) throw new PipelineError(`Evidence event not found: ${evidenceEventId}`, {
      code: 'EVIDENCE_NOT_FOUND', retryable: false, entityId: evidenceEventId, stage: 'resolution',
    });

    const participantNames = event.participants.map((p) => p.name);
    const contactHints = event.contact_hints ?? [];
    const resolvedIds: string[] = [];

    for (const ctId of candidateTaskIds) {
      const candidateTask = await this.candidateTaskRepo.findById(ctId as CandidateTaskId);
      if (!candidateTask) continue;

      let matterId: string | null = candidateTask.matter_id;
      let assigneeUserId: string | null = candidateTask.assignee_user_id;
      let resolutionKind = candidateTask.assignee_resolution_kind;
      let matterConfidence = 0.5;

      // Resolve matter using 6-tier priority chain
      if (candidateTask.matter_id) {
        const matterResult = await this.identityRepo.resolveMatter(
          candidateTask.matter_id,
          contactHints,
          participantNames,
        );

        if (matterResult) {
          matterId = matterResult.matterId;
          matterConfidence = TIER_CONFIDENCE[matterResult.tier];
          logger.info({
            ctId,
            matterId,
            tier: matterResult.tier,
            confidence: matterConfidence,
          }, 'Matter resolved');
        } else {
          // Tier 6: Unresolved — route to review if matter reference exists
          // but we could not resolve it (risk of contamination)
          logger.warn({ ctId, reference: candidateTask.matter_id }, 'Matter resolution failed, routing to review');
          await this.reviewService.createReviewItem({
            candidateTaskId: ctId as CandidateTaskId,
            reason: 'weak_identity',
            priority: 1,
          });
          matterConfidence = 0;
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

      // Combine matter and assignee confidence
      const assigneeConfidence = assigneeUserId ? 0.9 : 0.5;
      const overallConfidence = Math.min(matterConfidence, assigneeConfidence);

      // Update the candidate task in-place with resolved IDs
      await this.candidateTaskRepo.updateResolution(ctId as CandidateTaskId, {
        matterId,
        assigneeUserId,
        assigneeResolutionKind: resolutionKind,
        confidenceResolution: overallConfidence,
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
