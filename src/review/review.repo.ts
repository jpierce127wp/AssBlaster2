import { getPool } from '../kernel/db.js';
import type pg from 'pg';
import type { ReviewItem, ReviewDecision } from './review.types.js';
import type { CandidateTaskId, ReviewReason, PaginationParams, PaginatedResult } from '../kernel/types.js';

export class ReviewRepo {
  private get pool(): pg.Pool {
    return getPool();
  }

  async create(input: {
    candidateTaskId: CandidateTaskId;
    reason: ReviewReason;
    priority?: number;
  }): Promise<ReviewItem> {
    const result = await this.pool.query(
      `INSERT INTO review_queue (candidate_task_id, reason, priority)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.candidateTaskId, input.reason, input.priority ?? 0],
    );
    return result.rows[0] as ReviewItem;
  }

  async findById(id: string): Promise<ReviewItem | null> {
    const result = await this.pool.query('SELECT * FROM review_queue WHERE id = $1', [id]);
    return (result.rows[0] as ReviewItem) ?? null;
  }

  async findOpen(pagination: PaginationParams): Promise<PaginatedResult<ReviewItem>> {
    const [countResult, dataResult] = await Promise.all([
      this.pool.query("SELECT COUNT(*) FROM review_queue WHERE status = 'open'"),
      this.pool.query(
        "SELECT * FROM review_queue WHERE status = 'open' ORDER BY priority DESC, created_at ASC LIMIT $1 OFFSET $2",
        [pagination.limit, pagination.offset],
      ),
    ]);

    return {
      items: dataResult.rows as ReviewItem[],
      total: parseInt(countResult.rows[0].count, 10),
      limit: pagination.limit,
      offset: pagination.offset,
    };
  }

  async decide(id: string, decision: ReviewDecision): Promise<ReviewItem> {
    const result = await this.pool.query(
      `UPDATE review_queue SET
        status = $1, decided_by = $2, decided_at = NOW(), updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [decision.status, decision.decided_by, id],
    );
    return result.rows[0] as ReviewItem;
  }
}
