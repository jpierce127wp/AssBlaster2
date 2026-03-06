// Domain types mirrored from backend (branded IDs → plain strings)

// --- Enums ---

export type SourceType = 'phone' | 'email' | 'meeting';

export type ProcessingState =
  | 'received'
  | 'extracted'
  | 'normalized'
  | 'resolved'
  | 'decided'
  | 'failed';

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';

export type CanonicalTaskStatus =
  | 'proposed'
  | 'active'
  | 'blocked'
  | 'review_pending'
  | 'complete'
  | 'superseded'
  | 'discarded';

export type ActionType =
  | 'filing'
  | 'discovery'
  | 'deposition'
  | 'correspondence'
  | 'research'
  | 'meeting'
  | 'review'
  | 'drafting'
  | 'other';

export type SignalType =
  | 'task'
  | 'commitment'
  | 'deadline'
  | 'delegation'
  | 'follow_up'
  | 'conditional';

export type DueDateKind = 'exact' | 'window' | 'relative' | 'none';

export type SourceAuthority = 'direct' | 'inferred' | 'derived';

export type MergeOutcome =
  | 'created'
  | 'merged'
  | 'enriched'
  | 'follow_up'
  | 'review'
  | 'discarded';

export type AdjudicationLabel =
  | 'same_task_merge'
  | 'same_task_enrich'
  | 'related_followup'
  | 'distinct'
  | 'needs_review';

export type ReviewReason =
  | 'low_confidence'
  | 'ambiguous_dedup'
  | 'privilege_flag'
  | 'conflict'
  | 'manual'
  | 'weak_identity'
  | 'authority_conflict';

export type ReviewStatus = 'open' | 'resolved' | 'dismissed';

export type SyncStatus = 'pending' | 'synced' | 'conflict' | 'failed';

export type RelationType = 'supporting' | 'contradictory' | 'superseding' | 'context';

export type ChangeImpact = 'none' | 'minor' | 'major' | 'override';

export type AuditAction =
  | 'created'
  | 'updated'
  | 'merged'
  | 'status_changed'
  | 'reviewed'
  | 'synced'
  | 'failed'
  | 'replayed';

export type AuditActorType = 'system' | 'user' | 'pipeline';

export type AssignmentMethod =
  | 'explicit'
  | 'role'
  | 'existing_owner'
  | 'matter_owner'
  | 'rule'
  | 'triage';

// --- Pagination ---

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// --- Entities ---

