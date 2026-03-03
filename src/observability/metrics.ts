import { getPool } from '../kernel/db.js';
import { getRedis } from '../kernel/redis.js';

export interface SystemMetrics {
  timestamp: string;
  db: {
    pool_total: number;
    pool_idle: number;
    pool_waiting: number;
  };
  redis: {
    connected: boolean;
  };
  pipeline: {
    evidence_total: number;
    evidence_by_state: Record<string, number>;
    tasks_total: number;
    reviews_open: number;
    sync_conflicts: number;
  };
}

export async function collectMetrics(): Promise<SystemMetrics> {
  const pool = getPool();
  const redis = getRedis();

  // DB pool stats
  const dbStats = {
    pool_total: pool.totalCount,
    pool_idle: pool.idleCount,
    pool_waiting: pool.waitingCount,
  };

  // Redis connectivity
  let redisConnected = false;
  try {
    await redis.ping();
    redisConnected = true;
  } catch {
    // not connected
  }

  // Pipeline stats
  const [evidenceTotal, evidenceByState, tasksTotal, reviewsOpen, syncConflicts] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM evidence_events'),
    pool.query('SELECT processing_state, COUNT(*) as count FROM evidence_events GROUP BY processing_state'),
    pool.query('SELECT COUNT(*) FROM canonical_tasks'),
    pool.query("SELECT COUNT(*) FROM review_queue WHERE status = 'open'"),
    pool.query("SELECT COUNT(*) FROM clio_task_links WHERE sync_status = 'conflict'"),
  ]);

  const stateCounts: Record<string, number> = {};
  for (const row of evidenceByState.rows) {
    stateCounts[row.processing_state as string] = parseInt(row.count as string, 10);
  }

  return {
    timestamp: new Date().toISOString(),
    db: dbStats,
    redis: { connected: redisConnected },
    pipeline: {
      evidence_total: parseInt(evidenceTotal.rows[0].count, 10),
      evidence_by_state: stateCounts,
      tasks_total: parseInt(tasksTotal.rows[0].count, 10),
      reviews_open: parseInt(reviewsOpen.rows[0].count, 10),
      sync_conflicts: parseInt(syncConflicts.rows[0].count, 10),
    },
  };
}
