/**
 * Vitest globalSetup hook for integration tests.
 * Runs migrations against the test database before any test file executes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function setup() {
  // Load .env since globalSetup runs in its own context
  dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL environment variable required for integration tests.\n' +
      'Ensure Postgres (with pgvector) is running and DATABASE_URL is set.',
    );
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Ensure migrations tracking table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get already-applied migrations
    const applied = await pool.query('SELECT name FROM _migrations ORDER BY name');
    const appliedSet = new Set(applied.rows.map((r: { name: string }) => r.name));

    // Read and apply migration files
    const migrationsDir = path.resolve(__dirname, '..', '..', '..', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      console.log(`  [integration] apply: ${file}`);

      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await pool.query('COMMIT');
      } catch (err) {
        await pool.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err}`);
      }
    }

    console.log('[integration] Migrations complete');
  } finally {
    await pool.end();
  }
}

export async function teardown() {
  // Pool was closed in setup — nothing to clean up
}
