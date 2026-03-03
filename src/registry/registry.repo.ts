import { getPool } from '../kernel/db.js';
import type pg from 'pg';
import type { CanonicalTask, TaskEvidenceLink, CreateTaskInput, UpdateTaskInput, TaskFingerprint } from './registry.types.js';
import type { CanonicalTaskId, PaginationParams, PaginatedResult } from '../kernel/types.js';

export class RegistryRepo {
  private get pool(): pg.Pool {
    return getPool();
  }

  async create(input: CreateTaskInput, client?: pg.Pool | pg.PoolClient): Promise<CanonicalTask> {
    const db = client ?? this.pool;
    const embeddingValue = input.summaryEmbedding
      ? `[${input.summaryEmbedding.join(',')}]`
      : null;

    const result = await db.query(
      `INSERT INTO canonical_tasks
        (canonical_summary, action_type, target_object, desired_outcome,
         assignee_user_id, assignee_role, priority, due_date_kind,
         due_date_window_start, due_date_window_end, matter_id,
         fingerprint, summary_embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::vector)
       RETURNING *`,
      [
        input.canonicalSummary,
        input.actionType ?? 'other',
        input.targetObject ?? null,
        input.desiredOutcome ?? null,
        input.assigneeUserId ?? null,
        input.assigneeRole ?? null,
        input.priority ?? 'normal',
        input.dueDateKind ?? null,
        input.dueDateWindowStart ?? null,
        input.dueDateWindowEnd ?? null,
        input.matterId ?? null,
        input.fingerprint ? JSON.stringify(input.fingerprint) : null,
        embeddingValue,
      ],
    );

    return result.rows[0] as CanonicalTask;
  }

  async findById(id: CanonicalTaskId): Promise<CanonicalTask | null> {
    const result = await this.pool.query('SELECT * FROM canonical_tasks WHERE id = $1', [id]);
    return (result.rows[0] as CanonicalTask) ?? null;
  }

  async findByFingerprint(fingerprint: TaskFingerprint): Promise<CanonicalTask | null> {
    const result = await this.pool.query(
      `SELECT * FROM canonical_tasks
       WHERE fingerprint @> $1::jsonb
       LIMIT 1`,
      [JSON.stringify(fingerprint)],
    );
    return (result.rows[0] as CanonicalTask) ?? null;
  }

  async findSimilarByEmbedding(
    embedding: number[],
    matterId: string | null,
    limit: number = 5,
    threshold: number = 0.70,
  ): Promise<Array<CanonicalTask & { similarity: number }>> {
    const embeddingStr = `[${embedding.join(',')}]`;

    const matterClause = matterId ? 'AND matter_id = $3' : '';
    const params: unknown[] = [embeddingStr, limit];
    if (matterId) params.push(matterId);

    const result = await this.pool.query(
      `SELECT *,
        1 - (summary_embedding <=> $1::vector) as similarity
       FROM canonical_tasks
       WHERE summary_embedding IS NOT NULL
         ${matterClause}
       ORDER BY summary_embedding <=> $1::vector
       LIMIT $2`,
      params,
    );

    return (result.rows as Array<CanonicalTask & { similarity: number }>)
      .filter((r) => r.similarity >= threshold);
  }

