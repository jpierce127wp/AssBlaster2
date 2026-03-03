/** Cache entry for identity lookups */
export interface IdentityCacheEntry {
  key: string;
  resolved_value: string;
  source: 'clio' | 'manual' | 'inferred';
  expires_at: Date;
}

/**
 * Identity resolution tier (ordered by confidence).
 * 1 = explicit matter ID / case number
 * 2 = explicit contact/client reference
 * 3 = known source-to-contact link
 * 4 = participant and thread history
 * 5 = semantic matter hints (ILIKE)
 * 6 = unresolved → review
 */
export type IdentityResolutionTier = 1 | 2 | 3 | 4 | 5 | 6;

/** Confidence per resolution tier (higher tier = lower confidence) */
export const TIER_CONFIDENCE: Record<IdentityResolutionTier, number> = {
  1: 0.98,
  2: 0.92,
  3: 0.85,
  4: 0.78,
  5: 0.65,
  6: 0.0,
};

/** Identity resolution result */
export interface IdentityResolutionResult {
  evidenceEventId: string;
  resolvedCandidateTaskIds: string[];
}
