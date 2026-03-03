import { getPool } from '../kernel/db.js';
import { getRedis } from '../kernel/redis.js';
import type pg from 'pg';

const CACHE_TTL = 3600; // 1 hour

export class IdentityRepo {
  private get pool(): pg.Pool {
    return getPool();
  }

  /** Look up a matter by name/reference, checking cache first */
  async resolveMatter(reference: string): Promise<{ matterId: string } | null> {
    const redis = getRedis();
    const cacheKey = `identity:matter:${reference.toLowerCase()}`;

    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Check canonical_tasks for existing matter references
    const result = await this.pool.query(
      `SELECT matter_id FROM canonical_tasks
       WHERE matter_id ILIKE $1 LIMIT 1`,
      [`%${reference}%`],
    );

    if (result.rows.length > 0) {
      const resolved = {
        matterId: result.rows[0].matter_id as string,
      };
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(resolved));
      return resolved;
    }

    return null;
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
