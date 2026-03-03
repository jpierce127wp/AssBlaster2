import { getLogger } from '../kernel/logger.js';
import { AuditRepo } from '../observability/audit.repo.js';
import { EvidenceRepo } from '../evidence/evidence.repo.js';
import { ReviewService } from '../review/review.service.js';
import { RegistryService } from '../registry/registry.service.js';
import { CandidateTaskRepo } from '../normalization/normalization.repo.js';
import { MergeDecisionRepo } from './dedup.repo.js';
import { DeterministicDedup } from './dedup.deterministic.js';
import { SemanticDedup } from './dedup.semantic.js';
import { DedupAdjudicator } from './dedup.adjudicator.js';
import { resolveDueDateConflict, resolveAssignmentConflict } from './dedup.conflicts.js';
import { DEDUP_THRESHOLDS, type DedupDecision } from './dedup.types.js';
import type { CandidateTaskRow } from '../normalization/normalization.types.js';
import type { CanonicalTaskId, CandidateTaskId, EvidenceEventId, SourceAuthority } from '../kernel/types.js';

/** Statuses where we should NOT auto-merge (reopen protection) */
const COMPLETED_STATUSES = new Set(['complete', 'superseded', 'discarded']);

export class DedupService {
  private deterministic = new DeterministicDedup();
  private semantic = new SemanticDedup();
  private adjudicator = new DedupAdjudicator();
  private registry = new RegistryService();
  private evidenceRepo = new EvidenceRepo();
  private candidateTaskRepo = new CandidateTaskRepo();
  private mergeDecisionRepo = new MergeDecisionRepo();
  private reviewService = new ReviewService();
  private auditRepo = new AuditRepo();

