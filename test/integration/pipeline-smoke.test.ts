/**
 * Integration smoke tests: full 7-stage pipeline end-to-end.
 * Calls all stages sequentially on a single evidence event, then verifies
 * the complete DB state. Also tests duplicate processing (dedup merge).
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
import { EvidenceService } from '../../src/ingestion/evidence.service.js';
import { ExtractionService } from '../../src/extraction/extraction.service.js';
import { NormalizationService } from '../../src/normalization/normalization.service.js';
import { IdentityService } from '../../src/resolution/identity.service.js';
import { DedupService } from '../../src/dedupe/dedup.service.js';
import { AssignmentService } from '../../src/assignment/assignment.service.js';
import { getEmbeddingProvider } from '../../src/lib/infra/embedding.js';
import {
  initInfra, truncateAll, clearRedisKeys, teardownInfra,
  insertMatter, insertUser, insertRoutingRule,
  findRow, countRows, makeIngestRequest,
} from './setup/helpers.js';
import {
  stubAnthropic, stubEmbedding,
  makeExtractionResponse, makeNormalizationResponse, makeAdjudicationResponse,
} from './setup/stubs.js';
import type { EvidenceEventId, CandidateTaskId, CanonicalTaskId } from '../../src/domain/types.js';

// ── Test suite ──────────────────────────────────────────────────────
describe('Pipeline Smoke Tests', () => {
  let evidenceService: EvidenceService;
  let extractionService: ExtractionService;
  let normalizationService: NormalizationService;
  let identityService: IdentityService;
  let dedupService: DedupService;
  let assignmentService: AssignmentService;

  beforeAll(async () => {
    await initInfra();

    evidenceService = new EvidenceService();
    extractionService = new ExtractionService();
    normalizationService = new NormalizationService();
    identityService = new IdentityService();
    dedupService = new DedupService();
    assignmentService = new AssignmentService();

    // Stub embedding provider
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

    // Stub Anthropic for extraction
    stubAnthropic(extractionService, () =>
      makeExtractionResponse([
        {
          text: 'file the motion to compel in the Johnson matter by next Friday',
          action: 'File motion to compel',
          object: 'motion to compel',
          assignee: 'Sarah Chen',
          due: 'next Friday',
          confidence: 0.95,
        },
      ]),
    );

    // Stub Anthropic for normalization
    stubAnthropic(normalizationService, () =>
      makeNormalizationResponse([
        {
          summary: 'File motion to compel in Johnson matter',
          actionType: 'filing',
          targetObject: 'motion to compel',
          desiredOutcome: 'Court grants motion to compel discovery responses',
          assigneeName: 'Sarah Chen',
          dueStart: '2026-03-13',
          dueKind: 'exact',
          matterRef: 'Johnson v. Smith',
          priority: 'high',
          confidenceExtraction: 0.95,
          confidenceNormalization: 0.90,
        },
      ]),
    );

    // Stub adjudicator (shouldn't be called in happy path, but just in case)
    stubAnthropic((dedupService as any).adjudicator, () =>
      makeAdjudicationResponse('distinct', null, 0.9, 'Tasks are distinct'),
    );
  });

  /** Seed registries with test data */
  async function seedRegistries() {
    await insertMatter({
      matter_ref: 'Johnson v. Smith',
      display_name: 'Johnson v. Smith',
      client_name: 'Johnson',
      aliases: '{Johnson,johnson}',
    });

    await insertUser({
      user_ref: 'sarah-chen-001',
      display_name: 'Sarah Chen',
      email: 'sarah.chen@firm.com',
      role: 'Associate',
      aliases: '{Sarah Chen,sarah}',
    });

    await insertRoutingRule({
      practice_area: '*',
      action_type: 'filing',
      assignee_user_id: 'sarah-chen-001',
      assignee_role: 'Associate',
      priority: 10,
    });
  }

  it('processes evidence through all 6 stages end-to-end', async () => {
    await seedRegistries();

    // ── Stage 1: Ingest ───────────────────────────────────────────
    const { id: evidenceId, isNew } = await evidenceService.ingest(makeIngestRequest({
      idempotency_key: 'smoke-test-001',
      source_type: 'phone',
      raw_text: 'Attorney Jones discussed filing the motion to compel in the Johnson matter by next Friday. Sarah Chen should handle this.',
      participants: [
        { name: 'Attorney Jones', role: 'attorney' },
        { name: 'Sarah Chen', role: 'associate' },
      ],
      matter_hints: ['Johnson'],
      contact_hints: ['Sarah Chen'],
    }));
    expect(isNew).toBe(true);

    // ── Stage 1b: Clean ───────────────────────────────────────────
    const cleaned = await evidenceService.cleanEvidence(evidenceId as EvidenceEventId);
    expect(cleaned.cleaned_text).toBeTruthy();

    // ── Stage 2: Extract ──────────────────────────────────────────
    const extraction = await extractionService.extract(evidenceId as EvidenceEventId);
    expect(extraction.actionSpanIds).toHaveLength(1);

    // ── Stage 3: Normalize ────────────────────────────────────────
    const normalization = await normalizationService.normalize(
      evidenceId as EvidenceEventId,
      extraction.actionSpanIds,
    );
    expect(normalization.candidateTaskIds).toHaveLength(1);
    const candidateTaskId = normalization.candidateTaskIds[0]!;

    // ── Stage 4: Identity Resolution ──────────────────────────────
    const resolution = await identityService.resolve(
      evidenceId as EvidenceEventId,
      normalization.candidateTaskIds,
    );
    expect(resolution.resolvedCandidateTaskIds).toHaveLength(1);

    // ── Stage 5: Dedup ────────────────────────────────────────────
    const { decision, canonicalTaskId } = await dedupService.checkAndProcess(
      evidenceId as EvidenceEventId,
      candidateTaskId as CandidateTaskId,
    );
    expect(decision.action).toBe('create_new');
    expect(canonicalTaskId).toBeTruthy();

    // ── Stage 6: Assignment ───────────────────────────────────────
    const assignment = await assignmentService.assign(canonicalTaskId as CanonicalTaskId);
    // Sarah Chen was resolved as explicit assignee
    expect(assignment.method).toBe('explicit');

    // ── Verify final DB state ─────────────────────────────────────

    // Evidence state
    const ev = await findRow('evidence_events', evidenceId);
    expect(ev!.processing_state).toBe('decided');

    // 1 action span
    const spanCount = await countRows('action_spans', 'evidence_event_id = $1', [evidenceId]);
    expect(spanCount).toBe(1);

    // 1 candidate task with resolved IDs
    const ct = await findRow('candidate_tasks', candidateTaskId);
    expect(ct!.matter_id).toBe('Johnson v. Smith');
    expect(ct!.assignee_user_id).toBe('sarah-chen-001');
    expect(ct!.assignee_resolution_kind).toBe('resolved');

    // 1 canonical task
    const canonical = await findRow('canonical_tasks', canonicalTaskId!);
    expect(canonical!.canonical_summary).toBe('File motion to compel in Johnson matter');
    expect(canonical!.action_type).toBe('filing');
    expect(canonical!.priority).toBe('high');
    expect(canonical!.fingerprint).toBeTruthy();

    // 1 merge decision with outcome='created'
    const mdCount = await countRows(
      'merge_decisions',
      "candidate_task_id = $1 AND outcome = 'created'",
      [candidateTaskId],
    );
    expect(mdCount).toBe(1);

    // task_evidence_links connects canonical task to evidence
    const linkCount = await countRows(
      'task_evidence_links',
      'canonical_task_id = $1 AND evidence_event_id = $2',
      [canonicalTaskId, evidenceId],
    );
    expect(linkCount).toBe(1);

    // Audit trail has entries for all stages
    const auditCount = await countRows(
      'audit_log',
      "entity_id = $1 AND entity_type = 'evidence_event'",
      [evidenceId],
    );
    expect(auditCount).toBeGreaterThanOrEqual(4); // ingest, clean, extract, normalize, resolve
  });

  it('dedup merges a duplicate evidence event instead of creating', async () => {
    await seedRegistries();

    // ── First evidence: full pipeline ─────────────────────────────
    const { id: firstId } = await evidenceService.ingest(makeIngestRequest({
      idempotency_key: 'smoke-dup-001',
      source_type: 'phone',
      raw_text: 'File the motion to compel in Johnson by Friday.',
      participants: [{ name: 'Sarah Chen' }],
      matter_hints: ['Johnson'],
      contact_hints: ['Sarah Chen'],
    }));

    await evidenceService.cleanEvidence(firstId as EvidenceEventId);
    const ext1 = await extractionService.extract(firstId as EvidenceEventId);
    const norm1 = await normalizationService.normalize(
      firstId as EvidenceEventId,
      ext1.actionSpanIds,
    );
    await identityService.resolve(firstId as EvidenceEventId, norm1.candidateTaskIds);
    const { canonicalTaskId: firstCanonicalId } = await dedupService.checkAndProcess(
      firstId as EvidenceEventId,
      norm1.candidateTaskIds[0]! as CandidateTaskId,
    );
    expect(firstCanonicalId).toBeTruthy();

    // ── Second evidence: same task, different idempotency key ─────
    // Clear Redis identity cache so the second run re-resolves
    await clearRedisKeys();

    const { id: secondId } = await evidenceService.ingest(makeIngestRequest({
      idempotency_key: 'smoke-dup-002', // Different key
      source_type: 'phone',
      raw_text: 'Reminder: file the motion to compel in Johnson by Friday.',
      participants: [{ name: 'Sarah Chen' }],
      matter_hints: ['Johnson'],
      contact_hints: ['Sarah Chen'],
    }));

    await evidenceService.cleanEvidence(secondId as EvidenceEventId);
    const ext2 = await extractionService.extract(secondId as EvidenceEventId);
    const norm2 = await normalizationService.normalize(
      secondId as EvidenceEventId,
      ext2.actionSpanIds,
    );
    await identityService.resolve(secondId as EvidenceEventId, norm2.candidateTaskIds);
    const { decision, canonicalTaskId: secondCanonicalId } = await dedupService.checkAndProcess(
      secondId as EvidenceEventId,
      norm2.candidateTaskIds[0]! as CandidateTaskId,
    );

    // Should merge into the first canonical task (deterministic fingerprint match)
    expect(decision.action).toBe('merge');
    expect(secondCanonicalId).toBe(firstCanonicalId);

    // Still only 1 canonical task
    const canonicalCount = await countRows('canonical_tasks');
    expect(canonicalCount).toBe(1);

    // But 2 evidence events
    const evidenceCount = await countRows('evidence_events');
    expect(evidenceCount).toBe(2);

    // And 2 merge decisions (created + merged)
    const mdCount = await countRows('merge_decisions');
    expect(mdCount).toBe(2);
  });

  it('handles pipeline with no assignee resolution (triage path)', async () => {
    // Seed matter but no user matching the assignee
    await insertMatter({
      matter_ref: 'Johnson v. Smith',
      display_name: 'Johnson v. Smith',
    });

    // Use an assignee name that won't resolve
    stubAnthropic(normalizationService, () =>
      makeNormalizationResponse([
        {
          summary: 'File motion to compel in Johnson matter',
          actionType: 'filing',
          assigneeName: 'Unknown Person',
          matterRef: 'Johnson v. Smith',
          priority: 'normal',
        },
      ]),
    );

    const { id: evidenceId } = await evidenceService.ingest(makeIngestRequest({
      idempotency_key: 'triage-001',
      source_type: 'phone',
      raw_text: 'Someone should file the motion.',
    }));

    await evidenceService.cleanEvidence(evidenceId as EvidenceEventId);
    const ext = await extractionService.extract(evidenceId as EvidenceEventId);
    const norm = await normalizationService.normalize(
      evidenceId as EvidenceEventId,
      ext.actionSpanIds,
    );
    await identityService.resolve(evidenceId as EvidenceEventId, norm.candidateTaskIds);
    const { canonicalTaskId } = await dedupService.checkAndProcess(
      evidenceId as EvidenceEventId,
      norm.candidateTaskIds[0]! as CandidateTaskId,
    );

    // Assignment without a resolved user should fall through
    const assignment = await assignmentService.assign(canonicalTaskId as CanonicalTaskId);

    // The canonical task has assignee_role='Unknown Person' (from normalization)
    // but no assignee_user_id — should be 'role' method
    expect(['role', 'triage', 'rule']).toContain(assignment.method);
  });

  it('full pipeline with email source type', async () => {
    await seedRegistries();

    stubAnthropic(extractionService, () =>
      makeExtractionResponse([
        {
          text: 'prepare the deposition summary',
          action: 'Prepare deposition summary',
          object: 'deposition summary',
          assignee: 'Sarah Chen',
          confidence: 0.88,
        },
      ]),
    );

    stubAnthropic(normalizationService, () =>
      makeNormalizationResponse([
        {
          summary: 'Prepare deposition summary for Johnson matter',
          actionType: 'drafting',
          targetObject: 'deposition summary',
          assigneeName: 'Sarah Chen',
          matterRef: 'Johnson v. Smith',
          priority: 'normal',
        },
      ]),
    );

    const { id: evidenceId } = await evidenceService.ingest(makeIngestRequest({
      idempotency_key: 'email-smoke-001',
      source_type: 'email',
      raw_text: 'From: partner@firm.com\nTo: sarah.chen@firm.com\nSubject: Johnson deposition\n\nPlease prepare the deposition summary for the Johnson matter.',
      source_metadata: { from: 'partner@firm.com', to: 'sarah.chen@firm.com' },
      participants: [{ name: 'Sarah Chen' }],
      contact_hints: ['Sarah Chen'],
    }));

    await evidenceService.cleanEvidence(evidenceId as EvidenceEventId);
    const ext = await extractionService.extract(evidenceId as EvidenceEventId);
    const norm = await normalizationService.normalize(
      evidenceId as EvidenceEventId,
      ext.actionSpanIds,
    );
    await identityService.resolve(evidenceId as EvidenceEventId, norm.candidateTaskIds);
    const { canonicalTaskId } = await dedupService.checkAndProcess(
      evidenceId as EvidenceEventId,
      norm.candidateTaskIds[0]! as CandidateTaskId,
    );

    expect(canonicalTaskId).toBeTruthy();

    const canonical = await findRow('canonical_tasks', canonicalTaskId!);
    expect(canonical!.canonical_summary).toContain('deposition summary');
    expect(canonical!.action_type).toBe('drafting');

    // Evidence event should show email source
    const ev = await findRow('evidence_events', evidenceId);
    expect(ev!.source_type).toBe('email');
    expect(ev!.processing_state).toBe('decided');
  });

  it('pipeline creates proper audit trail across all stages', async () => {
    await seedRegistries();

    const { id: evidenceId } = await evidenceService.ingest(makeIngestRequest({
      idempotency_key: 'audit-trail-001',
      source_type: 'phone',
      raw_text: 'File the motion to compel.',
      participants: [{ name: 'Sarah Chen' }],
    }));

    await evidenceService.cleanEvidence(evidenceId as EvidenceEventId);
    const ext = await extractionService.extract(evidenceId as EvidenceEventId);
    const norm = await normalizationService.normalize(
      evidenceId as EvidenceEventId,
      ext.actionSpanIds,
    );
    await identityService.resolve(evidenceId as EvidenceEventId, norm.candidateTaskIds);
    const { canonicalTaskId } = await dedupService.checkAndProcess(
      evidenceId as EvidenceEventId,
      norm.candidateTaskIds[0]! as CandidateTaskId,
    );
    await assignmentService.assign(canonicalTaskId as CanonicalTaskId);

    // Count all audit entries
    const totalAudit = await countRows('audit_log');
    // Should have entries for: ingest(created), clean(updated), extract(updated),
    // normalize(updated), resolve(updated), dedup(created canonical + merged evidence),
    // assignment(updated)
    expect(totalAudit).toBeGreaterThanOrEqual(6);

    // Evidence-related audit entries
    const evAudit = await countRows(
      'audit_log',
      "entity_type = 'evidence_event' AND entity_id = $1",
      [evidenceId],
    );
    expect(evAudit).toBeGreaterThanOrEqual(4);

    // Canonical task audit entries
    const ctAudit = await countRows(
      'audit_log',
      "entity_type = 'canonical_task' AND entity_id = $1",
      [canonicalTaskId],
    );
    expect(ctAudit).toBeGreaterThanOrEqual(2); // created + assignment
  });
});
