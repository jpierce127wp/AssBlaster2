/**
 * Pipeline Event Contracts
 *
 * Typed event schemas for all 7 pipeline stages.
 * Each event includes eventType (discriminator) and schemaVersion for forward-compat.
 */

export interface PipelineEvent {
  eventType: string;
  schemaVersion: number;
  /** Originating HTTP request ID for end-to-end tracing */
  correlationId?: string;
}

/** Stage 1: Evidence received and ready for cleaning */
export interface EvidenceReceived extends PipelineEvent {
  eventType: 'evidence.received';
  schemaVersion: 1;
  evidenceEventId: string;
}

/** Stage 2: Action spans extracted from evidence */
export interface ActionSpansExtracted extends PipelineEvent {
  eventType: 'action_spans.extracted';
  schemaVersion: 1;
  evidenceEventId: string;
  actionSpanIds: string[];
}

/** Stage 3: Candidate tasks normalized from action spans */
export interface CandidateTasksNormalized extends PipelineEvent {
  eventType: 'candidate_tasks.normalized';
  schemaVersion: 1;
  evidenceEventId: string;
  candidateTaskIds: string[];
}

/** Stage 4: Candidate task identity resolved */
export interface CandidateTaskResolved extends PipelineEvent {
  eventType: 'candidate_task.resolved';
  schemaVersion: 1;
  evidenceEventId: string;
  candidateTaskId: string;
}

/** Stage 5: Candidate task dedup decided */
export interface CandidateTaskDecided extends PipelineEvent {
  eventType: 'candidate_task.decided';
  schemaVersion: 1;
  evidenceEventId: string;
  canonicalTaskId: string;
}

/** Stage 6: Canonical task changed (assignment complete) */
export interface CanonicalTaskChanged extends PipelineEvent {
  eventType: 'canonical_task.changed';
  schemaVersion: 1;
  canonicalTaskId: string;
}

/** Stage 7: Review requested for ambiguous case */
export interface ReviewRequested extends PipelineEvent {
  eventType: 'review.requested';
  schemaVersion: 1;
  candidateTaskId: string;
  reason: string;
}