  async checkAndProcess(
    evidenceEventId: EvidenceEventId,
    candidateTaskId: CandidateTaskId,
  ): Promise<{ decision: DedupDecision; canonicalTaskId: CanonicalTaskId | null }> {
    const logger = getLogger();

    const candidateTask = await this.candidateTaskRepo.findById(candidateTaskId);
    if (!candidateTask) throw new Error(`Candidate task not found: ${candidateTaskId}`);

    // Pre-check: discard if combined confidence is too low
    const combinedConfidence = Math.min(
      candidateTask.confidence_extraction,
      candidateTask.confidence_normalization,
      candidateTask.confidence_resolution || 1,
    );
    if (combinedConfidence < DEDUP_THRESHOLDS.ADJUDICATION_REVIEW) {
      logger.info({ candidateTaskId, combinedConfidence }, 'Discarding low-confidence candidate');

      await this.mergeDecisionRepo.insert({
        candidateTaskId,
        comparedCanonicalId: null,
        selectedCanonicalId: null,
        outcome: 'discarded',
        fingerprintScore: null,
        embeddingScore: null,
        adjudicationLabel: null,
        rationale: `Combined confidence too low: ${combinedConfidence.toFixed(2)}`,
        createdBy: 'system',
      });

      await this.evidenceRepo.updateState(evidenceEventId, 'decided');

      return {
        decision: { action: 'discard', reason: `Combined confidence ${combinedConfidence.toFixed(2)} below threshold` },
        canonicalTaskId: null,
      };
    }

    // Tier 1: Deterministic fingerprint match
    const exactMatch = await this.deterministic.findExactMatch(
      candidateTask.canonical_summary,
      candidateTask.matter_id,
      candidateTask.action_type,
      candidateTask.due_date_window_start,
    );

    if (exactMatch) {
      // Reopen protection: if matched task is complete, create follow-up instead
      if (exactMatch.isTerminal) {
        logger.info({ taskId: exactMatch.match.id, status: exactMatch.match.status }, 'Deterministic match on completed task, creating follow-up');
        return this.createFollowUp(candidateTask, evidenceEventId, candidateTaskId, exactMatch.match.id);
      }

      logger.info({ taskId: exactMatch.match.id }, 'Deterministic dedup match found');

      // Merge evidence into existing task
      await this.registry.mergeEvidence(
        exactMatch.match.id,
        evidenceEventId,
        candidateTask.action_span_id as string | null,
        ['canonical_summary'],
        null,
      );

      await this.mergeDecisionRepo.insert({
        candidateTaskId,
        comparedCanonicalId: exactMatch.match.id,
        selectedCanonicalId: exactMatch.match.id,
        outcome: 'merged',
        fingerprintScore: 1.0,
        embeddingScore: null,
        adjudicationLabel: 'same_task_merge',
        rationale: 'Deterministic fingerprint match',
        createdBy: 'system',
      });

      await this.evidenceRepo.updateState(evidenceEventId, 'decided');

      return {
        decision: { action: 'merge', targetTaskId: exactMatch.match.id, similarity: 1.0, method: 'deterministic' },
        canonicalTaskId: exactMatch.match.id,
      };
    }

    // Tier 2: Semantic similarity
    const { embedding, candidates } = await this.semantic.findSimilar(
      candidateTask.canonical_summary,
      candidateTask.target_object,
      candidateTask.matter_id,
    );

    if (candidates.length > 0) {
      const topCandidate = candidates[0]!;

      // Auto-merge if similarity above threshold AND task is not completed
      if (topCandidate.similarity >= DEDUP_THRESHOLDS.AUTO_MERGE) {
        // Reopen protection
        if (COMPLETED_STATUSES.has(topCandidate.status)) {
          logger.info({ taskId: topCandidate.taskId, status: topCandidate.status }, 'Semantic auto-merge blocked by completed status, creating follow-up');
          return this.createFollowUp(candidateTask, evidenceEventId, candidateTaskId, topCandidate.taskId);
        }

        logger.info({ taskId: topCandidate.taskId, similarity: topCandidate.similarity }, 'Semantic auto-merge');

        await this.registry.mergeEvidence(
          topCandidate.taskId,
          evidenceEventId,
          candidateTask.action_span_id as string | null,
          ['canonical_summary'],
          null,
        );

        await this.mergeDecisionRepo.insert({
          candidateTaskId,
          comparedCanonicalId: topCandidate.taskId,
          selectedCanonicalId: topCandidate.taskId,
          outcome: 'merged',
          fingerprintScore: null,
          embeddingScore: topCandidate.similarity,
          adjudicationLabel: 'same_task_merge',
          rationale: `Semantic similarity: ${(topCandidate.similarity * 100).toFixed(1)}%`,
          createdBy: 'system',
        });

        await this.evidenceRepo.updateState(evidenceEventId, 'decided');

        return {
          decision: { action: 'merge', targetTaskId: topCandidate.taskId, similarity: topCandidate.similarity, method: 'semantic' },
          canonicalTaskId: topCandidate.taskId,
        };
      }

      // Tier 3: Adjudication for ambiguous range
      logger.info({ candidates: candidates.length }, 'Sending to adjudicator');

      const adjResult = await this.adjudicator.adjudicate(
        candidateTask.canonical_summary,
        candidateTask.target_object,
        candidates,
      );

      // Handle adjudication result based on decision label
      switch (adjResult.decision) {
        case 'same_task_merge': {
          if (!adjResult.targetTaskId) break;

          // Reopen protection
          const targetCandidate = candidates.find((c) => c.taskId === adjResult.targetTaskId);
          if (targetCandidate && COMPLETED_STATUSES.has(targetCandidate.status)) {
            logger.info({ taskId: adjResult.targetTaskId }, 'Adjudicator merge blocked by completed status, creating follow-up');
            return this.createFollowUp(candidateTask, evidenceEventId, candidateTaskId, adjResult.targetTaskId);
          }

          await this.registry.mergeEvidence(
            adjResult.targetTaskId,
            evidenceEventId,
            candidateTask.action_span_id as string | null,
            ['canonical_summary'],
            adjResult.reasoning,
          );

          await this.mergeDecisionRepo.insert({
            candidateTaskId,
            comparedCanonicalId: adjResult.targetTaskId,
            selectedCanonicalId: adjResult.targetTaskId,
            outcome: 'merged',
            fingerprintScore: null,
            embeddingScore: null,
            adjudicationLabel: 'same_task_merge',
            rationale: adjResult.reasoning,
            createdBy: 'system',
          });

          await this.evidenceRepo.updateState(evidenceEventId, 'decided');

          return {
            decision: { action: 'merge', targetTaskId: adjResult.targetTaskId, similarity: adjResult.confidence, method: 'adjudication' },
            canonicalTaskId: adjResult.targetTaskId,
          };
        }

        case 'same_task_enrich': {
          if (!adjResult.targetTaskId) break;

          // Check for conflicts before enriching
          await this.enrichWithConflictCheck(
            adjResult.targetTaskId,
            candidateTask,
            evidenceEventId,
            candidateTaskId,
          );

          await this.mergeDecisionRepo.insert({
            candidateTaskId,
            comparedCanonicalId: adjResult.targetTaskId,
            selectedCanonicalId: adjResult.targetTaskId,
            outcome: 'enriched',
            fingerprintScore: null,
            embeddingScore: null,
            adjudicationLabel: 'same_task_enrich',
            rationale: adjResult.reasoning,
            createdBy: 'system',
          });

          await this.evidenceRepo.updateState(evidenceEventId, 'decided');

          return {
            decision: { action: 'enrich', targetTaskId: adjResult.targetTaskId, similarity: adjResult.confidence, method: 'adjudication' },
            canonicalTaskId: adjResult.targetTaskId,
          };
        }

        case 'related_followup': {
          if (!adjResult.targetTaskId) break;
          return this.createFollowUp(candidateTask, evidenceEventId, candidateTaskId, adjResult.targetTaskId);
        }

        case 'distinct': {
          // Fall through to create new task below
          break;
        }

        case 'needs_review': {
          await this.mergeDecisionRepo.insert({
            candidateTaskId,
            comparedCanonicalId: topCandidate.taskId,
            selectedCanonicalId: null,
            outcome: 'review',
            fingerprintScore: null,
            embeddingScore: topCandidate.similarity,
            adjudicationLabel: 'needs_review',
            rationale: adjResult.reasoning,
            createdBy: 'system',
          });

          await this.reviewService.createReviewItem({
            candidateTaskId,
            reason: 'ambiguous_dedup',
            priority: 1,
          });

          await this.evidenceRepo.updateState(evidenceEventId, 'failed');

          return {
            decision: { action: 'review', candidates, reason: adjResult.reasoning },
            canonicalTaskId: null,
          };
        }
      }
    }

    // No match found — create new canonical task
    return this.createNewCanonicalTask(candidateTask, evidenceEventId, candidateTaskId, embedding);
  }

