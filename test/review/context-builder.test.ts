import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReviewRepo = { findById: vi.fn() };
const mockCandidateRepo = { findById: vi.fn() };
const mockEvidenceRepo = { findById: vi.fn() };
const mockActionSpanRepo = { findById: vi.fn() };
const mockMergeDecisionRepo = { findByCandidateTask: vi.fn() };
const mockRegistryRepo = { findById: vi.fn() };

vi.mock('../../src/review/review.repo.js', () => ({
  ReviewRepo: vi.fn().mockImplementation(() => mockReviewRepo),
}));
vi.mock('../../src/normalization/normalization.repo.js', () => ({
  CandidateTaskRepo: vi.fn().mockImplementation(() => mockCandidateRepo),
}));
vi.mock('../../src/ingestion/evidence.repo.js', () => ({
  EvidenceRepo: vi.fn().mockImplementation(() => mockEvidenceRepo),
}));
vi.mock('../../src/extraction/extraction.repo.js', () => ({
  ActionSpanRepo: vi.fn().mockImplementation(() => mockActionSpanRepo),
}));
vi.mock('../../src/dedupe/dedup.repo.js', () => ({
  MergeDecisionRepo: vi.fn().mockImplementation(() => mockMergeDecisionRepo),
}));
vi.mock('../../src/registry/registry.repo.js', () => ({
  RegistryRepo: vi.fn().mockImplementation(() => mockRegistryRepo),
}));

import { ContextBuilder } from '../../src/review/context-builder.js';
import { NotFoundError } from '../../src/domain/errors.js';

describe('ContextBuilder', () => {
  let builder: ContextBuilder;

  beforeEach(() => {
    vi.clearAllMocks();
    builder = new ContextBuilder();
  });

  it('throws NotFoundError when review item is missing', async () => {
    mockReviewRepo.findById.mockResolvedValue(null);

    await expect(builder.build('rev-missing')).rejects.toThrow(NotFoundError);
  });

  it('loads candidate task and evidence event', async () => {
    mockReviewRepo.findById.mockResolvedValue({
      id: 'rev-001',
      candidate_task_id: 'ct-001',
      reason: 'low_confidence',
    });
    mockCandidateRepo.findById.mockResolvedValue({
      id: 'ct-001',
      evidence_event_id: 'ev-001',
      action_span_id: null,
    });
    mockEvidenceRepo.findById.mockResolvedValue({
      raw_text: 'raw',
      cleaned_text: 'cleaned',
      source_type: 'email',
      participants: [],
      matter_hints: [],
      privilege_flags: {},
    });
    mockMergeDecisionRepo.findByCandidateTask.mockResolvedValue([]);

    const ctx = await builder.build('rev-001');

    expect(ctx.candidateTask).toBeDefined();
    expect(ctx.evidenceEvent).toBeDefined();
    expect(ctx.evidenceEvent!.raw_text).toBe('raw');
  });

  it('loads action span when present', async () => {
    mockReviewRepo.findById.mockResolvedValue({
      id: 'rev-001',
      candidate_task_id: 'ct-001',
      reason: 'low_confidence',
    });
    mockCandidateRepo.findById.mockResolvedValue({
      id: 'ct-001',
      evidence_event_id: 'ev-001',
      action_span_id: 'as-001',
    });
    mockEvidenceRepo.findById.mockResolvedValue(null);
    mockActionSpanRepo.findById.mockResolvedValue({ id: 'as-001', text: 'span' });
    mockMergeDecisionRepo.findByCandidateTask.mockResolvedValue([]);

    const ctx = await builder.build('rev-001');
    expect(ctx.actionSpan).toEqual({ id: 'as-001', text: 'span' });
  });

  it('loads merge decisions and related canonical tasks', async () => {
    mockReviewRepo.findById.mockResolvedValue({
      id: 'rev-001',
      candidate_task_id: 'ct-001',
      reason: 'ambiguous_dedup',
    });
    mockCandidateRepo.findById.mockResolvedValue({
      id: 'ct-001',
      evidence_event_id: 'ev-001',
      action_span_id: null,
    });
    mockEvidenceRepo.findById.mockResolvedValue(null);
    mockMergeDecisionRepo.findByCandidateTask.mockResolvedValue([
      { compared_canonical_id: 'can-001', selected_canonical_id: 'can-002' },
    ]);
    mockRegistryRepo.findById
      .mockResolvedValueOnce({ id: 'can-001', canonical_summary: 'Task A' })
      .mockResolvedValueOnce({ id: 'can-002', canonical_summary: 'Task B' });

    const ctx = await builder.build('rev-001');
    expect(ctx.mergeDecisions).toHaveLength(1);
    expect(ctx.relatedCanonicalTasks).toHaveLength(2);
  });

  it('maps known reason to human-readable explanation', async () => {
    mockReviewRepo.findById.mockResolvedValue({
      id: 'rev-001',
      candidate_task_id: 'ct-001',
      reason: 'privilege_flag',
    });
    mockCandidateRepo.findById.mockResolvedValue(null);
    mockMergeDecisionRepo.findByCandidateTask.mockResolvedValue([]);

    const ctx = await builder.build('rev-001');
    expect(ctx.reason_explanation).toContain('privilege');
  });

  it('provides fallback explanation for unknown reason', async () => {
    mockReviewRepo.findById.mockResolvedValue({
      id: 'rev-001',
      candidate_task_id: 'ct-001',
      reason: 'some_unknown_reason',
    });
    mockCandidateRepo.findById.mockResolvedValue(null);
    mockMergeDecisionRepo.findByCandidateTask.mockResolvedValue([]);

    const ctx = await builder.build('rev-001');
    expect(ctx.reason_explanation).toContain('some_unknown_reason');
  });

  it('handles candidate task without evidence event', async () => {
    mockReviewRepo.findById.mockResolvedValue({
      id: 'rev-001',
      candidate_task_id: 'ct-001',
      reason: 'low_confidence',
    });
    mockCandidateRepo.findById.mockResolvedValue({
      id: 'ct-001',
      evidence_event_id: 'ev-001',
      action_span_id: null,
    });
    mockEvidenceRepo.findById.mockResolvedValue(null);
    mockMergeDecisionRepo.findByCandidateTask.mockResolvedValue([]);

    const ctx = await builder.build('rev-001');
    expect(ctx.evidenceEvent).toBeNull();
  });

  it('handles null candidate task', async () => {
    mockReviewRepo.findById.mockResolvedValue({
      id: 'rev-001',
      candidate_task_id: 'ct-001',
      reason: 'manual',
    });
    mockCandidateRepo.findById.mockResolvedValue(null);
    mockMergeDecisionRepo.findByCandidateTask.mockResolvedValue([]);

    const ctx = await builder.build('rev-001');
    expect(ctx.candidateTask).toBeNull();
    expect(ctx.evidenceEvent).toBeNull();
    expect(ctx.actionSpan).toBeNull();
    expect(ctx.mergeDecisions).toEqual([]);
  });
});