  async update(id: CanonicalTaskId, input: UpdateTaskInput, client?: pg.Pool | pg.PoolClient): Promise<CanonicalTask> {
    const db = client ?? this.pool;
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIdx = 1;

    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        setClauses.push(`${key} = $${paramIdx}`);
        values.push(value);
        paramIdx++;
      }
    }

    values.push(id);
    const result = await db.query(
      `UPDATE canonical_tasks SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values,
    );

    return result.rows[0] as CanonicalTask;
  }

  async incrementEvidenceCount(id: CanonicalTaskId, client?: pg.Pool | pg.PoolClient): Promise<void> {
    const db = client ?? this.pool;
    await db.query(
      'UPDATE canonical_tasks SET open_evidence_count = open_evidence_count + 1, last_evidence_at = NOW(), updated_at = NOW() WHERE id = $1',
      [id],
    );
  }

  async addTaskEvidenceLink(entry: {
    canonicalTaskId: CanonicalTaskId;
    evidenceEventId: string;
    actionSpanId: string | null;
    relationType: string;
    changeImpact: string;
    impactedFields: string[];
    rationale: string | null;
  }, client?: pg.Pool | pg.PoolClient): Promise<void> {
    const db = client ?? this.pool;
    await db.query(
      `INSERT INTO task_evidence_links
        (canonical_task_id, evidence_event_id, action_span_id, relation_type, change_impact, impacted_fields, rationale)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (canonical_task_id, evidence_event_id) DO UPDATE SET
         relation_type = EXCLUDED.relation_type,
         change_impact = EXCLUDED.change_impact,
         impacted_fields = EXCLUDED.impacted_fields,
         rationale = EXCLUDED.rationale`,
      [
        entry.canonicalTaskId,
        entry.evidenceEventId,
        entry.actionSpanId,
        entry.relationType,
        entry.changeImpact,
        entry.impactedFields,
        entry.rationale,
      ],
    );
  }

  async getTaskEvidenceLinks(taskId: CanonicalTaskId): Promise<TaskEvidenceLink[]> {
    const result = await this.pool.query(
      'SELECT * FROM task_evidence_links WHERE canonical_task_id = $1 ORDER BY created_at DESC',
      [taskId],
    );
    return result.rows as TaskEvidenceLink[];
  }

  /**
   * Find an open canonical task with the same matter and action type that has an assignee.
   * Used by assignment Tier 3 (existing owner).
   */
  async findAssignedTaskByMatterAndAction(
    matterId: string,
    actionType: string,
  ): Promise<Pick<CanonicalTask, 'assignee_user_id' | 'assignee_role'> | null> {
    const result = await this.pool.query(
      `SELECT assignee_user_id, assignee_role FROM canonical_tasks
       WHERE matter_id = $1
         AND action_type = $2
         AND assignee_user_id IS NOT NULL
         AND status NOT IN ('complete', 'superseded', 'discarded')
       ORDER BY updated_at DESC
       LIMIT 1`,
      [matterId, actionType],
    );
    return (result.rows[0] as Pick<CanonicalTask, 'assignee_user_id' | 'assignee_role'>) ?? null;
  }

  /**
   * Find the most frequent assignee for a given matter (matter owner).
   * Used by assignment Tier 4.
   */
  async findMatterOwner(
    matterId: string,
  ): Promise<Pick<CanonicalTask, 'assignee_user_id' | 'assignee_role'> | null> {
    const result = await this.pool.query(
      `SELECT assignee_user_id, assignee_role, COUNT(*) as cnt
       FROM canonical_tasks
       WHERE matter_id = $1
         AND assignee_user_id IS NOT NULL
       GROUP BY assignee_user_id, assignee_role
       ORDER BY cnt DESC
       LIMIT 1`,
      [matterId],
    );
    return (result.rows[0] as Pick<CanonicalTask, 'assignee_user_id' | 'assignee_role'>) ?? null;
  }

  async findAll(pagination: PaginationParams): Promise<PaginatedResult<CanonicalTask>> {
    const [countResult, dataResult] = await Promise.all([
      this.pool.query('SELECT COUNT(*) FROM canonical_tasks'),
      this.pool.query(
        'SELECT * FROM canonical_tasks ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [pagination.limit, pagination.offset],
      ),
    ]);

    return {
      items: dataResult.rows as CanonicalTask[],
      total: parseInt(countResult.rows[0].count, 10),
      limit: pagination.limit,
      offset: pagination.offset,
    };
  }

  async findOpen(pagination: PaginationParams): Promise<PaginatedResult<CanonicalTask>> {
    const [countResult, dataResult] = await Promise.all([
      this.pool.query(
        `SELECT COUNT(*) FROM canonical_tasks WHERE status NOT IN ('complete', 'superseded', 'discarded')`,
      ),
      this.pool.query(
        `SELECT * FROM canonical_tasks
         WHERE status NOT IN ('complete', 'superseded', 'discarded')
         ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [pagination.limit, pagination.offset],
      ),
    ]);

    return {
      items: dataResult.rows as CanonicalTask[],
      total: parseInt(countResult.rows[0].count, 10),
      limit: pagination.limit,
      offset: pagination.offset,
    };
  }
}
