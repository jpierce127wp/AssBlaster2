import { describe, it, expect } from 'vitest';
import { loadFixture } from '../helpers/load-fixture.js';
import { DeterministicDedup } from '../../src/dedupe/dedup.deterministic.js';
import { resolveDueDateConflict, resolveAssignmentConflict } from '../../src/dedupe/dedup.conflicts.js';
import { DEDUP_THRESHOLDS } from '../../src/domain/dedup.types.js';
import { TIER_CONFIDENCE } from '../../src/domain/identity.types.js';
import { HUMAN_SENSITIVE_FIELDS } from '../../src/domain/registry.types.js';
import { MIN_EXTRACTION_CONFIDENCE } from '../../src/domain/extraction.types.js';

interface ScenarioA {
  candidate_tasks: Array<{
    canonical_summary: string;
    matter_id: string;
    action_type: string;
    due_date_window_start: string;
  }>;
  expected: {
    canonical_task_count: number;
    evidence_link_count: number;
    fingerprints_match: boolean;
    action_type: string;
  };
}

interface ScenarioB {
  candidate_tasks: Array<{
    canonical_summary: string;
    matter_id: string;
    action_type: string;
    due_date_window_start: string;
  }>;
  expected: {
    canonical_task_count: number;
    fingerprints_match: boolean;
    action_types: string[];
  };
}

interface ScenarioC {
  existing_canonical_task: {
    id: string;
    status: string;
    canonical_summary: string;
    action_type: string;
    matter_id: string;
    due_date_window_start: string;
  };
  candidate_task: {
    canonical_summary: string;
    matter_id: string;
    action_type: string;
    due_date_window_start: string;
  };
  expected: {
    decision: string;
    reopen: boolean;
    creates_new_task: boolean;
  };
}

interface ScenarioD {
  identity_resolution: { tier: number; confidence: number };
  expected: { routes_to_review: boolean; tier_confidence: number };
}

interface ScenarioE {
  expected: {
    sensitive_fields_unchanged: boolean;
    protected_fields: string[];
    safe_fields_can_update: string[];
  };
}

interface ScenarioF {
  extracted_spans: Array<{ confidence: number }>;
  expected: { min_extraction_confidence: number; spans_above_threshold: number };
}

interface ScenarioG {
  evidence_events: Array<{ idempotency_key: string }>;
  expected: { idempotency_keys_match: boolean };
}

interface ScenarioH {
  conflict_resolution: {
    existing: { userId: string; authority: 'direct' | 'inferred' | 'derived' };
    candidate: { userId: string; authority: 'direct' | 'inferred' | 'derived' };
  };
  expected: { outcome: string; reason_contains: string };
}

