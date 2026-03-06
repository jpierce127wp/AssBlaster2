/**
 * Integration tests for Stage 4: Identity Resolution.
 * Tests IdentityService.resolve() against real Postgres + Redis.
 * No external API stubs — pure DB lookups + Redis caching.
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
import { PipelineError } from '../../src/domain/errors.js';
import {
  initInfra, truncateAll, clearRedisKeys, teardownInfra,
  insertEvidence, insertMatter, insertUser, findRow, countRows,
} from './setup/helpers.js';
import {
  stubAnthropic, makeExtractionResponse, makeNormalizationResponse,
} from './setup/stubs.js';
import type { EvidenceEventId } from '../../src/domain/types.js';

// ── Test suite ──────────────────────────────────────────────────────
describe('Stage 4: Identity Resolution', () => {
  let extractionService: ExtractionService;
  let normalizationService: NormalizationService;
  let identityService: IdentityService;

  beforeAll(async () => {
    await initInfra();
    extractionService = new ExtractionService();
    normalizationService = new NormalizationService();
    identityService = new IdentityService();
  });

  afterAll(async () => {
    await teardownInfra();
  });

  beforeEach(async () => {
    await truncateAll();
    await clearRedisKeys();
    vi.clearAllMocks();

    // Default stubs for stages 2 + 3
    stubAnthropic(extractionService, () =>
      makeExtractionResponse([
        {
          text: 'file the motion to compel',
          action: 'File motion to compel',
          object: 'motion to compel',
          assignee: 'Sarah Chen',
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
          assigneeName: 'Sarah Chen',
          dueStart: '2026-03-13',
          matterRef: 'Johnson v. Smith',
          priority: 'high',
        },
      ]),
    );
  });

  /** Helper: run stages 1-3, return { evidenceId, candidateTaskIds } */
  async function runThroughNormalization(): Promise<{
    evidenceId: string;
    candidateTaskIds: string[];
  }> {
    const evidenceId = await insertEvidence({
      participants: JSON.stringify([{ name: 'Sarah Chen', role: 'attorney' }]),
      contact_hints: '{Sarah Chen}',
    });
    const extraction = await extractionService.extract(evidenceId as EvidenceEventId);
    const normalization = await normalizationService.normalize(
      evidenceId as EvidenceEventId,
      extraction.actionSpanIds,
    );
    return { evidenceId, candidateTaskIds: normalization.candidateTaskIds };
  }

  it('resolves matter via exact match in matter_registry', async () => {
    // Pre-seed matter
    await insertMatter({
      matter_ref: 'Johnson v. Smith',
      display_name: 'Johnson v. Smith',
      aliases: '{Johnson,johnson}',
    });

    const { evidenceId, candidateTaskIds } = await runThroughNormalization();

    const result = await identityService.resolve(
      evidenceId as EvidenceEventId,
      candidateTaskIds,
    );

    expect(result.resolvedCandidateTaskIds).toHaveLength(1);

    const ct = await findRow('candidate_tasks', candidateTaskIds[0]!);
    expect(ct!.matter_id).toBe('Johnson v. Smith');
    // Tier 1 confidence = 0.98
    expect(Number(ct!.confidence_resolution)).toBeGreaterThan(0.5);
  });

  it('resolves assignee via user_registry lookup', async () => {
    await insertMatter({ matter_ref: 'Johnson v. Smith' });
    await insertUser({
      user_ref: 'sarah-chen-001',
      display_name: 'Sarah Chen',
      aliases: '{Sarah Chen,sarah}',
    });

    const { evidenceId, candidateTaskIds } = await runThroughNormalization();

    await identityService.resolve(evidenceId as EvidenceEventId, candidateTaskIds);

    const ct = await findRow('candidate_tasks', candidateTaskIds[0]!);
    expect(ct!.assignee_user_id).toBe('sarah-chen-001');
    expect(ct!.assignee_resolution_kind).toBe('resolved');
  });

  it('leaves assignee_user_id null for unresolvable name', async () => {
    await insertMatter({ matter_ref: 'Johnson v. Smith' });
    // No user seeded matching 'Sarah Chen'

    const { evidenceId, candidateTaskIds } = await runThroughNormalization();

    await identityService.resolve(evidenceId as EvidenceEventId, candidateTaskIds);

    const ct = await findRow('candidate_tasks', candidateTaskIds[0]!);
    expect(ct!.assignee_user_id).toBeNull();
    // Confidence should reflect unresolved assignee (0.7)
    expect(Number(ct!.confidence_resolution)).toBeLessThan(0.9);
  });

  it('creates review item for unknown matter reference', async () => {
    // No matter seeded — matter_id can't be resolved

    const { evidenceId, candidateTaskIds } = await runThroughNormalization();

    await identityService.resolve(evidenceId as EvidenceEventId, candidateTaskIds);

    const reviewCount = await countRows(
      'review_queue',
      "reason = 'weak_identity' AND candidate_task_id = $1",
      [candidateTaskIds[0]!],
    );
    expect(reviewCount).toBeGreaterThanOrEqual(1);
  });

  it('creates review item when matter confidence below MATTER_CONFIDENCE_MIN', async () => {
    // Seed matter with a display_name that only matches via ILIKE (tier 5, confidence 0.65)
    await insertMatter({
      matter_ref: 'johnson-case-2026',
      display_name: 'Johnson Family Trust Matter',
      aliases: '{}', // No alias matching 'Johnson v. Smith'
    });

    // Use a matter reference that won't match exactly but will ILIKE
    stubAnthropic(normalizationService, () =>
      makeNormalizationResponse([
        {
          summary: 'File motion in Johnson case',
          matterRef: 'Johnson', // Will ILIKE match to 'johnson-case-2026'
          assigneeName: undefined,
          actionType: 'filing',
        },
      ]),
    );

    const { evidenceId, candidateTaskIds } = await runThroughNormalization();

    await identityService.resolve(evidenceId as EvidenceEventId, candidateTaskIds);

    // Tier 5 = confidence 0.65, which is below MATTER_CONFIDENCE_MIN (0.75)
    const reviewCount = await countRows(
      'review_queue',
      "reason = 'weak_identity' AND candidate_task_id = $1",
      [candidateTaskIds[0]!],
    );
    expect(reviewCount).toBeGreaterThanOrEqual(1);
  });

  it('advances evidence state to "resolved"', async () => {
    await insertMatter({ matter_ref: 'Johnson v. Smith' });

    const { evidenceId, candidateTaskIds } = await runThroughNormalization();

    await identityService.resolve(evidenceId as EvidenceEventId, candidateTaskIds);

    const row = await findRow('evidence_events', evidenceId);
    expect(row!.processing_state).toBe('resolved');
  });

  it('updates confidence_resolution in candidate_tasks', async () => {
    await insertMatter({ matter_ref: 'Johnson v. Smith' });
    await insertUser({
      user_ref: 'sarah-chen-001',
      display_name: 'Sarah Chen',
    });

    const { evidenceId, candidateTaskIds } = await runThroughNormalization();

    await identityService.resolve(evidenceId as EvidenceEventId, candidateTaskIds);

    const ct = await findRow('candidate_tasks', candidateTaskIds[0]!);
    expect(Number(ct!.confidence_resolution)).toBeGreaterThan(0);
  });

  it('throws PipelineError for missing evidence event', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000' as EvidenceEventId;

    await expect(
      identityService.resolve(fakeId, ['some-candidate-id']),
    ).rejects.toThrow(PipelineError);
  });

  it('creates audit log entry for resolution', async () => {
    await insertMatter({ matter_ref: 'Johnson v. Smith' });

    const { evidenceId, candidateTaskIds } = await runThroughNormalization();

    await identityService.resolve(evidenceId as EvidenceEventId, candidateTaskIds);

    const count = await countRows(
      'audit_log',
      "entity_type = 'evidence_event' AND entity_id = $1 AND summary LIKE '%resolution%'",
      [evidenceId],
    );
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('resolves matter via alias match', async () => {
    await insertMatter({
      matter_ref: 'JVS-2026-001',
      display_name: 'Johnson v. Smith (2026)',
      aliases: '{Johnson v. Smith,JVS}',
    });

    const { evidenceId, candidateTaskIds } = await runThroughNormalization();

    await identityService.resolve(evidenceId as EvidenceEventId, candidateTaskIds);

    const ct = await findRow('candidate_tasks', candidateTaskIds[0]!);
    // Should resolve via alias to the matter_ref
    expect(ct!.matter_id).toBe('JVS-2026-001');
  });
});
