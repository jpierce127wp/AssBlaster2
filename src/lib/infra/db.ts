import pg from 'pg';
import { getLogger } from '../../observability/logger.js';

const { Pool } = pg;

let _pool: pg.Pool | null = null;

export function createPool(databaseUrl: string): pg.Pool {
  if (_pool) return _pool;

  _pool = new Pool({
    connectionString: databaseUrl,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  _pool.on('error', (err) => {
    getLogger().error({ err }, 'Unexpected pool error');
  });

  return _pool;
}

export function getPool(): pg.Pool {
  if (!_pool) {
    throw new Error('Database pool not initialized. Call createPool() first.');
  }
  return _pool;
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

/** Run a function within a transaction */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
