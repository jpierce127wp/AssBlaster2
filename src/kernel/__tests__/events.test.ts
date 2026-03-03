import { describe, it, expect } from 'vitest';
import type {
  PipelineEvent,
  EvidenceReceived,
  ActionSpansExtracted,
  CandidateTasksNormalized,
  CandidateTaskResolved,
  CandidateTaskDecided,
  CanonicalTaskChanged,
  ReviewRequested,
} from '../events.js';

/**
 * We test the event contracts at the structural level:
 * - each event satisfies PipelineEvent
 * - unique eventType discriminators
 * - correct schemaVersion
 */

function makeEvidenceReceived(): EvidenceReceived {
  return { eventType: 'evidence.received', schemaVersion: 1, evidenceEventId: 'ev-1' };
}

function makeActionSpansExtracted(): ActionSpansExtracted {
  return { eventType: 'action_spans.extracted', schemaVersion: 1, evidenceEventId: 'ev-1', actionSpanIds: ['as-1'] };
}

function makeCandidateTasksNormalized(): CandidateTasksNormalized {
  return { eventType: 'candidate_tasks.normalized', schemaVersion: 1, evidenceEventId: 'ev-1', candidateTaskIds: ['ct-1'] };
}

function makeCandidateTaskResolved(): CandidateTaskResolved {
  return { eventType: 'candidate_task.resolved', schemaVersion: 1, evidenceEventId: 'ev-1', candidateTaskId: 'ct-1' };
}

function makeCandidateTaskDecided(): CandidateTaskDecided {
  return { eventType: 'candidate_task.decided', schemaVersion: 1, evidenceEventId: 'ev-1', canonicalTaskId: 'can-1' };
}

function makeCanonicalTaskChanged(): CanonicalTaskChanged {
  return { eventType: 'canonical_task.changed', schemaVersion: 1, canonicalTaskId: 'can-1' };
}

function makeReviewRequested(): ReviewRequested {
  return { eventType: 'review.requested', schemaVersion: 1, candidateTaskId: 'ct-1', reason: 'low_confidence' };
}

const ALL_EVENTS: PipelineEvent[] = [
  makeEvidenceReceived(),
  makeActionSpansExtracted(),
  makeCandidateTasksNormalized(),
  makeCandidateTaskResolved(),
  makeCandidateTaskDecided(),
  makeCanonicalTaskChanged(),
  makeReviewRequested(),
];

describe('Pipeline Event Contracts', () => {
  it('should have exactly 7 event types', () => {
    expect(ALL_EVENTS).toHaveLength(7);
  });

  it('each event should have eventType and schemaVersion', () => {
    for (const event of ALL_EVENTS) {
      expect(event.eventType).toBeDefined();
      expect(typeof event.eventType).toBe('string');
      expect(event.schemaVersion).toBeDefined();
      expect(typeof event.schemaVersion).toBe('number');
    }
  });

  it('all eventType discriminators should be unique', () => {
    const types = ALL_EVENTS.map((e) => e.eventType);
    expect(new Set(types).size).toBe(types.length);
  });

  it('all events should have schemaVersion 1', () => {
    for (const event of ALL_EVENTS) {
      expect(event.schemaVersion).toBe(1);
    }
  });

  describe('EvidenceReceived', () => {
    it('should have correct eventType', () => {
      expect(makeEvidenceReceived().eventType).toBe('evidence.received');
    });

    it('should include evidenceEventId', () => {
      expect(makeEvidenceReceived().evidenceEventId).toBe('ev-1');
    });
  });

  describe('ActionSpansExtracted', () => {
    it('should have correct eventType', () => {
      expect(makeActionSpansExtracted().eventType).toBe('action_spans.extracted');
    });

    it('should include actionSpanIds array', () => {
      expect(makeActionSpansExtracted().actionSpanIds).toEqual(['as-1']);
    });
  });

  describe('CandidateTasksNormalized', () => {
    it('should have correct eventType', () => {
      expect(makeCandidateTasksNormalized().eventType).toBe('candidate_tasks.normalized');
    });

    it('should include candidateTaskIds', () => {
      expect(makeCandidateTasksNormalized().candidateTaskIds).toEqual(['ct-1']);
    });
  });

  describe('CandidateTaskResolved', () => {
    it('should have correct eventType and candidateTaskId', () => {
      const event = makeCandidateTaskResolved();
      expect(event.eventType).toBe('candidate_task.resolved');
      expect(event.candidateTaskId).toBe('ct-1');
    });
  });

  describe('CandidateTaskDecided', () => {
    it('should have correct eventType and canonicalTaskId', () => {
      const event = makeCandidateTaskDecided();
      expect(event.eventType).toBe('candidate_task.decided');
      expect(event.canonicalTaskId).toBe('can-1');
    });
  });

  describe('CanonicalTaskChanged', () => {
    it('should have correct eventType', () => {
      expect(makeCanonicalTaskChanged().eventType).toBe('canonical_task.changed');
    });
  });

  describe('ReviewRequested', () => {
    it('should have correct eventType and include reason', () => {
      const event = makeReviewRequested();
      expect(event.eventType).toBe('review.requested');
      expect(event.reason).toBe('low_confidence');
    });
  });
});