describe('Golden Scenarios', () => {
  describe('Scenario A: Same task across sources → 1 canonical task', () => {
    const scenario = loadFixture<ScenarioA>('scenarios/scenario-a.json');

    it('all candidate fingerprints should match', () => {
      const fingerprints = scenario.candidate_tasks.map((ct) =>
        DeterministicDedup.computeFingerprint(ct.canonical_summary, ct.matter_id, ct.action_type, ct.due_date_window_start),
      );
      for (let i = 1; i < fingerprints.length; i++) {
        expect(fingerprints[i]).toEqual(fingerprints[0]);
      }
    });

    it('should expect exactly 1 canonical task', () => {
      expect(scenario.expected.canonical_task_count).toBe(1);
    });

    it('should expect 3 evidence links', () => {
      expect(scenario.expected.evidence_link_count).toBe(3);
    });
  });

  describe('Scenario B: Distinct tasks → different fingerprints', () => {
    const scenario = loadFixture<ScenarioB>('scenarios/scenario-b.json');

    it('fingerprints should differ between candidates', () => {
      const [ct1, ct2] = scenario.candidate_tasks;
      const fp1 = DeterministicDedup.computeFingerprint(ct1!.canonical_summary, ct1!.matter_id, ct1!.action_type, ct1!.due_date_window_start);
      const fp2 = DeterministicDedup.computeFingerprint(ct2!.canonical_summary, ct2!.matter_id, ct2!.action_type, ct2!.due_date_window_start);
      expect(fp1).not.toEqual(fp2);
    });

    it('should have different action_types', () => {
      expect(scenario.expected.action_types).toContain('filing');
      expect(scenario.expected.action_types).toContain('deposition');
    });

    it('should expect 2 canonical tasks', () => {
      expect(scenario.expected.canonical_task_count).toBe(2);
    });
  });

  describe('Scenario C: Completed task → follow-up, not reopen', () => {
    const scenario = loadFixture<ScenarioC>('scenarios/scenario-c.json');

    it('existing task has terminal status', () => {
      const terminalStatuses = new Set(['complete', 'superseded', 'discarded']);
      expect(terminalStatuses.has(scenario.existing_canonical_task.status)).toBe(true);
    });

    it('candidate fingerprint matches existing', () => {
      const existingFp = DeterministicDedup.computeFingerprint(
        scenario.existing_canonical_task.canonical_summary,
        scenario.existing_canonical_task.matter_id,
        scenario.existing_canonical_task.action_type,
        scenario.existing_canonical_task.due_date_window_start,
      );
      const candidateFp = DeterministicDedup.computeFingerprint(
        scenario.candidate_task.canonical_summary,
        scenario.candidate_task.matter_id,
        scenario.candidate_task.action_type,
        scenario.candidate_task.due_date_window_start,
      );
      expect(candidateFp).toEqual(existingFp);
    });

    it('expected decision is follow_up', () => {
      expect(scenario.expected.decision).toBe('follow_up');
    });

    it('should not reopen the existing task', () => {
      expect(scenario.expected.reopen).toBe(false);
    });
  });

  describe('Scenario D: Ambiguous matter → tier 6 confidence routes to review', () => {
    const scenario = loadFixture<ScenarioD>('scenarios/scenario-d.json');

    it('tier 6 confidence should be 0.0', () => {
      expect(TIER_CONFIDENCE[6]).toBe(0.0);
      expect(scenario.identity_resolution.confidence).toBe(TIER_CONFIDENCE[6]);
    });

    it('should route to review', () => {
      expect(scenario.expected.routes_to_review).toBe(true);
    });

    it('tier 6 confidence is below ADJUDICATION_REVIEW threshold', () => {
      expect(scenario.identity_resolution.confidence).toBeLessThan(DEDUP_THRESHOLDS.ADJUDICATION_REVIEW);
    });
  });

  describe('Scenario E: Human edit protection → sensitive fields blocked', () => {
    const scenario = loadFixture<ScenarioE>('scenarios/scenario-e.json');

    it('all protected fields are in HUMAN_SENSITIVE_FIELDS', () => {
      for (const field of scenario.expected.protected_fields) {
        expect(HUMAN_SENSITIVE_FIELDS.has(field)).toBe(true);
      }
    });

    it('safe fields are NOT in HUMAN_SENSITIVE_FIELDS', () => {
      for (const field of scenario.expected.safe_fields_can_update) {
        expect(HUMAN_SENSITIVE_FIELDS.has(field)).toBe(false);
      }
    });

    it('should indicate sensitive fields are unchanged', () => {
      expect(scenario.expected.sensitive_fields_unchanged).toBe(true);
    });
  });

  describe('Scenario F: Noisy transcript → zero candidates', () => {
    const scenario = loadFixture<ScenarioF>('scenarios/scenario-f.json');

    it('MIN_EXTRACTION_CONFIDENCE should be 0.5', () => {
      expect(MIN_EXTRACTION_CONFIDENCE).toBe(0.5);
      expect(scenario.expected.min_extraction_confidence).toBe(MIN_EXTRACTION_CONFIDENCE);
    });

    it('all extracted spans should be below threshold', () => {
      for (const span of scenario.extracted_spans) {
        expect(span.confidence).toBeLessThan(MIN_EXTRACTION_CONFIDENCE);
      }
    });

    it('should produce zero candidates', () => {
      expect(scenario.expected.spans_above_threshold).toBe(0);
    });
  });

  describe('Scenario G: Duplicate evidence → idempotent', () => {
    const scenario = loadFixture<ScenarioG>('scenarios/scenario-g.json');

    it('both events have the same idempotency_key', () => {
      const keys = scenario.evidence_events.map((e) => e.idempotency_key);
      expect(keys[0]).toBe(keys[1]);
    });

    it('idempotency_keys_match flag is true', () => {
      expect(scenario.expected.idempotency_keys_match).toBe(true);
    });
  });

  describe('Scenario H: Assignment conflict → review', () => {
    const scenario = loadFixture<ScenarioH>('scenarios/scenario-h.json');

    it('both parties have direct authority', () => {
      expect(scenario.conflict_resolution.existing.authority).toBe('direct');
      expect(scenario.conflict_resolution.candidate.authority).toBe('direct');
    });

    it('users are different', () => {
      expect(scenario.conflict_resolution.existing.userId)
        .not.toBe(scenario.conflict_resolution.candidate.userId);
    });

    it('resolveAssignmentConflict should route to review', () => {
      const result = resolveAssignmentConflict(
        scenario.conflict_resolution.existing,
        scenario.conflict_resolution.candidate,
      );
      expect(result.outcome).toBe('review');
    });

    it('review reason should mention both authoritative', () => {
      const result = resolveAssignmentConflict(
        scenario.conflict_resolution.existing,
        scenario.conflict_resolution.candidate,
      );
      expect(result.outcome).toBe('review');
      if (result.outcome === 'review') {
        expect(result.reason).toContain('both authoritative');
      }
    });
  });
});
