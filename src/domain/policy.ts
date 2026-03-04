/**
 * Policy defaults for the TaskMaster2 legal workflow pipeline.
 *
 * Each constant is tagged with its policy default number (D1–D12).
 * Thresholds marked D12 are tunable after pilot analysis.
 */

import type { SourceAuthority } from './types.js';

// ── D1: Canonical registry is source of truth ────────────────────────
// Architectural invariant — the canonical task registry is the
// system of record for task identity, not Clio.
export const SOURCE_OF_TRUTH = 'canonical_registry' as const;

// ── D2: No direct source-to-Clio creation ───────────────────────────
// Adapters (phone, email, meeting) must route through the full
// pipeline. Only the sync stage writes to Clio.
export const DIRECT_SOURCE_TO_CLIO = false as const;

// ── D3: No auto-reopen of completed tasks ───────────────────────────
// If a similar completed task exists, prefer follow-up or review.
export const TERMINAL_STATUSES: Set<string> = new Set([
  'complete',
  'superseded',
  'discarded',
]);

// ── D4: Strong matter confidence required ────────────────────────────
// Weak matter resolution → route to review, not guess.   (D12: tunable)
export const MATTER_CONFIDENCE_MIN = 0.75;

// ── D5: Explicit beats inferred ─────────────────────────────────────
// Lower rank = higher trust.  Used by conflict resolution functions.
export const AUTHORITY_RANK: Record<SourceAuthority | 'unknown', number> = {
  direct: 1,
  inferred: 3,
  derived: 5,
  unknown: 6,
} as const;

// ── D6: Human edits get protection ──────────────────────────────────
// If a user changes these fields directly in Clio, do not overwrite
// without stronger evidence or human review.
export const HUMAN_PROTECTED_FIELDS: Set<string> = new Set([
  'canonical_summary',
  'due_date_window_start',
  'assignee_user_id',
  'status',
]);

// ── D7: Same task requires same deliverable ─────────────────────────
// Merge only when both sources refer to the same deliverable or
// operational outcome within the same matter context — not merely
// the same topic.
export const MERGE_REQUIRES_SAME_DELIVERABLE = true as const;

// ── D8: Uncertainty should be visible ───────────────────────────────
// Always emit confidence scores and rationale.
// Do not hide low-confidence inference behind crisp output.
export const ALWAYS_EMIT_CONFIDENCE = true as const;
export const ALWAYS_EMIT_RATIONALE = true as const;

// ── D9: Review is acceptable ────────────────────────────────────────
// Better to route uncertain work to review than to create duplicates
// or incorrect tasks.  This bias is encoded in the thresholds: any
// score below the relevant threshold triggers review rather than
// silent auto-action.

// ── D10: Enrichment over replacement ────────────────────────────────
// When new evidence adds detail to an open task, enrich the existing
// canonical task and append evidence rather than recreating.
export const PREFER_ENRICHMENT = true as const;

// ── D11: Additive notes safer than field mutation ───────────────────
// When confidence is moderate, add detail to evidence wallet or
// description instead of mutating these sensitive fields.
export const SENSITIVE_FIELDS: Set<string> = new Set([
  'assignee_user_id',
  'due_date_window_start',
  'status',
]);
export const SENSITIVE_FIELD_MIN_CONFIDENCE = 0.80; // (D12: tunable)

// ── D12: Tune after pilot ───────────────────────────────────────────
// These thresholds should be adjusted only after analyzing pilot
// outcomes and human reviewer feedback.
export const PILOT_TUNABLE = [
  'DEDUP_THRESHOLDS.AUTO_MERGE',
  'DEDUP_THRESHOLDS.CREATE_NEW',
  'DEDUP_THRESHOLDS.ADJUDICATION_REVIEW',
  'MATTER_CONFIDENCE_MIN',
  'SENSITIVE_FIELD_MIN_CONFIDENCE',
] as const;

// ── Assignment: ambiguous assignee tokens ───────────────────────────
// Tokens that should not resolve to a person (falls through to triage).
export const AMBIGUOUS_ASSIGNEES: Set<string> = new Set([
  'we', 'someone', 'somebody', 'the team', 'us', 'anyone',
]);
