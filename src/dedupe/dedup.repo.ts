import type pg from 'pg';
import { getPool } from '../lib/infra/db.js';
import type { MergeDecision } from './dedup.types.js';
import type { MergeDecisionId, CandidateTaskId, CanonicalTaskId, MergeOutcome } from '../domain/types.js';

export class MergeDecisionRepo {
  private get pool(): pg.Pool {
    return getPool();
  }

  async insert(decision: {
    candidateTaskId: CandidateTaskId;
    comparedCanonicalId: CanonicalTaskId | null;
    selectedCanonicalId: CanonicalTaskId | null;
    outcome: MergeOutcome;
    fingerprintScore: number | null;
    embeddingScore: number | null;
    adjudicationLabel: string | null;
    rationale: string | null;
    createdBy: string;
  }, client?: pg.Pool | pg.PoolClient): Promise<MergeDecisionId> {
    const db = client ?? this.pool;
    const result = await db.query(
      `INSERT INTO merge_decisions
        (candidate_task_id, compared_canonical_id, selected_canonical_id, outcome,
         fingerprint_score, embedding_score, adjudication_label, rationale, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        decision.candidateTaskId,
        decision.comparedCanonicalId,
        decision.selectedCanonicalId,
        decision.outcome,
        decision.fingerprintScore,
        decision.embeddingScore,
        decision.adjudicationLabel,
        decision.rationale,
        decision.createdBy,
      ],
    );
    return result.rows[0].id as MergeDecisionId;
  }

  async findByCandidateTask(candidateTaskId: CandidateTaskId): Promise<MergeDecision[]> {
    const result = await this.pool.query(
      'SELECT * FROM merge_decisions WHERE candidate_task_id = $1 ORDER BY created_at DESC',
      [candidateTaskId],
    );
    return result.rows as MergeDecision[];
  }
}
