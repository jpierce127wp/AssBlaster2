/**
 * Shared test utilities for integration tests.
 * Provides infrastructure initialization, table truncation, and data factories.
 */
import { createPool, getPool, closePool } from '../../../src/lib/infra/db.js';
import { createRedis, getRedis, closeRedis } from '../../../src/lib/infra/redis.js';
import { createEmbeddingProvider, getEmbeddingProvider } from '../../../src/lib/infra/embedding.js';
import { loadConfig, resetConfig } from '../../../src/app/config.js';
import type { IngestRequest } from '../../../src/domain/evidence.types.js';

/**
 * All tables to truncate between tests (order matters for CASCADE).
 */
const ALL_TABLES = [
  'clio_task_links',
  'merge_decisions',
  'task_evidence_links',
  'canonical_task_field_confidence',
  'review_queue',
  'candidate_tasks',
  'action_spans',
  'canonical_tasks',
  'evidence_events',
  'audit_log',
  'routing_rules',
  'matter_registry',
  'user_registry',
];

/**
 * Initialize infrastructure singletons (pool, redis, embedding provider).
 * Sets default env vars for stubbed external services.
 * Call once per test file in beforeAll.
 */
export async function initInfra() {
  // Set defaults for stubbed external services
  process.env.ANTHROPIC_API_KEY ??= 'test-key-not-used';
  process.env.API_KEY ??= 'test-api-key';
  process.env.VOYAGE_API_KEY ??= 'test-voyage-key-not-used';
  process.env.EMBEDDING_PROVIDER ??= 'voyage';
  process.env.LOG_LEVEL ??= 'fatal';

  // Reset and reload config
  resetConfig();
  const config = loadConfig();

  // Initialize singletons
  createPool(config.databaseUrl);
  createRedis(config.redisUrl);
  createEmbeddingProvider({
    provider: config.embeddingProvider,
    voyageApiKey: config.voyageApiKey,
    openaiApiKey: config.openaiApiKey,
    model: config.embeddingModel,
    dimensions: config.embeddingDimensions,
  });

  return {
    pool: getPool(),
    redis: getRedis(),
    embeddingProvider: getEmbeddingProvider(),
  };
}

/**
 * TRUNCATE all application tables in a single statement.
 * Call in beforeEach for test isolation.
 */
export async function truncateAll() {
  const pool = getPool();
  await pool.query(`TRUNCATE ${ALL_TABLES.join(', ')} CASCADE`);
}

/**
 * Clear Redis keys used by identity cache and distributed locks.
 * Call in beforeEach alongside truncateAll.
 */
export async function clearRedisKeys() {
  const redis = getRedis();
  const keys = await redis.keys('identity:*');
  const lockKeys = await redis.keys('lock:*');
  const allKeys = [...keys, ...lockKeys];
  if (allKeys.length > 0) {
    await redis.del(...allKeys);
  }
}

/**
 * Close pool and Redis connections.
 * Call in afterAll.
 */
export async function teardownInfra() {
  await closePool();
  await closeRedis();
}

// ── Data factory helpers ────────────────────────────────────────────

let _seq = 0;
function seq(): string {
  return String(++_seq).padStart(6, '0');
}

/** Reset factory sequence counter (call in beforeEach if needed). */
export function resetSeq() {
  _seq = 0;
}

/**
 * Insert an evidence_event row with sensible defaults.
 * Returns the generated UUID.
 */
export async function insertEvidence(overrides: Record<string, unknown> = {}): Promise<string> {
  const pool = getPool();
  const s = seq();
  const defaults: Record<string, unknown> = {
    idempotency_key: `test-idem-${s}`,
    source_type: 'phone',
    raw_text: 'Attorney Jones discussed filing the motion to compel in the Johnson matter by next Friday.',
    source_metadata: '{}',
    participants: JSON.stringify([{ name: 'Attorney Jones', role: 'attorney' }]),
    privilege_flags: '{}',
    matter_hints: '{Johnson}',
    contact_hints: '{Attorney Jones}',
    language: 'en',
  };
  const merged = { ...defaults, ...overrides };

  const result = await pool.query(
    `INSERT INTO evidence_events
       (idempotency_key, source_type, raw_text, source_metadata, participants,
        privilege_flags, matter_hints, contact_hints, language)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::text[], $8::text[], $9)
     RETURNING id`,
    [
      merged.idempotency_key,
      merged.source_type,
      merged.raw_text,
      merged.source_metadata,
      merged.participants,
      merged.privilege_flags,
      merged.matter_hints,
      merged.contact_hints,
      merged.language,
    ],
  );

  return result.rows[0].id as string;
}

