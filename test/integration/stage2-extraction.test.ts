/**
 * Integration tests for Stage 2: Action Span Extraction.
 * Tests ExtractionService.extract() with stubbed Anthropic against real Postgres.
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
import { PipelineError } from '../../src/domain/errors.js';
import {
  initInfra, truncateAll, clearRedisKeys, teardownInfra,
  insertEvidence, findRow, countRows,
} from './setup/helpers.js';
import { stubAnthropic, makeExtractionResponse, makeToolUseResponse } from './setup/stubs.js';
import type { EvidenceEventId } from '../../src/domain/types.js';

// ── Test suite ──────────────────────────────────────────────────────
describe('Stage 2: Extraction', () => {
  let extractionService: ExtractionService;
  let anthropicSpy: ReturnType<typeof stubAnthropic>;

  beforeAll(async () => {
    await initInfra();
    extractionService = new ExtractionService();
  });

  afterAll(async () => {
    await teardownInfra();
  });

  beforeEach(async () => {
    await truncateAll();
    await clearRedisKeys();
    vi.clearAllMocks();

    // Default: return 2 action spans
    anthropicSpy = stubAnthropic(extractionService, () =>
      makeExtractionResponse([
        {
          text: 'file the motion to compel',
          action: 'File motion to compel',
          object: 'motion to compel',
          assignee: 'Attorney Jones',
          due: 'next Friday',
          confidence: 0.92,
        },
        {
          text: 'prepare deposition summary',
          action: 'Prepare deposition summary',
          object: 'deposition summary',
          assignee: 'Associate Davis',
          confidence: 0.85,
        },
      ]),
    );
  });

  it('extracts 2 action spans from evidence and persists to DB', async () => {
    const evidenceId = await insertEvidence();

    const result = await extractionService.extract(evidenceId as EvidenceEventId);

    expect(result.actionSpanIds).toHaveLength(2);
    expect(result.filteredSpans).toBe(2);
    expect(result.totalSpans).toBe(2);

    // Verify rows in action_spans
    const count = await countRows('action_spans', 'evidence_event_id = $1', [evidenceId]);
    expect(count).toBe(2);

    // Verify first span content
    const span = await findRow('action_spans', result.actionSpanIds[0]!);
    expect(span!.extracted_action).toBe('File motion to compel');
    expect(span!.extracted_object).toBe('motion to compel');
    expect(span!.confidence).toBeCloseTo(0.92);
  });

  it('advances evidence state to "extracted"', async () => {
    const evidenceId = await insertEvidence();

    await extractionService.extract(evidenceId as EvidenceEventId);

    const row = await findRow('evidence_events', evidenceId);
    expect(row!.processing_state).toBe('extracted');
  });

  it('filters out low-confidence spans below MIN_EXTRACTION_CONFIDENCE', async () => {
    anthropicSpy.mockImplementation(async () =>
      makeExtractionResponse([
        {
          text: 'high confidence span',
          action: 'Do something important',
          object: 'something',
          confidence: 0.92,
        },
        {
          text: 'low confidence span',
          action: 'Maybe do something',
          object: 'something else',
          confidence: 0.3, // Below 0.5 threshold
        },
      ]),
    );

    const evidenceId = await insertEvidence();
    const result = await extractionService.extract(evidenceId as EvidenceEventId);

    expect(result.totalSpans).toBe(2);
    expect(result.filteredSpans).toBe(1); // Only high-confidence kept
    expect(result.actionSpanIds).toHaveLength(1);

    const count = await countRows('action_spans', 'evidence_event_id = $1', [evidenceId]);
    expect(count).toBe(1);
  });

  it('handles zero spans extracted (state still advances)', async () => {
    anthropicSpy.mockImplementation(async () =>
      makeToolUseResponse([]), // No tool_use blocks
    );

    const evidenceId = await insertEvidence();
    const result = await extractionService.extract(evidenceId as EvidenceEventId);

    expect(result.actionSpanIds).toHaveLength(0);
    expect(result.totalSpans).toBe(0);

    const row = await findRow('evidence_events', evidenceId);
    expect(row!.processing_state).toBe('extracted');
  });

  it('throws PipelineError for missing evidence event', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000' as EvidenceEventId;

    await expect(extractionService.extract(fakeId))
      .rejects.toThrow(PipelineError);
  });

  it('creates audit log entry with extraction metadata', async () => {
    const evidenceId = await insertEvidence();

    await extractionService.extract(evidenceId as EvidenceEventId);

    const count = await countRows(
      'audit_log',
      "entity_type = 'evidence_event' AND action = 'updated' AND entity_id = $1",
      [evidenceId],
    );
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('skips malformed tool_use blocks gracefully', async () => {
    anthropicSpy.mockImplementation(async () =>
      makeToolUseResponse([
        {
          name: 'extract_action_span',
          input: {
            // Valid span
            text: 'valid span',
            start_offset: 0,
            end_offset: 10,
            signal_type: 'task',
            extracted_action: 'Do something',
            extracted_object: 'something',
            extracted_assignee_name: null,
            extracted_due_text: null,
            confidence: 0.9,
          },
        },
        {
          name: 'extract_action_span',
          input: {
            // Invalid: missing required 'text' field
            start_offset: 0,
            confidence: 'not-a-number', // Wrong type
          },
        },
      ]),
    );

    const evidenceId = await insertEvidence();
    const result = await extractionService.extract(evidenceId as EvidenceEventId);

    // Only the valid span should be persisted
    expect(result.actionSpanIds).toHaveLength(1);
  });

  it('records processingTimeMs in result', async () => {
    const evidenceId = await insertEvidence();
    const result = await extractionService.extract(evidenceId as EvidenceEventId);

    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.processingTimeMs).toBe('number');
  });
});
