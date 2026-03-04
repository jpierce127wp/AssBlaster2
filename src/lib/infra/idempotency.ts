import type pg from 'pg';
import { IdempotencyConflictError } from '../../domain/errors.js';

/**
 * Insert a row with idempotency key handling.
 * Uses INSERT ... ON CONFLICT (idempotency_key) DO NOTHING.
 * Returns the existing row ID if duplicate, or the new row ID.
 */
export async function idempotentInsert(
  client: pg.Pool | pg.PoolClient,
  table: string,
  idempotencyKey: string,
  columns: string[],
  values: unknown[],
): Promise<{ id: string; isNew: boolean }> {
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const columnList = columns.join(', ');

  const insertQuery = `
    INSERT INTO ${table} (${columnList})
    VALUES (${placeholders})
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id
  `;

  const result = await client.query(insertQuery, values);

  if (result.rows.length > 0) {
    return { id: result.rows[0].id as string, isNew: true };
  }

  // Row already exists — fetch it
  const existingResult = await client.query(
    `SELECT id FROM ${table} WHERE idempotency_key = $1`,
    [idempotencyKey],
  );

  if (existingResult.rows.length > 0) {
    return { id: existingResult.rows[0].id as string, isNew: false };
  }

  throw new IdempotencyConflictError(idempotencyKey);
}
