/**
 * Context builder — assembles all context a human reviewer needs for a review item.
 */

import { ReviewRepo } from './review.repo.js';
import { CandidateTaskRepo } from '../normalization/normalization.repo.js';
import { EvidenceRepo } from '../ingestion/evidence.repo.js';
import { ActionSpanRepo } from '../extraction/extraction.repo.js';
import { MergeDecisionRepo } from '../dedupe/dedup.repo.js';
import { RegistryRepo } from '../registry/registry.repo.js';
import { NotFoundError } from '../domain/errors.js';
import type { ReviewItem } from './review.types.js';
import type { CandidateTaskRow } from '../normalization/normalization.types.js';
import type { ActionSpanRow } from '../extraction/extraction.types.js';
import type { MergeDecision } from '../dedupe/dedup.types.js';
import type { CanonicalTask } from '../registry/registry.types.js';
import type { CanonicalTaskId } from '../domain/types.js';

/** Reason explanations for human-readable context */
const REASON_EXPLANATIONS: Record<string, string> = {
  low_confidence: 'The pipeline confidence score fell below the threshold for automatic processing.',
  ambiguous_dedup: 'Multiple canonical tasks matched this candidate with similar scores.',
  privilege_flag: 'This evidence was flagged with attorney-client or work-product privilege.',
  conflict: 'The canonical task was modified externally in Clio, causing a sync conflict.',
  manual: 'This item was manually flagged for review.',
  weak_identity: 'Matter, contact, or assignee resolution was uncertain.',
  authority_conflict: 'Multiple sources assign different users with equal authority.',
};

export interface ReviewContext {
  reviewItem: ReviewItem;
  candidateTask: CandidateTaskRow | null;
  evidenceEvent: {
    raw_text: string;
    cleaned_text: string | null;
    source_type: string;
    participants: Array<{ name: string; role?: string }>;
    matter_hints: string[];
    privilege_flags: Record<string, boolean>;
  } | null;
  actionSpan: ActionSpanRow | null;
  mergeDecisions: MergeDecision[];
  relatedCanonicalTasks: CanonicalTask[];
  reason_explanation: string;
}

export class ContextBuilder {
  private reviewRepo = new ReviewRepo();
  private candidateRepo = new CandidateTaskRepo();
  private evidenceRepo = new EvidenceRepo();
  private actionSpanRepo = new ActionSpanRepo();
  private mergeDecisionRepo = new MergeDecisionRepo();
  private registryRepo = new RegistryRepo();

  /** Build full review context for a review item */
  async build(reviewItemId: string): Promise<ReviewContext> {
    // 1. Load the review item
    const reviewItem = await this.reviewRepo.findById(reviewItemId);
    if (!reviewItem) {
      throw new NotFoundError('ReviewItem', reviewItemId);
    }

    // 2. Load candidate task
    const candidateTask = await this.candidateRepo.findById(reviewItem.candidate_task_id);

    // 3. Load evidence event
    let evidenceEvent: ReviewContext['evidenceEvent'] = null;
    if (candidateTask) {
      const ev = await this.evidenceRepo.findById(candidateTask.evidence_event_id);
      if (ev) {
        evidenceEvent = {
          raw_text: ev.raw_text,
          cleaned_text: ev.cleaned_text,
          source_type: ev.source_type,
          participants: ev.participants,
          matter_hints: ev.matter_hints,
          privilege_flags: ev.privilege_flags,
        };
      }
    }

    // 4. Load action span
    let actionSpan: ActionSpanRow | null = null;
    if (candidateTask?.action_span_id) {
      actionSpan = await this.actionSpanRepo.findById(candidateTask.action_span_id);
    }

    // 5. Load merge decisions for this candidate
    let mergeDecisions: MergeDecision[] = [];
    if (candidateTask) {
      mergeDecisions = await this.mergeDecisionRepo.findByCandidateTask(candidateTask.id);
    }

    // 6. Load related canonical tasks from merge decisions
    const canonicalTaskIds = new Set<CanonicalTaskId>();
    for (const decision of mergeDecisions) {
      if (decision.compared_canonical_id) canonicalTaskIds.add(decision.compared_canonical_id);
      if (decision.selected_canonical_id) canonicalTaskIds.add(decision.selected_canonical_id);
    }

    const relatedCanonicalTasks: CanonicalTask[] = [];
    for (const id of canonicalTaskIds) {
      const task = await this.registryRepo.findById(id);
      if (task) relatedCanonicalTasks.push(task);
    }

    // 7. Build reason explanation
    const reason_explanation =
      REASON_EXPLANATIONS[reviewItem.reason] ??
      `Review required: ${reviewItem.reason}`;

    return {
      reviewItem,
      candidateTask,
      evidenceEvent,
      actionSpan,
      mergeDecisions,
      relatedCanonicalTasks,
      reason_explanation,
    };
  }
}
