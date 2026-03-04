import type { SourceAuthority } from '../domain/types.js';

/**
 * Authority trust order for conflict resolution (highest to lowest):
 * 1. explicit attorney instruction
 * 2. explicit client instruction
 * 3. written email/document with exact date
 * 4. meeting statement with explicit date
 * 5. inferred timeline
 * 6. vague follow-up language
 *
 * We map SourceAuthority to a numeric rank:
 * - 'direct' → authority comes from explicit instruction (rank 1-3)
 * - 'inferred' → reasonably deduced (rank 4-5)
 * - 'derived' → combined from multiple signals (rank 5-6)
 */
function authorityRank(authority: SourceAuthority | null): number {
  switch (authority) {
    case 'direct': return 1;
    case 'inferred': return 3;
    case 'derived': return 5;
    default: return 6;
  }
}

export type ConflictResolution<T> =
  | { outcome: 'winner'; value: T; reason: string }
  | { outcome: 'review'; reason: string };

/**
 * Resolve a due date conflict between existing task and new candidate.
 * Uses authority first, then recency, then specificity.
 */
export function resolveDueDateConflict(
  existing: { value: string | null; authority: SourceAuthority | null; updatedAt: Date },
  candidate: { value: string | null; authority: SourceAuthority | null },
): ConflictResolution<string | null> {
  // No conflict if one is empty
  if (existing.value == null) {
    return { outcome: 'winner', value: candidate.value, reason: 'Existing date was empty' };
  }
  if (candidate.value == null) {
    return { outcome: 'winner', value: existing.value, reason: 'Candidate date was empty' };
  }
  if (existing.value === candidate.value) {
    return { outcome: 'winner', value: existing.value, reason: 'Dates match' };
  }

  // Compare by authority
  const existingRank = authorityRank(existing.authority);
  const candidateRank = authorityRank(candidate.authority);

  if (candidateRank < existingRank) {
    return { outcome: 'winner', value: candidate.value, reason: `Candidate has higher authority (${candidate.authority} vs ${existing.authority})` };
  }
  if (existingRank < candidateRank) {
    return { outcome: 'winner', value: existing.value, reason: `Existing has higher authority (${existing.authority} vs ${candidate.authority})` };
  }

  // Both same authority — if both high-authority, route to review
  if (existingRank <= 2) {
    return { outcome: 'review', reason: `Due date conflict: both high-authority (${existing.authority}), existing=${existing.value}, candidate=${candidate.value}` };
  }

  // For lower authority, prefer the candidate (more recent evidence)
  return { outcome: 'winner', value: candidate.value, reason: 'Same authority level, preferring more recent evidence' };
}

/**
 * Resolve an assignment conflict.
 * Priority: direct explicit → most recent explicit reassignment → matter owner → review
 */
export function resolveAssignmentConflict(
  existing: { userId: string | null; authority: SourceAuthority | null },
  candidate: { userId: string | null; authority: SourceAuthority | null },
): ConflictResolution<string | null> {
  if (existing.userId == null) {
    return { outcome: 'winner', value: candidate.userId, reason: 'Existing assignee was empty' };
  }
  if (candidate.userId == null) {
    return { outcome: 'winner', value: existing.userId, reason: 'Candidate assignee was empty' };
  }
  if (existing.userId === candidate.userId) {
    return { outcome: 'winner', value: existing.userId, reason: 'Assignees match' };
  }

  // Compare by authority
  const existingRank = authorityRank(existing.authority);
  const candidateRank = authorityRank(candidate.authority);

  if (candidateRank < existingRank) {
    return { outcome: 'winner', value: candidate.userId, reason: `Candidate has higher authority for assignment` };
  }
  if (existingRank < candidateRank) {
    return { outcome: 'winner', value: existing.userId, reason: `Existing has higher authority for assignment` };
  }

  // Both authoritative and contradictory → review
  if (existingRank <= 2) {
    return { outcome: 'review', reason: `Assignment conflict: both authoritative, existing=${existing.userId}, candidate=${candidate.userId}` };
  }

  // Lower authority: prefer candidate (more recent)
  return { outcome: 'winner', value: candidate.userId, reason: 'Same authority, preferring more recent assignment' };
}

/**
 * Resolve a scope conflict.
 * If one source implies broader and another narrower:
 * prefer the narrower active task, note broader context.
 */
export function resolveScopeConflict(
  existingSummary: string,
  candidateSummary: string,
): ConflictResolution<'keep_existing' | 'use_candidate'> {
  // Simple heuristic: shorter summary is likely more specific/narrower
  const existingLen = existingSummary.split(' ').length;
  const candidateLen = candidateSummary.split(' ').length;

  if (candidateLen < existingLen) {
    return { outcome: 'winner', value: 'use_candidate', reason: 'Candidate summary is more specific' };
  }
  if (existingLen < candidateLen) {
    return { outcome: 'winner', value: 'keep_existing', reason: 'Existing summary is more specific' };
  }

  // Same length — not enough info to decide
  return { outcome: 'review', reason: 'Scope conflict: cannot determine which is narrower' };
}