/**
 * Insert a matter_registry row. Returns the generated UUID.
 */
export async function insertMatter(overrides: Record<string, unknown> = {}): Promise<string> {
  const pool = getPool();
  const s = seq();
  const defaults: Record<string, unknown> = {
    matter_ref: `matter-ref-${s}`,
    display_name: 'Johnson v. Smith',
    client_name: 'Johnson',
    practice_area: 'litigation',
    status: 'active',
    aliases: '{Johnson,johnson}',
  };
  const merged = { ...defaults, ...overrides };

  const result = await pool.query(
    `INSERT INTO matter_registry
       (matter_ref, display_name, client_name, practice_area, status, aliases)
     VALUES ($1, $2, $3, $4, $5, $6::text[])
     RETURNING id`,
    [
      merged.matter_ref,
      merged.display_name,
      merged.client_name,
      merged.practice_area,
      merged.status,
      merged.aliases,
    ],
  );

  return result.rows[0].id as string;
}

/**
 * Insert a user_registry row. Returns the generated UUID.
 */
export async function insertUser(overrides: Record<string, unknown> = {}): Promise<string> {
  const pool = getPool();
  const s = seq();
  const defaults: Record<string, unknown> = {
    user_ref: `user-ref-${s}`,
    display_name: 'Sarah Chen',
    email: `sarah.chen.${s}@example.com`,
    role: 'Associate',
    department: 'Litigation',
    active: true,
    aliases: '{}',
  };
  const merged = { ...defaults, ...overrides };

  const result = await pool.query(
    `INSERT INTO user_registry
       (user_ref, display_name, email, role, department, active, aliases)
     VALUES ($1, $2, $3, $4, $5, $6, $7::text[])
     RETURNING id`,
    [
      merged.user_ref,
      merged.display_name,
      merged.email,
      merged.role,
      merged.department,
      merged.active,
      merged.aliases,
    ],
  );

  return result.rows[0].id as string;
}

/**
 * Insert a routing_rules row. Returns the generated UUID.
 */
export async function insertRoutingRule(overrides: Record<string, unknown> = {}): Promise<string> {
  const pool = getPool();
  const defaults: Record<string, unknown> = {
    practice_area: '*',
    action_type: 'filing',
    assignee_user_id: null,
    assignee_role: 'Paralegal',
    priority: 0,
  };
  const merged = { ...defaults, ...overrides };

  const result = await pool.query(
    `INSERT INTO routing_rules
       (practice_area, action_type, assignee_user_id, assignee_role, priority)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      merged.practice_area,
      merged.action_type,
      merged.assignee_user_id,
      merged.assignee_role,
      merged.priority,
    ],
  );

  return result.rows[0].id as string;
}

/**
 * Directly query a table by ID. Convenience for assertions.
 */
export async function findRow(table: string, id: string): Promise<Record<string, unknown> | null> {
  const pool = getPool();
  const result = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
  return (result.rows[0] as Record<string, unknown>) ?? null;
}

/**
 * Count rows in a table, optionally with a WHERE clause.
 */
export async function countRows(table: string, where?: string, params?: unknown[]): Promise<number> {
  const pool = getPool();
  const sql = where
    ? `SELECT COUNT(*)::int AS cnt FROM ${table} WHERE ${where}`
    : `SELECT COUNT(*)::int AS cnt FROM ${table}`;
  const result = await pool.query(sql, params);
  return result.rows[0].cnt as number;
}

/**
 * Build a complete IngestRequest with sensible defaults.
 * All fields with schema defaults are provided so TypeScript is satisfied.
 */
export function makeIngestRequest(
  overrides: Partial<IngestRequest> & Pick<IngestRequest, 'idempotency_key' | 'source_type' | 'raw_text'>,
): IngestRequest {
  return {
    source_metadata: {},
    participants: [],
    privilege_flags: {},
    matter_hints: [],
    contact_hints: [],
    language: 'en',
    ...overrides,
  };
}
