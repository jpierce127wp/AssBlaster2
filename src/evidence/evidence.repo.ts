import type pg from 'pg';
import { getPool } from '../kernel/db.js';
import { idempotentInsert } from '../kernel/idempotency.js';
import type { EvidenceEvent, IngestRequest } from './evidence.types.js';
import type { EvidenceEventId, ProcessingState, PaginationParams, PaginatedResult } from '../kernel/types.js';

export class EvidenceRepo {
  private get pool(): pg.Pool {
    return getPool();
  }

  async insert(req: IngestRequest): Promise<{ id: EvidenceEventId; isNew: boolean }> {
    const columns = [
      'idempotency_key', 'source_type', 'raw_text', 'source_metadata',
      'participants', 'privilege_flags', 'matter_hints', 'contact_hints',
      'source_external_id', 'source_thread_id', 'language', 'source_timestamp',
    ];
    const values = [
      req.idempotency_key,
      req.source_type,
      req.raw_text,
      JSON.stringify(req.source_metadata),
      JSON.stringify(req.participants),
      JSON.stringify(req.privilege_flags),
      req.matter_hints,
      req.contact_hints,
      req.source_external_id || null,
      req.source_thread_id || null,
      req.language,
      req.source_timestamp || null,
    ];

    const result = await idempotentInsert(this.pool, 'evidence_events', req.idempotency_key, columns, values);
    return { id: result.id as EvidenceEventId, isNew: result.isNew };
  }

  async findById(id: EvidenceEventId): Promise<EvidenceEvent | null> {
    const result = await this.pool.query(
      'SELECT * FROM evidence_events WHERE id = $1',
      [id],
    );
    return (result.rows[0] as EvidenceEvent) ?? null;
  }

  async updateState(id: EvidenceEventId, state: ProcessingState, client?: pg.Pool | pg.PoolClient): Promise<void> {
    const db = client ?? this.pool;
    await db.query(
      'UPDATE evidence_events SET processing_state = $1, updated_at = NOW() WHERE id = $2',
      [state, id],
    );
  }

  async updateCleanedText(id: EvidenceEventId, cleanedText: string, metadata: Record<string, unknown>, participants: Array<{ name: string; role?: string }>, matterHints: string[], contactHints: string[]): Promise<void> {
    await this.pool.query(
      `UPDATE evidence_events
       SET cleaned_text = $1,
           source_metadata = source_metadata || $2::jsonb,
           participants = $3::jsonb,
           matter_hints = $4,
           contact_hints = $5,
           updated_at = NOW()
       WHERE id = $6`,
      [cleanedText, JSON.stringify(metadata), JSON.stringify(participants), matterHints, contactHints, id],
    );
  }

  async hasReachedTerminalState(idempotencyKey: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT processing_state FROM evidence_events WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    if (!result.rows[0]) return false;
    const state = result.rows[0].processing_state as ProcessingState;
    return state === 'decided' || state === 'failed';
  }

  async getState(id: EvidenceEventId): Promise<ProcessingState | null> {
    const result = await this.pool.query(
      'SELECT processing_state FROM evidence_events WHERE id = $1',
      [id],
    );
    if (!result.rows[0]) return null;
    return result.rows[0].processing_state as ProcessingState;
  }

  async findAll(pagination: PaginationParams): Promise<PaginatedResult<EvidenceEvent>> {
    const [countResult, dataResult] = await Promise.all([
      this.pool.query('SELECT COUNT(*) FROM evidence_events'),
      this.pool.query(
        'SELECT * FROM evidence_events ORDER BY received_at DESC LIMIT $1 OFFSET $2',
        [pagination.limit, pagination.offset],
      ),
    ]);

    return {
      items: dataResult.rows as EvidenceEvent[],
      total: parseInt(countResult.rows[0].count, 10),
      limit: pagination.limit,
      offset: pagination.offset,
    };
  }
}
