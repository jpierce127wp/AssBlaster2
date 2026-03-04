/** Branded type helper for type-safe IDs */
type Brand<T, B extends string> = T & { readonly __brand: B };

export type EvidenceEventId = Brand<string, 'EvidenceEventId'>;
export type ActionSpanId = Brand<string, 'ActionSpanId'>;
export type CandidateTaskId = Brand<string, 'CandidateTaskId'>;
export type CanonicalTaskId = Brand<string, 'CanonicalTaskId'>;
export type MergeDecisionId = Brand<string, 'MergeDecisionId'>;
export type ReviewItemId = Brand<string, 'ReviewItemId'>;
export type ClioTaskLinkId = Brand<string, 'ClioTaskLinkId'>;

/** Result type for operations that can fail */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Pagination types */
export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Source types */
export type SourceType = 'phone' | 'email' | 'meeting';

/** Processing state (6 simplified states) */
export type ProcessingState =
  | 'received' | 'extracted' | 'normalized'
  | 'resolved' | 'decided' | 'failed';

/** Task priority */
export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';

/** Canonical task status */
export type CanonicalTaskStatus =
  | 'proposed' | 'active' | 'blocked' | 'review_pending'
  | 'complete' | 'superseded' | 'discarded';

/** Action type categorization */
export type ActionType =
  | 'filing' | 'discovery' | 'deposition' | 'correspondence'
  | 'research' | 'meeting' | 'review' | 'drafting' | 'other';

/** Signal type for extracted action spans */
export type SignalType =
  | 'task' | 'commitment' | 'deadline'
  | 'delegation' | 'follow_up' | 'conditional';

/** Due date kind */
export type DueDateKind = 'exact' | 'window' | 'relative' | 'none';

/** How the assignee was resolved */
export type AssigneeResolutionKind = 'extracted' | 'resolved' | 'rule' | 'fallback';

/** Authority level of the source */
export type SourceAuthority = 'direct' | 'inferred' | 'derived';

/** Merge/dedup outcome */
export type MergeOutcome = 'created' | 'merged' | 'enriched' | 'follow_up' | 'review' | 'discarded';

/** Adjudication label from dedup adjudicator */
export type AdjudicationLabel =
  | 'same_task_merge' | 'same_task_enrich' | 'related_followup'
  | 'distinct' | 'needs_review';

/** Review reason */
export type ReviewReason =
  | 'low_confidence' | 'ambiguous_dedup' | 'privilege_flag'
  | 'conflict' | 'manual' | 'weak_identity' | 'authority_conflict';

/** Review status */
export type ReviewStatus = 'open' | 'resolved' | 'dismissed';

/** Sync status */
export type SyncStatus = 'pending' | 'synced' | 'conflict' | 'failed';

/** Evidence relationship */
export type RelationType = 'supporting' | 'contradictory' | 'superseding' | 'context';

/** Change impact */
export type ChangeImpact = 'none' | 'minor' | 'major' | 'override';

/** Audit action */
export type AuditAction =
  | 'created' | 'updated' | 'merged' | 'status_changed'
  | 'reviewed' | 'synced' | 'failed' | 'replayed';

/** Audit actor type */
export type AuditActorType = 'system' | 'user' | 'pipeline';
