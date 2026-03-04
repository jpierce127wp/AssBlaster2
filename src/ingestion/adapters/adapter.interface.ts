import type { CleanedEvidence } from '../evidence.types.js';

export interface SourceAdapter {
  /** Clean and normalize raw source text */
  clean(rawText: string, metadata: Record<string, unknown>): CleanedEvidence;
}
