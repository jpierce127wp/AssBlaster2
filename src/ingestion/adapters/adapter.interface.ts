import type { CleanedEvidence } from '../evidence.types.js';

/**
 * Adapters clean and normalize raw source text. They do NOT write to
 * Clio or the canonical registry directly.
 * See policy D1 (SOURCE_OF_TRUTH) and D2 (DIRECT_SOURCE_TO_CLIO).
 */
export interface SourceAdapter {
  /** Clean and normalize raw source text */
  clean(rawText: string, metadata: Record<string, unknown>): CleanedEvidence;
}