export interface EvidenceEvent {
  id: string;
  idempotency_key: string;
  source_type: SourceType;
  raw_text: string;
  cleaned_text: string | null;
  source_metadata: Record<string, unknown>;
  participants: Array<{ name: string; role?: string }>;
  privilege_flags: Record<string, boolean>;
  matter_hints: string[];
  contact_hints: string[];
  processing_state: ProcessingState;
  schema_version: number;
  source_external_id: string | null;
  source_thread_id: string | null;
  language: string;
  received_at: string;
  source_timestamp: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActionSpanRow {
  id: string;
  evidence_event_id: string;
  text: string;
  start_offset: number;
  end_offset: number;
  signal_type: SignalType;
  extracted_action: string | null;
  extracted_object: string | null;
  extracted_assignee_name: string | null;
  extracted_due_text: string | null;
  confidence: number;
  created_at: string;
}

export interface CandidateTaskRow {
  id: string;
  evidence_event_id: string;
  action_span_id: string | null;
  canonical_summary: string;
  matter_id: string | null;
  contact_id: string | null;
  client_id: string | null;
  action_type: ActionType;
  target_object: string | null;
  desired_outcome: string | null;
  assignee_name: string | null;
  assignee_user_id: string | null;
  assignee_resolution_kind: string | null;
  due_date_kind: DueDateKind | null;
  due_date_window_start: string | null;
  due_date_window_end: string | null;
  due_date_source_text: string | null;
  priority: TaskPriority;
  dependency_text: string | null;
  source_authority: SourceAuthority;
  confidence_extraction: number;
  confidence_normalization: number;
  confidence_resolution: number;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export interface TaskFingerprint {
  canonicalSummary: string;
  matterId: string | null;
  actionType: string;
  dueDateWindowStart: string | null;
}

export interface CanonicalTask {
  id: string;
  canonical_summary: string;
  status: CanonicalTaskStatus;
  fingerprint: TaskFingerprint | null;
  action_type: ActionType;
  target_object: string | null;
  desired_outcome: string | null;
  assignee_user_id: string | null;
  assignee_role: string | null;
  priority: TaskPriority;
  due_date_kind: DueDateKind | null;
  due_date_window_start: string | null;
  due_date_window_end: string | null;
  matter_id: string | null;
  open_evidence_count: number;
  last_evidence_at: string | null;
  human_edited_at: string | null;
  human_edited_by: string | null;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export interface TaskEvidenceLink {
  id: string;
  canonical_task_id: string;
  evidence_event_id: string;
  action_span_id: string | null;
  relation_type: RelationType;
  change_impact: ChangeImpact;
  impacted_fields: string[];
  rationale: string | null;
  created_at: string;
}

export interface UpdateTaskInput {
  canonical_summary?: string;
  status?: CanonicalTaskStatus;
  priority?: TaskPriority;
  due_date_kind?: DueDateKind | null;
  due_date_window_start?: string | null;
  due_date_window_end?: string | null;
  assignee_user_id?: string | null;
  assignee_role?: string | null;
}

export interface MergeDecision {
  id: string;
  candidate_task_id: string;
  compared_canonical_id: string | null;
  selected_canonical_id: string | null;
  outcome: MergeOutcome;
  fingerprint_score: number | null;
  embedding_score: number | null;
  adjudication_label: AdjudicationLabel | null;
  rationale: string | null;
  created_by: string;
  created_at: string;
}

export interface ReviewItem {
  id: string;
  candidate_task_id: string;
  reason: ReviewReason;
  priority: number;
  status: ReviewStatus;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewDecision {
  status: 'resolved' | 'dismissed';
  decided_by: string;
}

export interface ReviewContext {
  reviewItem: ReviewItem;
  candidateTask: CandidateTaskRow | null;
  evidenceEvent: {
    raw_text: string;
    cleaned_text: string | null;
    source_type: SourceType;
    participants: Array<{ name: string; role?: string }>;
    matter_hints: string[];
    privilege_flags: Record<string, boolean>;
  } | null;
  actionSpan: ActionSpanRow | null;
  mergeDecisions: MergeDecision[];
  relatedCanonicalTasks: CanonicalTask[];
  reason_explanation: string;
}

export interface ClioTaskLink {
  id: string;
  clio_task_id: string;
  canonical_task_id: string;
  remote_version_token: string | null;
  last_synced_at: string | null;
  sync_status: SyncStatus;
  created_at: string;
  updated_at: string;
}

export interface SyncResult {
  canonical_task_id: string;
  clio_task_id: string | null;
  action: 'created' | 'updated' | 'conflict' | 'skipped' | 'failed';
  details?: string;
}

export interface AuditEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  actor_type: AuditActorType;
  actor_id: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RoutingRule {
  id: string;
  practice_area: string;
  action_type: ActionType | null;
  assignee_user_id: string | null;
  assignee_role: string | null;
  priority: TaskPriority | null;
  created_at: string;
  updated_at: string;
}

export interface Matter {
  id: string;
  matter_ref: string;
  display_name: string;
  client_name: string | null;
  practice_area: string | null;
  clio_matter_id: number | null;
  aliases: string[];
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  user_ref: string;
  display_name: string;
  email: string | null;
  role: string | null;
  department: string | null;
  clio_user_id: number | null;
  aliases: string[];
  created_at: string;
  updated_at: string;
}

export interface FailedJob {
  id: string;
  stage: string;
  data: Record<string, unknown>;
  failedReason: string;
  attemptsMade: number;
  timestamp: string;
}

export interface PipelineStageMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

export interface PipelineMetrics {
  [stage: string]: PipelineStageMetrics;
}

export interface HealthStatus {
  status: string;
  uptime: number;
  timestamp: string;
}

export interface ReadyStatus {
  status: string;
  checks: {
    postgres: string;
    redis: string;
    embedding: string;
  };
  timestamp: string;
}

export interface Metrics {
  timestamp: string;
  db: {
    pool_total: number;
    pool_idle: number;
    pool_waiting: number;
  };
  redis: {
    connected: boolean;
  };
  pipeline: {
    evidence_total: number;
    evidence_by_state: Record<string, number>;
    tasks_total: number;
    reviews_open: number;
    sync_conflicts: number;
  };
}

// --- Ingest ---

export interface IngestRequest {
  idempotency_key: string;
  source_type: SourceType;
  raw_text: string;
  participants?: Array<{ name: string; role?: string }>;
  matter_hints?: string[];
  contact_hints?: string[];
  privilege_flags?: Record<string, boolean>;
  source_metadata?: Record<string, unknown>;
  source_timestamp?: string;
  language?: string;
}

export interface IngestResponse {
  id: string;
  status: 'accepted' | 'duplicate';
  message: string;
}

// --- API Error ---

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
}
