import type pg from 'pg';
import { getPool } from '../lib/infra/db.js';
import type { ActionSpanRow } from './extraction.types.js';
import type { ActionSpanId, EvidenceEventId } from '../domain/types.js';

export class ActionSpanRepo {
  private get pool(): pg.Pool {
    return getPool();
  }

  async insert(span: {
    evidenceEventId: EvidenceEventId;
    text: string;
    startOffset: number;
    endOffset: number;
    signalType: string;
    extractedAction: string | null;
    extractedObject: string | null;
    extractedAssigneeName: string | null;
    extractedDueText: string | null;
    confidence: number;
  }, client?: pg.Pool | pg.PoolClient): Promise<ActionSpanId> {
    const db = client ?? this.pool;
    const result = await db.query(
      `INSERT INTO action_spans
        (evidence_event_id, text, start_offset, end_offset, signal_type,
         extracted_action, extracted_object, extracted_assignee_name,
         extracted_due_text, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        span.evidenceEventId,
        span.text,
        span.startOffset,
        span.endOffset,
        span.signalType,
        span.extractedAction,
        span.extractedObject,
        span.extractedAssigneeName,
        span.extractedDueText,
        span.confidence,
      ],
    );
    return result.rows[0].id as ActionSpanId;
  }

  async findByEvidenceId(evidenceEventId: EvidenceEventId): Promise<ActionSpanRow[]> {
    const result = await this.pool.query(
      'SELECT * FROM action_spans WHERE evidence_event_id = $1 ORDER BY start_offset',
      [evidenceEventId],
    );
    return result.rows as ActionSpanRow[];
  }

  async findById(id: ActionSpanId): Promise<ActionSpanRow | null> {
    const result = await this.pool.query(
      'SELECT * FROM action_spans WHERE id = $1',
      [id],
    );
    return (result.rows[0] as ActionSpanRow) ?? null;
  }
}
