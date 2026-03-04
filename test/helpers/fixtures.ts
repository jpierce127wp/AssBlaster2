/**
 * Factory functions for domain entities.
 * Each returns a fully populated object with sensible legal-domain defaults
 * and accepts Partial<T> overrides.
 */

import type { EvidenceEvent } from '../../src/domain/evidence.types.js';
import type { CandidateTaskRow } from '../../src/domain/normalization.types.js';
import type { CanonicalTask } from '../../src/domain/registry.types.js';
import type { DedupCandidate } from '../../src/domain/dedup.types.js';
import type { ReviewItem } from '../../src/domain/review.types.js';
import type { ClioTaskLink } from '../../src/domain/sync.types.js';
import type {
  EvidenceEventId,
  CandidateTaskId,
  CanonicalTaskId,
  ReviewItemId,
  ActionSpanId,
  ClioTaskLinkId,
} from '../../src/domain/types.js';

let counter = 0;
function nextId(prefix: string): string {
  return `${prefix}-${String(++counter).padStart(4, '0')}`;
}

export function resetCounter(): void {
  counter = 0;
}

export function makeEvidenceEvent(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    id: nextId('ev') as EvidenceEventId,
    idempotency_key: `idem-${nextId('key')}`,
    source_type: 'phone',
    raw_text: 'Attorney Jones discussed filing the motion to compel in the Johnson matter by next Friday.',
    cleaned_text: 'Attorney Jones discussed filing the motion to compel in the Johnson matter by next Friday.',
    source_metadata: {},
    participants: [{ name: 'Attorney Jones', role: 'attorney' }],
    privilege_flags: {},
    matter_hints: ['Johnson'],
    contact_hints: ['Attorney Jones'],
    processing_state: 'received',
    schema_version: 1,
    source_external_id: null,
    source_thread_id: null,
    language: 'en',
    received_at: new Date('2026-03-01T10:00:00Z'),
    source_timestamp: new Date('2026-03-01T09:00:00Z'),
    created_at: new Date('2026-03-01T10:00:00Z'),
    updated_at: new Date('2026-03-01T10:00:00Z'),
    ...overrides,
  };
}

export function makeCandidateTaskRow(overrides: Partial<CandidateTaskRow> = {}): CandidateTaskRow {
  return {
    id: nextId('ct') as CandidateTaskId,
    evidence_event_id: nextId('ev') as EvidenceEventId,
    action_span_id: nextId('as') as ActionSpanId,
    canonical_summary: 'File motion to compel in Johnson matter',
    matter_id: 'matter-johnson-001',
    contact_id: null,
    client_id: null,
    action_type: 'filing',
    target_object: 'motion to compel',
    desired_outcome: 'Court grants motion to compel discovery responses',
    assignee_name: 'Attorney Jones',
    assignee_user_id: 'user-jones-001',
    assignee_resolution_kind: 'resolved',
    due_date_kind: 'exact',
    due_date_window_start: '2026-03-15',
    due_date_window_end: null,
    due_date_source_text: 'next Friday',
    priority: 'high',
    dependency_text: null,
    source_authority: 'direct',
    confidence_extraction: 0.92,
    confidence_normalization: 0.88,
    confidence_resolution: 0.85,
    schema_version: 1,
    created_at: new Date('2026-03-01T10:01:00Z'),
    updated_at: new Date('2026-03-01T10:01:00Z'),
    ...overrides,
  };
}

export function makeCanonicalTask(overrides: Partial<CanonicalTask> = {}): CanonicalTask {
  return {
    id: nextId('can') as CanonicalTaskId,
    canonical_summary: 'File motion to compel in Johnson matter',
    status: 'active',
    fingerprint: {
      canonicalSummary: 'file motion to compel in johnson matter',
      matterId: 'matter-johnson-001',
      actionType: 'filing',
      dueDateWindowStart: '2026-03-15',
    },
    action_type: 'filing',
    target_object: 'motion to compel',
    desired_outcome: 'Court grants motion to compel discovery responses',
    assignee_user_id: 'user-jones-001',
    assignee_role: 'Attorney Jones',
    priority: 'high',
    due_date_kind: 'exact',
    due_date_window_start: '2026-03-15',
    due_date_window_end: null,
    matter_id: 'matter-johnson-001',
    open_evidence_count: 1,
    last_evidence_at: new Date('2026-03-01T10:00:00Z'),
    human_edited_at: null,
    human_edited_by: null,
    schema_version: 1,
    summary_embedding: null,
    created_at: new Date('2026-03-01T10:00:00Z'),
    updated_at: new Date('2026-03-01T10:00:00Z'),
    ...overrides,
  };
}

export function makeDedupCandidate(overrides: Partial<DedupCandidate> = {}): DedupCandidate {
  return {
    taskId: nextId('can') as CanonicalTaskId,
    canonicalSummary: 'File motion to compel in Johnson matter',
    similarity: 0.92,
    method: 'semantic',
    status: 'active',
    ...overrides,
  };
}

export function makeReviewItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: nextId('rev') as ReviewItemId,
    candidate_task_id: nextId('ct') as CandidateTaskId,
    reason: 'ambiguous_dedup',
    priority: 1,
    status: 'open',
    decided_by: null,
    decided_at: null,
    created_at: new Date('2026-03-01T10:00:00Z'),
    updated_at: new Date('2026-03-01T10:00:00Z'),
    ...overrides,
  };
}

export function makeClioTaskLink(overrides: Partial<ClioTaskLink> = {}): ClioTaskLink {
  return {
    id: nextId('link') as ClioTaskLinkId,
    clio_task_id: `clio-${nextId('task')}`,
    canonical_task_id: nextId('can') as CanonicalTaskId,
    remote_version_token: 'etag-abc123',
    last_synced_at: new Date('2026-03-01T10:00:00Z'),
    sync_status: 'synced',
    created_at: new Date('2026-03-01T10:00:00Z'),
    updated_at: new Date('2026-03-01T10:00:00Z'),
    ...overrides,
  };
}
