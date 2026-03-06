/**
 * Integration tests for Stage 5: Deduplication.
 * Tests DedupService.checkAndProcess() against real Postgres + Redis.
 * Stubs: Anthropic (adjudicator), Embedding provider.
 */
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// ── Module-level mocks ─────────────────────────────────────────────
vi.mock('../../src/lib/infra/queue.js', () => ({
  getQueue: () => ({ add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }) }),
  QUEUE_NAMES: {
    EVIDENCE_INGEST: 'evidence.ingest',
    EXTRACTION_EXTRACT: 'extraction.extract',
    NORMALIZATION_NORMALIZE: 'normalization.normalize',
    IDENTITY_RESOLVE: 'identity.resolve',
    DEDUP_CHECK: 'dedup.check',
    ASSIGNMENT_ASSIGN: 'assignment.assign',
    SYNC_PUSH: 'sync.push',
  },
}));

vi.mock('../../src/observability/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    trace: vi.fn(), fatal: vi.fn(), child: vi.fn().mockReturnThis(),
  }),
}));

// ── Imports ─────────────────────────────────────────────────────────
import { ExtractionService } from '../../src/extraction/extraction.service.js';
import { NormalizationService } from '../../src/normalization/normalization.service.js';
import { IdentityService } from '../../src/resolution/identity.service.js';
import { DedupService } from '../../src/dedupe/dedup.service.js';
import { getEmbeddingProvider } from '../../src/lib/infra/embedding.js';
import { getPool } from '../../src/lib/infra/db.js';
import {
  initInfra, truncateAll, clearRedisKeys, teardownInfra,
  insertEvidence, insertMatter, findRow, countRows,
} from './setup/helpers.js';
import {
  stubAnthropic, stubEmbedding, pseudoEmbed,
  makeExtractionResponse, makeNormalizationResponse, makeAdjudicationResponse,
} from './setup/stubs.js';
import type { EvidenceEventId, CandidateTaskId, CanonicalTaskId } from '../../src/domain/types.js';

