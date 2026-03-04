import type pg from 'pg';
import { getPool } from '../lib/infra/db.js';
import type { CanonicalTaskFieldConfidence } from './registry.types.js';
import type { CanonicalTaskId } from '../domain/types.js';

export class FieldConfidenceRepo {
  private get pool(): pg.Pool {
    return getPool();
  }

  async upsert(entry: {
    canonicalTaskId: CanonicalTaskId;
    fieldName: string;
    confidence: number;
    source: string;
  }, client?: pg.Pool | pg.PoolClient): Promise<void> {
    const db = client ?? this.pool;
    await db.query(
      `INSERT INTO canonical_task_field_confidence
        (canonical_task_id, field_name, confidence, source)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (canonical_task_id, field_name) DO UPDATE SET
         confidence = EXCLUDED.confidence,
         source = EXCLUDED.source,
         updated_at = NOW()`,
      [entry.canonicalTaskId, entry.fieldName, entry.confidence, entry.source],
    );
  }

  async findByTask(taskId: CanonicalTaskId): Promise<CanonicalTaskFieldConfidence[]> {
    const result = await this.pool.query(
      'SELECT * FROM canonical_task_field_confidence WHERE canonical_task_id = $1',
      [taskId],
    );
    return result.rows as CanonicalTaskFieldConfidence[];
  }

  async deleteByTask(taskId: CanonicalTaskId, client?: pg.Pool | pg.PoolClient): Promise<void> {
    const db = client ?? this.pool;
    await db.query(
      'DELETE FROM canonical_task_field_confidence WHERE canonical_task_id = $1',
      [taskId],
    );
  }
}
