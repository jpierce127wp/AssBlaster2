import { RegistryRepo } from '../registry/registry.repo.js';
import type { CanonicalTask, TaskFingerprint } from '../registry/registry.types.js';

export class DeterministicDedup {
  private registryRepo = new RegistryRepo();

  /** Generate a TaskFingerprint from key fields */
  static computeFingerprint(canonicalSummary: string, matterId: string | null, actionType: string, dueDateWindowStart: string | null): TaskFingerprint {
    return {
      canonicalSummary: canonicalSummary.toLowerCase().trim().replace(/\s+/g, ' '),
      matterId: matterId?.toLowerCase().trim() ?? null,
      actionType: actionType.toLowerCase(),
      dueDateWindowStart: dueDateWindowStart ?? null,
    };
  }

  /** Check for exact match by TaskFingerprint */
  async findExactMatch(
    canonicalSummary: string,
    matterId: string | null,
    actionType: string,
    dueDateWindowStart: string | null,
  ): Promise<{ match: CanonicalTask; fingerprint: TaskFingerprint } | null> {
    const fingerprint = DeterministicDedup.computeFingerprint(canonicalSummary, matterId, actionType, dueDateWindowStart);
    const existing = await this.registryRepo.findByFingerprint(fingerprint);

    if (existing) {
      return { match: existing, fingerprint };
    }

    return null;
  }
}