  /**
   * Create a new canonical task when no dedup match is found.
   */
  private async createNewCanonicalTask(
    candidateTask: CandidateTaskRow,
    evidenceEventId: EvidenceEventId,
    candidateTaskId: CandidateTaskId,
    embedding: number[],
  ): Promise<{ decision: DedupDecision; canonicalTaskId: CanonicalTaskId }> {
    const logger = getLogger();

    const fingerprint = DeterministicDedup.computeFingerprint(
      candidateTask.canonical_summary,
      candidateTask.matter_id,
      candidateTask.action_type,
      candidateTask.due_date_window_start,
    );

    const newTask = await this.registry.createTask({
      canonicalSummary: candidateTask.canonical_summary,
      actionType: candidateTask.action_type,
      targetObject: candidateTask.target_object,
      desiredOutcome: candidateTask.desired_outcome,
      assigneeUserId: candidateTask.assignee_user_id,
      assigneeRole: candidateTask.assignee_name,
      priority: candidateTask.priority,
      dueDateKind: candidateTask.due_date_kind,
      dueDateWindowStart: candidateTask.due_date_window_start,
      dueDateWindowEnd: candidateTask.due_date_window_end,
      matterId: candidateTask.matter_id,
      fingerprint,
      summaryEmbedding: embedding,
    }, evidenceEventId, candidateTask.action_span_id as string | null);

    await this.mergeDecisionRepo.insert({
      candidateTaskId,
      comparedCanonicalId: null,
      selectedCanonicalId: newTask.id,
      outcome: 'created',
      fingerprintScore: null,
      embeddingScore: null,
      adjudicationLabel: null,
      rationale: 'No dedup match found',
      createdBy: 'system',
    });

    await this.evidenceRepo.updateState(evidenceEventId, 'decided');

    logger.info({ taskId: newTask.id, summary: newTask.canonical_summary }, 'New canonical task created (no dedup match)');

    return {
      decision: { action: 'create_new' },
      canonicalTaskId: newTask.id,
    };
  }

