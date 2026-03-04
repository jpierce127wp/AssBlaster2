import type { CanonicalTaskId, CanonicalTaskStatus, ActionType, DueDateKind, TaskPriority } from './types.js';
import { HUMAN_PROTECTED_FIELDS } from './policy.js';

/** Task fingerprint for deterministic dedup */
export interface TaskFingerprint {
  canonicalSummary: string;
  matterId: string | null;
  actionType: string;
  dueDateWindowStart: string | null;
}

/** Canonical task as stored in DB */
export interface CanonicalTask {
  id: CanonicalTaskId;
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
  last_evidence_at: Date | null;
  human_edited_at: Date | null;
  human_edited_by: string | null;
  schema_version: number;
  summary_embedding: number[] | null;
  created_at: Date;
  updated_at: Date;
}

/** Per-field confidence */
export interface CanonicalTaskFieldConfidence {
  id: string;
  canonical_task_id: CanonicalTaskId;
  field_name: string;
  confidence: number;
  source: string;
  updated_at: Date;
}

/** Task evidence link (replaces evidence_wallet) */
export interface TaskEvidenceLink {
  id: string;
  canonical_task_id: CanonicalTaskId;
  evidence_event_id: string;
  action_span_id: string | null;
  relation_type: string;
  change_impact: string;
  impacted_fields: string[];
  rationale: string | null;
  created_at: Date;
}

/** Create task input */
export interface CreateTaskInput {
  canonicalSummary: string;
  actionType?: string;
  targetObject?: string | null;
  desiredOutcome?: string | null;
  assigneeUserId?: string | null;
  assigneeRole?: string | null;
  priority?: string;
  dueDateKind?: string | null;
  dueDateWindowStart?: string | null;
  dueDateWindowEnd?: string | null;
  matterId?: string | null;
  fingerprint?: TaskFingerprint;
  summaryEmbedding?: number[];
}

/** Update task input */
export interface UpdateTaskInput {
  canonical_summary?: string;
  status?: CanonicalTaskStatus;
  priority?: TaskPriority;
  due_date_kind?: DueDateKind | null;
  due_date_window_start?: string | null;
  due_date_window_end?: string | null;
  assignee_user_id?: string | null;
  assignee_role?: string | null;
  human_edited_at?: Date;
  human_edited_by?: string;
}

/** Fields that should not be overwritten by pipeline if a human has edited the task */
export const HUMAN_SENSITIVE_FIELDS: ReadonlySet<string> = new Set([
  ...HUMAN_PROTECTED_FIELDS,
  'assignee_role', 'due_date_window_end', 'due_date_kind', 'priority',
]);

/** Fields safe for additive pipeline updates even after human edit */
export const HUMAN_SAFE_FIELDS: ReadonlySet<string> = new Set([
  'open_evidence_count',
  'last_evidence_at',
]);
