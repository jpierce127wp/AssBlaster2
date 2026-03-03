import { getPool } from '../kernel/db.js';
import { getRedis } from '../kernel/redis.js';
import type pg from 'pg';
import type { IdentityResolutionTier } from './identity.types.js';

const CACHE_TTL = 3600; // 1 hour

export interface MatterResolution {
  matterId: string;
  tier: IdentityResolutionTier;
}

export class IdentityRepo {
  private get pool(): pg.Pool {
    return getPool();
  }

  /**
   * Resolve matter using 6-tier priority chain.
   * Returns the first successful match with its resolution tier.
   */
  async resolveMatter(
    reference: string,
    contactHints: string[],
    participantNames: string[],
  ): Promise<MatterResolution | null> {
    const redis = getRedis();
    const cacheKey = `identity:matter:${reference.toLowerCase()}`;

    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as MatterResolution;
    }

    // Tier 1: Explicit matter ID / case number (exact match)
    const tier1 = await this.resolveMatterExact(reference);
    if (tier1) {
      const result: MatterResolution = { matterId: tier1, tier: 1 };
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
      return result;
    }

    // Tier 2: Explicit contact/client reference
    for (const contactHint of contactHints) {
      const tier2 = await this.resolveMatterByContact(contactHint);
      if (tier2) {
        const result: MatterResolution = { matterId: tier2, tier: 2 };
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
        return result;
      }
    }

    // Tier 3: Known source-to-contact link (skip if no hints — requires external mapping)
    // Tier 4: Participant and thread history
    for (const name of participantNames) {
      const tier4 = await this.resolveMatterByParticipant(name);
      if (tier4) {
        const result: MatterResolution = { matterId: tier4, tier: 4 };
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
        return result;
      }
    }

    // Tier 5: Semantic matter hints (ILIKE fuzzy match)
    const tier5 = await this.resolveMatterSemantic(reference);
    if (tier5) {
      const result: MatterResolution = { matterId: tier5, tier: 5 };
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
      return result;
    }

    // Tier 6: Unresolved
    return null;
  }

  /** Tier 1: Exact match on matter_id */
  async resolveMatterExact(id: string): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT matter_id FROM canonical_tasks
       WHERE LOWER(matter_id) = LOWER($1) LIMIT 1`,
      [id],
    );
    return result.rows.length > 0 ? (result.rows[0].matter_id as string) : null;
  }

  /** Tier 2: Look up matters linked to a contact name */
  async resolveMatterByContact(contactHint: string): Promise<string | null> {
    // Search evidence events with matching contact hints that led to canonical tasks
    const result = await this.pool.query(
      `SELECT ct.matter_id FROM canonical_tasks ct
       JOIN task_evidence_links tel ON tel.canonical_task_id = ct.id
       JOIN evidence_events ee ON ee.id = tel.evidence_event_id
       WHERE ee.contact_hints @> ARRAY[$1]::text[]
         AND ct.matter_id IS NOT NULL
       LIMIT 1`,
      [contactHint],
    );
    return result.rows.length > 0 ? (result.rows[0].matter_id as string) : null;
  }

  /** Tier 4: Look up matters by participant name from evidence history */
  async resolveMatterByParticipant(participantName: string): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT ct.matter_id FROM canonical_tasks ct
       JOIN task_evidence_links tel ON tel.canonical_task_id = ct.id
       JOIN evidence_events ee ON ee.id = tel.evidence_event_id
       WHERE ee.participants::text ILIKE $1
         AND ct.matter_id IS NOT NULL
       LIMIT 1`,
      [`%${participantName}%`],
    );
    return result.rows.length > 0 ? (result.rows[0].matter_id as string) : null;
  }

  /** Tier 5: Semantic matter hints (fuzzy ILIKE match — existing logic) */
  async resolveMatterSemantic(reference: string): Promise<string | null> {
    const result = await this.pool.query(
      `SELECT matter_id FROM canonical_tasks
       WHERE matter_id ILIKE $1 LIMIT 1`,
      [`%${reference}%`],
    );
    return result.rows.length > 0 ? (result.rows[0].matter_id as string) : null;
  }

  /** Look up an assignee by name, checking cache first */
  async resolveAssignee(name: string): Promise<{ userId: string; assigneeName: string } | null> {
    const redis = getRedis();
    const cacheKey = `identity:assignee:${name.toLowerCase()}`;

    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Check canonical_tasks for existing assignee references
    const result = await this.pool.query(
      `SELECT assignee_user_id, assignee_role FROM canonical_tasks
       WHERE assignee_role ILIKE $1 AND assignee_user_id IS NOT NULL
       LIMIT 1`,
      [`%${name}%`],
    );

    if (result.rows.length > 0) {
      const resolved = {
        userId: result.rows[0].assignee_user_id as string,
        assigneeName: name,
      };
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(resolved));
      return resolved;
    }

    // No match found
    return null;
  }

  /** Cache a resolved identity */
  async cacheIdentity(type: 'matter' | 'assignee', key: string, value: unknown): Promise<void> {
    const redis = getRedis();
    const cacheKey = `identity:${type}:${key.toLowerCase()}`;
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(value));
  }
}