  /**
   * Create a follow-up task linked to a related prior task.
   * Used when the prior task is complete or when the adjudicator
   * determines this is downstream/follow-up work.
   */
  private async createFollowUp(
    candidateTask: CandidateTaskRow,
    evidenceEventId: EvidenceEventId,
    candidateTaskId: CandidateTaskId,
    relatedTaskId: CanonicalTaskId,
  ): Promise<{ decision: DedupDecision; canonicalTaskId: CanonicalTaskId }> {
    const logger = getLogger();

    const fingerprint = DeterministicDedup.computeFingerprint(
      candidateTask.canonical_summary,
      candidateTask.matter_id,
      candidateTask.action_type,
      candidateTask.due_date_window_start,
    );

    const newTask = await this.registry.createTask({
      canonicalSummary: candidateTask.canonical_summary,
      actionType: candidateTask.action_type,
      targetObject: candidateTask.target_object,
      desiredOutcome: candidateTask.desired_outcome,
      assigneeUserId: candidateTask.assignee_user_id,
      assigneeRole: candidateTask.assignee_name,
      priority: candidateTask.priority,
      dueDateKind: candidateTask.due_date_kind,
      dueDateWindowStart: candidateTask.due_date_window_start,
      dueDateWindowEnd: candidateTask.due_date_window_end,
      matterId: candidateTask.matter_id,
      fingerprint,
      summaryEmbedding: [], // Will be computed if needed
    }, evidenceEventId, candidateTask.action_span_id as string | null);

    await this.mergeDecisionRepo.insert({
      candidateTaskId,
      comparedCanonicalId: relatedTaskId,
      selectedCanonicalId: newTask.id,
      outcome: 'follow_up',
      fingerprintScore: null,
      embeddingScore: null,
      adjudicationLabel: 'related_followup',
      rationale: `Follow-up to task ${relatedTaskId}`,
      createdBy: 'system',
    });

    await this.evidenceRepo.updateState(evidenceEventId, 'decided');

    logger.info({ taskId: newTask.id, relatedTaskId, summary: newTask.canonical_summary }, 'Follow-up task created');

    return {
      decision: { action: 'follow_up', relatedTaskId, similarity: 0, method: 'adjudication' },
      canonicalTaskId: newTask.id,
    };
  }

  /**
   * Enrich an existing task with conflict checking.
   * If fields conflict (both have values), use conflict resolution rules.
   */
  private async enrichWithConflictCheck(
    targetTaskId: CanonicalTaskId,
    candidateTask: CandidateTaskRow,
    evidenceEventId: EvidenceEventId,
    candidateTaskId: CandidateTaskId,
  ): Promise<void> {
    const logger = getLogger();
    const existingTask = await this.registry.findById(targetTaskId);
    if (!existingTask) return;

    // Check for due date conflict
    if (existingTask.due_date_window_start && candidateTask.due_date_window_start
        && existingTask.due_date_window_start !== candidateTask.due_date_window_start) {
      const dueDateResult = resolveDueDateConflict(
        {
          value: existingTask.due_date_window_start,
          authority: null, // existing task doesn't track source_authority
          updatedAt: existingTask.updated_at,
        },
        {
          value: candidateTask.due_date_window_start,
          authority: (candidateTask.source_authority as SourceAuthority) ?? null,
        },
      );

      if (dueDateResult.outcome === 'review') {
        logger.info({ targetTaskId, reason: dueDateResult.reason }, 'Due date conflict, routing to review');
        await this.reviewService.createReviewItem({
          candidateTaskId,
          reason: 'authority_conflict',
          priority: 2,
        });
      }
    }

    // Check for assignment conflict
    if (existingTask.assignee_user_id && candidateTask.assignee_user_id
        && existingTask.assignee_user_id !== candidateTask.assignee_user_id) {
      const assignResult = resolveAssignmentConflict(
        { userId: existingTask.assignee_user_id, authority: null },
        { userId: candidateTask.assignee_user_id, authority: (candidateTask.source_authority as SourceAuthority) ?? null },
      );

      if (assignResult.outcome === 'review') {
        logger.info({ targetTaskId, reason: assignResult.reason }, 'Assignment conflict, routing to review');
        await this.reviewService.createReviewItem({
          candidateTaskId,
          reason: 'authority_conflict',
          priority: 2,
        });
      }
    }

    // Proceed with enrichment (only fills blank fields)
    await this.registry.enrichTask(
      targetTaskId,
      {
        targetObject: candidateTask.target_object,
        desiredOutcome: candidateTask.desired_outcome,
        assigneeUserId: candidateTask.assignee_user_id,
        assigneeRole: candidateTask.assignee_name,
        dueDateKind: candidateTask.due_date_kind,
        dueDateWindowStart: candidateTask.due_date_window_start,
        dueDateWindowEnd: candidateTask.due_date_window_end,
        priority: candidateTask.priority,
      },
      evidenceEventId,
      candidateTask.action_span_id as string | null,
    );
  }
}
