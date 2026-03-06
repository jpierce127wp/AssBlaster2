import 'dotenv/config';
import { loadConfig } from './app/config.js';
import { createLogger } from './observability/logger.js';
import { createPool, closePool } from './lib/infra/db.js';
import { createRedis, closeRedis } from './lib/infra/redis.js';
import { closeQueues } from './lib/infra/queue.js';
import { createEmbeddingProvider } from './lib/infra/embedding.js';
import { startServer } from './server.js';
import { startWorkers } from './workers.js';

async function runMigrations(databaseUrl: string): Promise<void> {
  // Dynamic import of migrate script
  const { default: fs } = await import('node:fs');
  const { default: path } = await import('node:path');
  const { default: pg } = await import('pg');
  const { Pool } = pg;

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const applied = await pool.query('SELECT name FROM _migrations ORDER BY name');
    const appliedSet = new Set(applied.rows.map((r: { name: string }) => r.name));

    // Find migrations directory — works in both src (dev) and dist (prod)
    let migrationsDir = path.resolve(import.meta.dirname, '..', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      migrationsDir = path.resolve(import.meta.dirname, '..', '..', 'migrations');
    }

    const files = fs.readdirSync(migrationsDir)
      .filter((f: string) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await pool.query('COMMIT');
        console.log(`  applied: ${file}`);
      } catch (err) {
        await pool.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err}`);
      }
    }
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  logger.info({ role: config.processRole }, 'Starting TaskMaster2');

  // Migrator role: run migrations and exit
  if (config.processRole === 'migrator') {
    logger.info('Running migrations...');
    await runMigrations(config.databaseUrl);
    logger.info('Migrations complete, exiting');
    process.exit(0);
  }

  // Initialize infrastructure
  createPool(config.databaseUrl);
  createRedis(config.redisUrl);
  createEmbeddingProvider({
    provider: config.embeddingProvider,
    voyageApiKey: config.voyageApiKey,
    openaiApiKey: config.openaiApiKey,
    model: config.embeddingModel,
    dimensions: config.embeddingDimensions,
  });

  // Start based on role
  let app: Awaited<ReturnType<typeof startServer>> | null = null;
  let workers: Awaited<ReturnType<typeof startWorkers>> | null = null;

  if (config.processRole === 'api' || config.processRole === 'both') {
    app = await startServer();
  }

  if (config.processRole === 'worker' || config.processRole === 'both') {
    workers = await startWorkers();
  }

  // Graceful shutdown — drain in-flight work before closing infrastructure
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return; // Prevent double-shutdown
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down...');

    // 1. Stop accepting new HTTP requests
    if (app) {
      try { await app.close(); } catch (err) { logger.error({ err }, 'Error closing server'); }
    }

    // 2. Close BullMQ workers (drains in-flight jobs)
    if (workers) {
      await Promise.allSettled(workers.map((w) => w.close()));
    }

    // 3. Close infrastructure
    await closeQueues();
    await closeRedis();
    await closePool();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — shutting down');
    shutdown('uncaughtException').finally(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection — shutting down');
    shutdown('unhandledRejection').finally(() => process.exit(1));
  });

  logger.info({ role: config.processRole }, 'TaskMaster2 ready');
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
