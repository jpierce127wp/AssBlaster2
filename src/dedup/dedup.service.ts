import { getLogger } from '../kernel/logger.js';
import { AuditRepo } from '../observability/audit.repo.js';
import { EvidenceRepo } from '../evidence/evidence.repo.js';
import { RegistryService } from '../registry/registry.service.js';
import { CandidateTaskRepo } from '../normalization/normalization.repo.js';
import { MergeDecisionRepo } from './dedup.repo.js';
import { DeterministicDedup } from './dedup.deterministic.js';
import { SemanticDedup } from './dedup.semantic.js';
import { DedupAdjudicator } from './dedup.adjudicator.js';
import { DEDUP_THRESHOLDS, type DedupDecision } from './dedup.types.js';
import type { CandidateTaskRow } from '../normalization/normalization.types.js';
import type { CanonicalTaskId, CandidateTaskId, EvidenceEventId } from '../kernel/types.js';

export class DedupService {
  private deterministic = new DeterministicDedup();
  private semantic = new SemanticDedup();
  private adjudicator = new DedupAdjudicator();
  private registry = new RegistryService();
  private evidenceRepo = new EvidenceRepo();
  private candidateTaskRepo = new CandidateTaskRepo();
  private mergeDecisionRepo = new MergeDecisionRepo();
  private auditRepo = new AuditRepo();

  async checkAndProcess(
    evidenceEventId: EvidenceEventId,
    candidateTaskId: CandidateTaskId,
  ): Promise<{ decision: DedupDecision; canonicalTaskId: CanonicalTaskId | null }> {
    const logger = getLogger();

    const candidateTask = await this.candidateTaskRepo.findById(candidateTaskId);
    if (!candidateTask) throw new Error(`Candidate task not found: ${candidateTaskId}`);

    // Tier 1: Deterministic fingerprint match
    const exactMatch = await this.deterministic.findExactMatch(
      candidateTask.canonical_summary,
      candidateTask.matter_id,
      candidateTask.action_type,
      candidateTask.due_date_window_start,
    );

    if (exactMatch) {
      logger.info({ taskId: exactMatch.match.id }, 'Deterministic dedup match found');

      // Merge evidence into existing task
      await this.registry.mergeEvidence(
        exactMatch.match.id,
        evidenceEventId,
        candidateTask.action_span_id as string | null,
        ['canonical_summary'],
        null,
      );

      // Record merge decision
      await this.mergeDecisionRepo.insert({
        candidateTaskId,
        comparedCanonicalId: exactMatch.match.id,
        selectedCanonicalId: exactMatch.match.id,
        outcome: 'merged',
        fingerprintScore: 1.0,
        embeddingScore: null,
        adjudicationLabel: null,
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

      // Auto-merge if similarity above threshold
      if (topCandidate.similarity >= DEDUP_THRESHOLDS.AUTO_MERGE) {
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
          adjudicationLabel: null,
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

      if (adjResult.decision === 'merge' && adjResult.targetTaskId) {
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
          adjudicationLabel: 'merge',
          rationale: adjResult.reasoning,
          createdBy: 'system',
        });

        await this.evidenceRepo.updateState(evidenceEventId, 'decided');

        return {
          decision: { action: 'merge', targetTaskId: adjResult.targetTaskId, similarity: adjResult.confidence, method: 'adjudication' },
          canonicalTaskId: adjResult.targetTaskId,
        };
      }

      if (adjResult.decision === 'review') {
        await this.mergeDecisionRepo.insert({
          candidateTaskId,
          comparedCanonicalId: topCandidate.taskId,
          selectedCanonicalId: null,
          outcome: 'review',
          fingerprintScore: null,
          embeddingScore: topCandidate.similarity,
          adjudicationLabel: 'review',
          rationale: adjResult.reasoning,
          createdBy: 'system',
        });

        await this.evidenceRepo.updateState(evidenceEventId, 'failed');

        return {
          decision: { action: 'review', candidates, reason: adjResult.reasoning },
          canonicalTaskId: null,
        };
      }
    }

    // No match found — create new canonical task
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
}
