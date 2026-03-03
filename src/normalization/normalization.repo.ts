import type pg from 'pg';
import { getPool } from '../kernel/db.js';
import type { CandidateTaskRow } from './normalization.types.js';
import type { CandidateTaskId, EvidenceEventId, ActionSpanId } from '../kernel/types.js';

export class CandidateTaskRepo {
  private get pool(): pg.Pool {
    return getPool();
  }

  async insert(task: {
    evidenceEventId: EvidenceEventId;
    actionSpanId: ActionSpanId | null;
    canonicalSummary: string;
    matterId: string | null;
    contactId: string | null;
    clientId: string | null;
    actionType: string;
    targetObject: string | null;
    desiredOutcome: string | null;
    assigneeName: string | null;
    assigneeUserId: string | null;
    assigneeResolutionKind: string | null;
    dueDateKind: string | null;
    dueDateWindowStart: string | null;
    dueDateWindowEnd: string | null;
    dueDateSourceText: string | null;
    priority: string;
    dependencyText: string | null;
    sourceAuthority: string;
    confidenceExtraction: number;
    confidenceNormalization: number;
    confidenceResolution: number;
  }, client?: pg.Pool | pg.PoolClient): Promise<CandidateTaskId> {
    const db = client ?? this.pool;
    const result = await db.query(
      `INSERT INTO candidate_tasks
        (evidence_event_id, action_span_id, canonical_summary, matter_id, contact_id, client_id,
         action_type, target_object, desired_outcome, assignee_name, assignee_user_id,
         assignee_resolution_kind, due_date_kind, due_date_window_start, due_date_window_end,
         due_date_source_text, priority, dependency_text, source_authority,
         confidence_extraction, confidence_normalization, confidence_resolution)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
       RETURNING id`,
      [
        task.evidenceEventId,
        task.actionSpanId,
        task.canonicalSummary,
        task.matterId,
        task.contactId,
        task.clientId,
        task.actionType,
        task.targetObject,
        task.desiredOutcome,
        task.assigneeName,
        task.assigneeUserId,
        task.assigneeResolutionKind,
        task.dueDateKind,
        task.dueDateWindowStart,
        task.dueDateWindowEnd,
        task.dueDateSourceText,
        task.priority,
        task.dependencyText,
        task.sourceAuthority,
        task.confidenceExtraction,
        task.confidenceNormalization,
        task.confidenceResolution,
      ],
    );
    return result.rows[0].id as CandidateTaskId;
  }

  async findById(id: CandidateTaskId): Promise<CandidateTaskRow | null> {
    const result = await this.pool.query(
      'SELECT * FROM candidate_tasks WHERE id = $1',
      [id],
    );
    return (result.rows[0] as CandidateTaskRow) ?? null;
  }

  async findByEvidenceId(evidenceEventId: EvidenceEventId): Promise<CandidateTaskRow[]> {
    const result = await this.pool.query(
      'SELECT * FROM candidate_tasks WHERE evidence_event_id = $1 ORDER BY created_at',
      [evidenceEventId],
    );
    return result.rows as CandidateTaskRow[];
  }

  async updateResolution(id: CandidateTaskId, fields: {
    matterId?: string | null;
    contactId?: string | null;
    clientId?: string | null;
    assigneeUserId?: string | null;
    assigneeResolutionKind?: string | null;
    confidenceResolution?: number;
  }, client?: pg.Pool | pg.PoolClient): Promise<void> {
    const db = client ?? this.pool;
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (fields.matterId !== undefined) {
      setClauses.push(`matter_id = $${paramIdx}`);
      values.push(fields.matterId);
      paramIdx++;
    }
    if (fields.contactId !== undefined) {
      setClauses.push(`contact_id = $${paramIdx}`);
      values.push(fields.contactId);
      paramIdx++;
    }
    if (fields.clientId !== undefined) {
      setClauses.push(`client_id = $${paramIdx}`);
      values.push(fields.clientId);
      paramIdx++;
    }
    if (fields.assigneeUserId !== undefined) {
      setClauses.push(`assignee_user_id = $${paramIdx}`);
      values.push(fields.assigneeUserId);
      paramIdx++;
    }
    if (fields.assigneeResolutionKind !== undefined) {
      setClauses.push(`assignee_resolution_kind = $${paramIdx}`);
      values.push(fields.assigneeResolutionKind);
      paramIdx++;
    }
    if (fields.confidenceResolution !== undefined) {
      setClauses.push(`confidence_resolution = $${paramIdx}`);
      values.push(fields.confidenceResolution);
      paramIdx++;
    }

    values.push(id);
    await db.query(
      `UPDATE candidate_tasks SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
      values,
    );
  }
}
