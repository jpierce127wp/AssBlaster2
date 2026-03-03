/** Cache entry for identity lookups */
export interface IdentityCacheEntry {
  key: string;
  resolved_value: string;
  source: 'clio' | 'manual' | 'inferred';
  expires_at: Date;
}

/** Identity resolution result */
export interface IdentityResolutionResult {
  evidenceEventId: string;
  resolvedCandidateTaskIds: string[];
}
