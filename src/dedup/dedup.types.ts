import type { CanonicalTaskId, CanonicalTaskStatus, MergeOutcome, MergeDecisionId, CandidateTaskId, AdjudicationLabel } from '../kernel/types.js';

/** Dedup decision outcome */
export type DedupDecision =
  | { action: 'create_new' }
  | { action: 'merge'; targetTaskId: CanonicalTaskId; similarity: number; method: DedupMethod }
  | { action: 'enrich'; targetTaskId: CanonicalTaskId; similarity: number; method: DedupMethod }
  | { action: 'follow_up'; relatedTaskId: CanonicalTaskId; similarity: number; method: DedupMethod }
  | { action: 'review'; candidates: DedupCandidate[]; reason: string }
  | { action: 'discard'; reason: string };

export type DedupMethod = 'deterministic' | 'semantic' | 'adjudication';

/** A potential duplicate candidate */
export interface DedupCandidate {
  taskId: CanonicalTaskId;
  canonicalSummary: string;
  similarity: number;
  method: DedupMethod;
  status: CanonicalTaskStatus;
}

/** Merge decision as stored in DB */
export interface MergeDecision {
  id: MergeDecisionId;
  candidate_task_id: CandidateTaskId;
  compared_canonical_id: CanonicalTaskId | null;
  selected_canonical_id: CanonicalTaskId | null;
  outcome: MergeOutcome;
  fingerprint_score: number | null;
  embedding_score: number | null;
  adjudication_label: AdjudicationLabel | null;
  rationale: string | null;
  created_by: string;
  created_at: Date;
}

/** Thresholds for dedup tiers */
export const DEDUP_THRESHOLDS = {
  /** Above this = auto-merge (semantic) */
  AUTO_MERGE: 0.90,
  /** Below this = create new (semantic) */
  CREATE_NEW: 0.75,
  /** If adjudication confidence below this, route to review */
  ADJUDICATION_REVIEW: 0.75,
} as const;
