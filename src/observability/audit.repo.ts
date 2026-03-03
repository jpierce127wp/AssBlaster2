import { getPool } from '../kernel/db.js';
import type pg from 'pg';
import type { AuditAction, AuditActorType } from '../kernel/types.js';

export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: AuditAction;
  actorType?: AuditActorType;
  actorId?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export class AuditRepo {
  private get pool(): pg.Pool {
    return getPool();
  }

  async log(entry: AuditEntry, client?: pg.Pool | pg.PoolClient): Promise<void> {
    const db = client ?? this.pool;
    await db.query(
      `INSERT INTO audit_log (entity_type, entity_id, action, actor_type, actor_id, summary, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.entityType,
        entry.entityId,
        entry.action,
        entry.actorType ?? 'system',
        entry.actorId ?? 'system',
        entry.summary ?? null,
        JSON.stringify(entry.metadata ?? {}),
      ],
    );
  }

  async findByEntity(entityType: string, entityId: string, limit: number = 100): Promise<AuditEntry[]> {
    const result = await this.pool.query(
      'SELECT * FROM audit_log WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC LIMIT $3',
      [entityType, entityId, limit],
    );
    return result.rows;
  }

  async findByAction(action: string, limit: number = 100): Promise<AuditEntry[]> {
    const result = await this.pool.query(
      'SELECT * FROM audit_log WHERE action = $1 ORDER BY created_at DESC LIMIT $2',
      [action, limit],
    );
    return result.rows;
  }
}
