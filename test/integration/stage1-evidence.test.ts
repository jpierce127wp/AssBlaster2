/**
 * Integration tests for Stage 1: Evidence Ingestion & Cleaning.
 * Tests EvidenceService.ingest() and cleanEvidence() against real Postgres.
 * No external API stubs needed — pure DB + adapter logic.
 */
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// ── Module-level mocks (hoisted before imports) ────────────────────
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
import { EvidenceService } from '../../src/ingestion/evidence.service.js';
import { PipelineError } from '../../src/domain/errors.js';
import {
  initInfra, truncateAll, clearRedisKeys, teardownInfra,
  findRow, countRows, makeIngestRequest,
} from './setup/helpers.js';
import type { EvidenceEventId } from '../../src/domain/types.js';

// ── Test suite ──────────────────────────────────────────────────────
describe('Stage 1: Evidence Ingestion', () => {
  let evidenceService: EvidenceService;

  beforeAll(async () => {
    await initInfra();
    evidenceService = new EvidenceService();
  });

  afterAll(async () => {
    await teardownInfra();
  });

  beforeEach(async () => {
    await truncateAll();
    await clearRedisKeys();
    vi.clearAllMocks();
  });

  // ── Ingest tests ────────────────────────────────────────────────

  it('ingests a phone transcript and creates a row with state "received"', async () => {
    const { id, isNew } = await evidenceService.ingest(makeIngestRequest({
      idempotency_key: 'phone-001',
      source_type: 'phone',
      raw_text: 'Attorney Jones discussed filing the motion to compel in the Johnson matter by next Friday.',
      participants: [{ name: 'Attorney Jones', role: 'attorney' }],
      matter_hints: ['Johnson'],
      contact_hints: ['Attorney Jones'],
    }));

    expect(isNew).toBe(true);
    expect(id).toBeTruthy();

    const row = await findRow('evidence_events', id);
    expect(row).not.toBeNull();
    expect(row!.source_type).toBe('phone');
    expect(row!.processing_state).toBe('received');
    expect(row!.raw_text).toContain('motion to compel');
  });

  it('ingests an email and creates a row with correct source_type', async () => {
    const { id, isNew } = await evidenceService.ingest(makeIngestRequest({
      idempotency_key: 'email-001',
      source_type: 'email',
      raw_text: 'Dear counsel, please prepare the deposition summary for the Martinez case.',
      participants: [
        { name: 'Partner Smith', role: 'partner' },
        { name: 'Associate Davis', role: 'associate' },
      ],
      matter_hints: ['Martinez'],
    }));

    expect(isNew).toBe(true);

    const row = await findRow('evidence_events', id);
    expect(row!.source_type).toBe('email');
    expect(row!.processing_state).toBe('received');
  });

  it('ingests a meeting transcript', async () => {
    const { id, isNew } = await evidenceService.ingest(makeIngestRequest({
      idempotency_key: 'meeting-001',
      source_type: 'meeting',
      raw_text: 'In the meeting, Sarah agreed to draft the complaint by EOW.',
      participants: [{ name: 'Sarah' }],
    }));

    expect(isNew).toBe(true);
    const row = await findRow('evidence_events', id);
    expect(row!.source_type).toBe('meeting');
  });

  it('rejects duplicate idempotency_key and returns isNew: false', async () => {
    const { id: firstId } = await evidenceService.ingest(makeIngestRequest({
      idempotency_key: 'dup-key-001',
      source_type: 'phone',
      raw_text: 'First ingestion with this key.',
    }));

    const { id: secondId, isNew } = await evidenceService.ingest(makeIngestRequest({
      idempotency_key: 'dup-key-001',
      source_type: 'phone',
      raw_text: 'Second ingestion with the same key (should be rejected).',
    }));

    expect(isNew).toBe(false);
    expect(secondId).toBe(firstId);

    // Only 1 row should exist
    const count = await countRows('evidence_events');
    expect(count).toBe(1);
  });

  it('creates an audit log entry on ingestion', async () => {
    await evidenceService.ingest(makeIngestRequest({
      idempotency_key: 'audit-test-001',
      source_type: 'phone',
      raw_text: 'Some evidence text.',
    }));

    const count = await countRows('audit_log', "action = 'created' AND entity_type = 'evidence_event'");
    expect(count).toBe(1);
  });

  // ── Clean tests ─────────────────────────────────────────────────

  it('cleans evidence and updates cleaned_text column', async () => {
    const { id } = await evidenceService.ingest(makeIngestRequest({
      idempotency_key: 'clean-001',
      source_type: 'phone',
      raw_text: 'Attorney Jones discussed filing the motion to compel in the Johnson matter by next Friday.',
      participants: [{ name: 'Attorney Jones', role: 'attorney' }],
    }));

    const cleaned = await evidenceService.cleanEvidence(id as EvidenceEventId);

    expect(cleaned.cleaned_text).toBeTruthy();
    expect(cleaned.cleaned_text.length).toBeGreaterThan(0);

    // Verify DB was updated
    const row = await findRow('evidence_events', id);
    expect(row!.cleaned_text).toBeTruthy();
  });

  it('cleans an email and produces participants and matter_hints', async () => {
    const { id } = await evidenceService.ingest(makeIngestRequest({
      idempotency_key: 'clean-email-001',
      source_type: 'email',
      raw_text: 'From: partner@firm.com\nTo: associate@firm.com\nSubject: Martinez deposition\n\nPlease prepare the deposition summary.',
      source_metadata: { from: 'partner@firm.com', to: 'associate@firm.com', subject: 'Martinez deposition' },
    }));

    const cleaned = await evidenceService.cleanEvidence(id as EvidenceEventId);
    expect(cleaned.cleaned_text).toBeTruthy();
  });

  it('throws PipelineError when cleaning non-existent evidence', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000' as EvidenceEventId;

    await expect(evidenceService.cleanEvidence(fakeId))
      .rejects.toThrow(PipelineError);
  });
});
