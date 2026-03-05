import { getPool } from '../lib/infra/db.js';

export interface RoutingRule {
  id: string;
  practice_area: string;
  action_type: string;
  assignee_user_id: string | null;
  assignee_role: string | null;
  priority: number;
}

export class RoutingRulesRepo {
  /**
   * Find the highest-priority active routing rule matching a practice area + action type.
   * Falls back to wildcard rules (practice_area = '*' or action_type = '*').
   */
  async findRule(practiceArea: string, actionType: string): Promise<RoutingRule | null> {
    const pool = getPool();
    const result = await pool.query<RoutingRule>(
      `SELECT id, practice_area, action_type, assignee_user_id, assignee_role, priority
       FROM routing_rules
       WHERE active = true
         AND (practice_area = $1 OR practice_area = '*')
         AND (action_type = $2 OR action_type = '*')
       ORDER BY
         CASE WHEN practice_area = '*' THEN 1 ELSE 0 END,
         CASE WHEN action_type = '*' THEN 1 ELSE 0 END,
         priority DESC
       LIMIT 1`,
      [practiceArea, actionType],
    );
    return result.rows[0] ?? null;
  }

  /** List all active routing rules */
  async listActive(): Promise<RoutingRule[]> {
    const pool = getPool();
    const result = await pool.query<RoutingRule>(
      `SELECT id, practice_area, action_type, assignee_user_id, assignee_role, priority
       FROM routing_rules
       WHERE active = true
       ORDER BY practice_area, action_type, priority DESC`,
    );
    return result.rows;
  }

  /** Create a routing rule */
  async create(rule: Omit<RoutingRule, 'id'>): Promise<RoutingRule> {
    const pool = getPool();
    const result = await pool.query<RoutingRule>(
      `INSERT INTO routing_rules (practice_area, action_type, assignee_user_id, assignee_role, priority)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, practice_area, action_type, assignee_user_id, assignee_role, priority`,
      [rule.practice_area, rule.action_type, rule.assignee_user_id, rule.assignee_role, rule.priority],
    );
    return result.rows[0]!;
  }

  /** Deactivate a routing rule */
  async deactivate(id: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE routing_rules SET active = false, updated_at = NOW() WHERE id = $1`,
      [id],
    );
  }
}