// ── Test suite ──────────────────────────────────────────────────────
describe('Stage 5: Deduplication', () => {
  let extractionService: ExtractionService;
  let normalizationService: NormalizationService;
  let identityService: IdentityService;
  let dedupService: DedupService;

  beforeAll(async () => {
    await initInfra();
    extractionService = new ExtractionService();
    normalizationService = new NormalizationService();
    identityService = new IdentityService();
    dedupService = new DedupService();

    // Stub embedding provider (used by SemanticDedup)
    stubEmbedding(getEmbeddingProvider());
  });

  afterAll(async () => {
    await teardownInfra();
  });

  beforeEach(async () => {
    await truncateAll();
    await clearRedisKeys();
    vi.clearAllMocks();

    // Re-stub embedding after clearAllMocks
    stubEmbedding(getEmbeddingProvider());

    // Default stubs for earlier stages
    stubAnthropic(extractionService, () =>
      makeExtractionResponse([
        {
          text: 'file the motion to compel',
          action: 'File motion to compel',
          object: 'motion to compel',
          assignee: 'Attorney Jones',
          due: 'next Friday',
          confidence: 0.92,
        },
      ]),
    );

    stubAnthropic(normalizationService, () =>
      makeNormalizationResponse([
        {
          summary: 'File motion to compel in Johnson matter',
          actionType: 'filing',
          targetObject: 'motion to compel',
          desiredOutcome: 'Court grants motion',
          assigneeName: 'Attorney Jones',
          dueStart: '2026-03-13',
          matterRef: 'Johnson v. Smith',
          priority: 'high',
        },
      ]),
    );

    // Default adjudicator stub (distinct — falls through to create new)
    stubAnthropic((dedupService as any).adjudicator, () =>
      makeAdjudicationResponse('distinct', null, 0.9, 'Tasks are distinct'),
    );
  });

  /** Helper: run stages 1-4, return { evidenceId, candidateTaskId } */
  async function runThroughResolution(
    overrides?: Record<string, unknown>,
  ): Promise<{ evidenceId: string; candidateTaskId: string }> {
    const evidenceId = await insertEvidence(overrides);
    const extraction = await extractionService.extract(evidenceId as EvidenceEventId);
    const normalization = await normalizationService.normalize(
      evidenceId as EvidenceEventId,
      extraction.actionSpanIds,
    );
    await identityService.resolve(
      evidenceId as EvidenceEventId,
      normalization.candidateTaskIds,
    );
    return { evidenceId, candidateTaskId: normalization.candidateTaskIds[0]! };
  }

  it('creates a new canonical task when no existing match', async () => {
    const { evidenceId, candidateTaskId } = await runThroughResolution();

    const { decision, canonicalTaskId } = await dedupService.checkAndProcess(
      evidenceId as EvidenceEventId,
      candidateTaskId as CandidateTaskId,
    );

    expect(decision.action).toBe('create_new');
    expect(canonicalTaskId).toBeTruthy();

    // Verify canonical_tasks row
    const ct = await findRow('canonical_tasks', canonicalTaskId!);
    expect(ct).not.toBeNull();
    expect(ct!.canonical_summary).toBe('File motion to compel in Johnson matter');
    expect(ct!.action_type).toBe('filing');

    // Verify merge_decisions row
    const mdCount = await countRows(
      'merge_decisions',
      "candidate_task_id = $1 AND outcome = 'created'",
      [candidateTaskId],
    );
    expect(mdCount).toBe(1);
  });

  it('deterministic merge when same fingerprint exists', async () => {
    // First pass: create a canonical task
    const first = await runThroughResolution();
    const { canonicalTaskId: firstTaskId } = await dedupService.checkAndProcess(
      first.evidenceId as EvidenceEventId,
      first.candidateTaskId as CandidateTaskId,
    );

    // Second pass: same summary/matter/action/due → same fingerprint
    const second = await runThroughResolution();
    const { decision, canonicalTaskId: secondTaskId } = await dedupService.checkAndProcess(
      second.evidenceId as EvidenceEventId,
      second.candidateTaskId as CandidateTaskId,
    );

    expect(decision.action).toBe('merge');
    // Should merge into the existing task, not create a new one
    expect(secondTaskId).toBe(firstTaskId);

    // Only 1 canonical task should exist
    const count = await countRows('canonical_tasks');
    expect(count).toBe(1);

    // merge_decisions should have 'merged' outcome
    const mdCount = await countRows(
      'merge_decisions',
      "candidate_task_id = $1 AND outcome = 'merged'",
      [second.candidateTaskId],
    );
    expect(mdCount).toBe(1);
  });

  it('semantic merge when embedding similarity above AUTO_MERGE threshold', async () => {
    // First pass: create a canonical task with embedding
    const first = await runThroughResolution();
    await dedupService.checkAndProcess(
      first.evidenceId as EvidenceEventId,
      first.candidateTaskId as CandidateTaskId,
    );

    // Second pass: slightly different summary but same semantic meaning
    // Use a different fingerprint (different due date) so deterministic doesn't match
    stubAnthropic(normalizationService, () =>
      makeNormalizationResponse([
        {
          summary: 'File motion to compel in Johnson matter', // Same summary = same embedding
          actionType: 'filing',
          targetObject: 'motion to compel',
          dueStart: '2026-03-20', // Different due date → different fingerprint
          matterRef: 'Johnson v. Smith',
          priority: 'high',
        },
      ]),
    );

    const second = await runThroughResolution();
    const { decision } = await dedupService.checkAndProcess(
      second.evidenceId as EvidenceEventId,
      second.candidateTaskId as CandidateTaskId,
    );

    // With identical text → identical pseudo-embedding → similarity = 1.0 → auto-merge
    expect(decision.action).toBe('merge');
    if (decision.action === 'merge') {
      expect(decision.method).toBe('semantic');
    }
  });

  it('discards candidate with combined confidence below DISCARD_MIN', async () => {
    // Normalization with very low confidence
    stubAnthropic(normalizationService, () =>
      makeNormalizationResponse([
        {
          summary: 'Low confidence task',
          actionType: 'other',
          confidenceExtraction: 0.1,
          confidenceNormalization: 0.1,
        },
      ]),
    );

    const { evidenceId, candidateTaskId } = await runThroughResolution();

    const { decision, canonicalTaskId } = await dedupService.checkAndProcess(
      evidenceId as EvidenceEventId,
      candidateTaskId as CandidateTaskId,
    );

    expect(decision.action).toBe('discard');
    expect(canonicalTaskId).toBeNull();

    const mdCount = await countRows(
      'merge_decisions',
      "candidate_task_id = $1 AND outcome = 'discarded'",
      [candidateTaskId],
    );
    expect(mdCount).toBe(1);
  });

  it('creates follow-up when existing canonical task is in terminal status', async () => {
    // First pass: create and complete a canonical task
    const first = await runThroughResolution();
    const { canonicalTaskId: firstId } = await dedupService.checkAndProcess(
      first.evidenceId as EvidenceEventId,
      first.candidateTaskId as CandidateTaskId,
    );

    // Mark the task as complete (terminal)
    const pool = getPool();
    await pool.query(
      "UPDATE canonical_tasks SET status = 'complete' WHERE id = $1",
      [firstId],
    );

    // Second pass: same fingerprint but target is now terminal → follow-up
    const second = await runThroughResolution();
    const { decision, canonicalTaskId: secondId } = await dedupService.checkAndProcess(
      second.evidenceId as EvidenceEventId,
      second.candidateTaskId as CandidateTaskId,
    );

    expect(decision.action).toBe('follow_up');
    expect(secondId).not.toBe(firstId); // New task created
    expect(secondId).toBeTruthy();

    // Now 2 canonical tasks
    const count = await countRows('canonical_tasks');
    expect(count).toBe(2);

    const mdCount = await countRows(
      'merge_decisions',
      "candidate_task_id = $1 AND outcome = 'follow_up'",
      [second.candidateTaskId],
    );
    expect(mdCount).toBe(1);
  });

  it('advances evidence state to "decided"', async () => {
    const { evidenceId, candidateTaskId } = await runThroughResolution();

    await dedupService.checkAndProcess(
      evidenceId as EvidenceEventId,
      candidateTaskId as CandidateTaskId,
    );

    const row = await findRow('evidence_events', evidenceId);
    expect(row!.processing_state).toBe('decided');
  });

  it('creates task_evidence_links connecting canonical task to evidence', async () => {
    const { evidenceId, candidateTaskId } = await runThroughResolution();

    const { canonicalTaskId } = await dedupService.checkAndProcess(
      evidenceId as EvidenceEventId,
      candidateTaskId as CandidateTaskId,
    );

    const linkCount = await countRows(
      'task_evidence_links',
      'canonical_task_id = $1 AND evidence_event_id = $2',
      [canonicalTaskId, evidenceId],
    );
    expect(linkCount).toBe(1);
  });

  it('stores fingerprint in canonical_tasks', async () => {
    const { evidenceId, candidateTaskId } = await runThroughResolution();

    const { canonicalTaskId } = await dedupService.checkAndProcess(
      evidenceId as EvidenceEventId,
      candidateTaskId as CandidateTaskId,
    );

    const ct = await findRow('canonical_tasks', canonicalTaskId!);
    expect(ct!.fingerprint).toBeTruthy();
    const fp = ct!.fingerprint as Record<string, unknown>;
    expect(fp.canonicalSummary).toBeTruthy();
    expect(fp.actionType).toBe('filing');
  });

  it('stores summary_embedding in canonical_tasks', async () => {
    const { evidenceId, candidateTaskId } = await runThroughResolution();

    const { canonicalTaskId } = await dedupService.checkAndProcess(
      evidenceId as EvidenceEventId,
      candidateTaskId as CandidateTaskId,
    );

    const ct = await findRow('canonical_tasks', canonicalTaskId!);
    // pgvector returns embedding as a string like "[0.1,0.2,...]"
    expect(ct!.summary_embedding).toBeTruthy();
  });
});
