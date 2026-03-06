/**
 * Integration tests for Stage 3: Normalization.
 * Tests NormalizationService.normalize() with stubbed Anthropic against real Postgres.
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
import {
  initInfra, truncateAll, clearRedisKeys, teardownInfra,
  insertEvidence, findRow, countRows,
} from './setup/helpers.js';
import {
  stubAnthropic, makeExtractionResponse, makeNormalizationResponse,
  makeToolUseResponse,
} from './setup/stubs.js';
import type { EvidenceEventId } from '../../src/domain/types.js';

// ── Test suite ──────────────────────────────────────────────────────
describe('Stage 3: Normalization', () => {
  let extractionService: ExtractionService;
  let normalizationService: NormalizationService;
  let extractionSpy: ReturnType<typeof stubAnthropic>;
  let normalizationSpy: ReturnType<typeof stubAnthropic>;

  beforeAll(async () => {
    await initInfra();
    extractionService = new ExtractionService();
    normalizationService = new NormalizationService();
  });

  afterAll(async () => {
    await teardownInfra();
  });

  beforeEach(async () => {
    await truncateAll();
    await clearRedisKeys();
    vi.clearAllMocks();

    // Default stubs
    extractionSpy = stubAnthropic(extractionService, () =>
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

    normalizationSpy = stubAnthropic(normalizationService, () =>
      makeNormalizationResponse([
        {
          summary: 'File motion to compel in Johnson matter',
          actionType: 'filing',
          targetObject: 'motion to compel',
          desiredOutcome: 'Court grants motion to compel discovery responses',
          assigneeName: 'Attorney Jones',
          dueStart: '2026-03-13',
          matterRef: 'Johnson v. Smith',
          priority: 'high',
          confidenceExtraction: 0.92,
          confidenceNormalization: 0.88,
        },
      ]),
    );
  });

  /** Helper: ingest + extract, return { evidenceId, actionSpanIds } */
  async function ingestAndExtract(): Promise<{ evidenceId: string; actionSpanIds: string[] }> {
    const evidenceId = await insertEvidence();
    const extraction = await extractionService.extract(evidenceId as EvidenceEventId);
    return { evidenceId, actionSpanIds: extraction.actionSpanIds };
  }

  it('normalizes an action span into a candidate task in DB', async () => {
    const { evidenceId, actionSpanIds } = await ingestAndExtract();

    const result = await normalizationService.normalize(
      evidenceId as EvidenceEventId,
      actionSpanIds,
    );

    expect(result.candidateTaskIds).toHaveLength(1);

    const ct = await findRow('candidate_tasks', result.candidateTaskIds[0]!);
    expect(ct).not.toBeNull();
    expect(ct!.canonical_summary).toBe('File motion to compel in Johnson matter');
    expect(ct!.action_type).toBe('filing');
    expect(ct!.priority).toBe('high');
  });

  it('persists due_date_window_start correctly', async () => {
    const { evidenceId, actionSpanIds } = await ingestAndExtract();

    const result = await normalizationService.normalize(
      evidenceId as EvidenceEventId,
      actionSpanIds,
    );

    const ct = await findRow('candidate_tasks', result.candidateTaskIds[0]!);
    // Postgres DATE comes back as a Date object or ISO string
    const dueStart = ct!.due_date_window_start;
    expect(dueStart).toBeTruthy();
    expect(String(dueStart)).toContain('2026-03-13');
  });

  it('advances evidence state to "normalized"', async () => {
    const { evidenceId, actionSpanIds } = await ingestAndExtract();

    await normalizationService.normalize(evidenceId as EvidenceEventId, actionSpanIds);

    const row = await findRow('evidence_events', evidenceId);
    expect(row!.processing_state).toBe('normalized');
  });

  it('skips invalid tool_use blocks with warning', async () => {
    normalizationSpy.mockImplementation(async () =>
      makeToolUseResponse([
        {
          name: 'normalize_task',
          input: {
            // Valid
            canonical_summary: 'Valid task summary',
            action_type: 'filing',
            target_object: null,
            desired_outcome: null,
            assignee_name: null,
            due_date_kind: 'none',
            due_date_window_start: null,
            due_date_window_end: null,
            due_date_source_text: null,
            priority: 'normal',
            matter_reference: null,
            dependency_text: null,
            source_authority: 'derived',
            confidence_extraction: 0.9,
            confidence_normalization: 0.85,
          },
        },
        {
          name: 'normalize_task',
          input: {
            // Invalid: missing canonical_summary
            action_type: 'filing',
            priority: 'invalid_value', // Invalid enum
          },
        },
      ]),
    );

    const { evidenceId, actionSpanIds } = await ingestAndExtract();
    const result = await normalizationService.normalize(
      evidenceId as EvidenceEventId,
      actionSpanIds,
    );

    // Only the valid task should be persisted
    expect(result.candidateTaskIds).toHaveLength(1);
  });

  it('normalizes multiple action spans into multiple candidate tasks', async () => {
    // Extract 2 spans
    extractionSpy.mockImplementation(async () =>
      makeExtractionResponse([
        {
          text: 'file the motion',
          action: 'File motion',
          object: 'motion',
          confidence: 0.9,
        },
        {
          text: 'prepare the brief',
          action: 'Prepare brief',
          object: 'brief',
          confidence: 0.88,
        },
      ]),
    );

    // Normalize into 2 tasks
    normalizationSpy.mockImplementation(async () =>
      makeNormalizationResponse([
        { summary: 'File motion in Johnson case', actionType: 'filing' },
        { summary: 'Prepare legal brief', actionType: 'drafting' },
      ]),
    );

    const { evidenceId, actionSpanIds } = await ingestAndExtract();
    const result = await normalizationService.normalize(
      evidenceId as EvidenceEventId,
      actionSpanIds,
    );

    expect(result.candidateTaskIds).toHaveLength(2);

    const count = await countRows('candidate_tasks', 'evidence_event_id = $1', [evidenceId]);
    expect(count).toBe(2);
  });

  it('records audit log with processing time', async () => {
    const { evidenceId, actionSpanIds } = await ingestAndExtract();

    await normalizationService.normalize(evidenceId as EvidenceEventId, actionSpanIds);

    const count = await countRows(
      'audit_log',
      "entity_type = 'evidence_event' AND entity_id = $1",
      [evidenceId],
    );
    // Should have entries from extraction + normalization
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('sets confidence_resolution to 0 for new candidate tasks', async () => {
    const { evidenceId, actionSpanIds } = await ingestAndExtract();

    const result = await normalizationService.normalize(
      evidenceId as EvidenceEventId,
      actionSpanIds,
    );

    const ct = await findRow('candidate_tasks', result.candidateTaskIds[0]!);
    expect(ct!.confidence_resolution).toBe(0);
  });

  it('records processingTimeMs in result', async () => {
    const { evidenceId, actionSpanIds } = await ingestAndExtract();

    const result = await normalizationService.normalize(
      evidenceId as EvidenceEventId,
      actionSpanIds,
    );

    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });
});
