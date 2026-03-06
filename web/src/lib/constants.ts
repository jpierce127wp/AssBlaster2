import type {
  ActionType,
  AuditAction,
  CanonicalTaskStatus,
  MergeOutcome,
  ProcessingState,
  ReviewReason,
  ReviewStatus,
  SignalType,
  SourceType,
  SyncStatus,
  TaskPriority,
} from '@/api/types';

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  normal: 'bg-blue-100 text-blue-800 border-blue-200',
  low: 'bg-gray-100 text-gray-700 border-gray-200',
};

export const STATUS_COLORS: Record<CanonicalTaskStatus, string> = {
  proposed: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  active: 'bg-green-100 text-green-800 border-green-200',
  blocked: 'bg-red-100 text-red-800 border-red-200',
  review_pending: 'bg-purple-100 text-purple-800 border-purple-200',
  complete: 'bg-gray-100 text-gray-700 border-gray-200',
  superseded: 'bg-gray-100 text-gray-500 border-gray-200',
  discarded: 'bg-gray-100 text-gray-400 border-gray-200',
};

export const REVIEW_STATUS_COLORS: Record<ReviewStatus, string> = {
  open: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  resolved: 'bg-green-100 text-green-800 border-green-200',
  dismissed: 'bg-gray-100 text-gray-500 border-gray-200',
};

export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  low_confidence: 'Low Confidence',
  ambiguous_dedup: 'Ambiguous Dedup',
  privilege_flag: 'Privilege Flag',
  conflict: 'Sync Conflict',
  manual: 'Manual Review',
  weak_identity: 'Weak Identity',
  authority_conflict: 'Authority Conflict',
};

export const REVIEW_REASON_COLORS: Record<ReviewReason, string> = {
  low_confidence: 'bg-orange-100 text-orange-800 border-orange-200',
  ambiguous_dedup: 'bg-purple-100 text-purple-800 border-purple-200',
  privilege_flag: 'bg-red-100 text-red-800 border-red-200',
  conflict: 'bg-red-100 text-red-800 border-red-200',
  manual: 'bg-blue-100 text-blue-800 border-blue-200',
  weak_identity: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  authority_conflict: 'bg-orange-100 text-orange-800 border-orange-200',
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  phone: 'Phone',
  email: 'Email',
  meeting: 'Meeting',
};

export const SOURCE_TYPE_COLORS: Record<SourceType, string> = {
  phone: 'bg-green-100 text-green-800 border-green-200',
  email: 'bg-blue-100 text-blue-800 border-blue-200',
  meeting: 'bg-purple-100 text-purple-800 border-purple-200',
};

export const PROCESSING_STATE_LABELS: Record<ProcessingState, string> = {
  received: 'Received',
  extracted: 'Extracted',
  normalized: 'Normalized',
  resolved: 'Resolved',
  decided: 'Decided',
  failed: 'Failed',
};

export const PROCESSING_STATE_COLORS: Record<ProcessingState, string> = {
  received: 'bg-blue-100 text-blue-800 border-blue-200',
  extracted: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  normalized: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  resolved: 'bg-green-100 text-green-800 border-green-200',
  decided: 'bg-gray-100 text-gray-700 border-gray-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
};

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  filing: 'Filing',
  discovery: 'Discovery',
  deposition: 'Deposition',
  correspondence: 'Correspondence',
  research: 'Research',
  meeting: 'Meeting',
  review: 'Review',
  drafting: 'Drafting',
  other: 'Other',
};

export const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  task: 'Task',
  commitment: 'Commitment',
  deadline: 'Deadline',
  delegation: 'Delegation',
  follow_up: 'Follow-up',
  conditional: 'Conditional',
};

export const MERGE_OUTCOME_LABELS: Record<MergeOutcome, string> = {
  created: 'Created',
  merged: 'Merged',
  enriched: 'Enriched',
  follow_up: 'Follow-up',
  review: 'Review',
  discarded: 'Discarded',
};

export const SYNC_STATUS_COLORS: Record<SyncStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  synced: 'bg-green-100 text-green-800 border-green-200',
  conflict: 'bg-red-100 text-red-800 border-red-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  created: 'Created',
  updated: 'Updated',
  merged: 'Merged',
  status_changed: 'Status Changed',
  reviewed: 'Reviewed',
  synced: 'Synced',
  failed: 'Failed',
  replayed: 'Replayed',
};

export const PIPELINE_STAGES = [
  'ingest',
  'extract',
  'normalize',
  'resolve',
  'dedup',
  'review',
  'sync',
] as const;

export const MATTER_CONFIDENCE_MIN = 0.75;
export const SENSITIVE_FIELD_MIN_CONFIDENCE = 0.80;
