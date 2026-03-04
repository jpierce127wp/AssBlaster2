/**
 * Service Interfaces
 *
 * Explicit contracts for the two key dedup subsystems.
 */

import type { AdjudicationLabel } from './types.js';
import type { CandidateTaskRow } from './normalization.types.js';
import type { CanonicalTask } from './registry.types.js';

export interface SemanticTaskRetriever {
  retrieveSimilarOpenTasks(input: {
    candidateTaskId: string;
    queryText: string;
    matterId?: string | null;
    contactId?: string | null;
    topK: number;
  }): Promise<Array<{ canonicalTaskId: string; score: number }>>;
}

export interface DuplicateAdjudicator {
  classify(input: {
    candidateTask: CandidateTaskRow;
    canonicalTask: CanonicalTask;
    supportingEvidence: string[];
  }): Promise<{
    label: AdjudicationLabel;
    rationale: string;
    confidence: number;
  }>;
}
