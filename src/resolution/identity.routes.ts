import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../lib/infra/db.js';
import { NotFoundError, ValidationError } from '../domain/errors.js';

const MATTER_FIELDS = new Set(['display_name', 'client_name', 'practice_area', 'status', 'clio_matter_id', 'aliases']);
const USER_FIELDS = new Set(['display_name', 'email', 'role', 'department', 'active', 'clio_user_id', 'aliases']);

function buildUpdateQuery(
  table: string,
  id: string,
  fields: Record<string, unknown>,
  allowedFields: Set<string>,
): { sql: string; values: unknown[] } {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && allowedFields.has(key)) {
      setClauses.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }
  }

  if (setClauses.length === 0) {
    throw new ValidationError('No valid fields to update');
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  return {
    sql: `UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  };
}

export async function identityRoutes(app: FastifyInstance): Promise<void> {
  const pool = () => getPool();

  // ── Matter Registry ────────────────────────────────────────────────

  /** GET /api/v1/matters — List all matters */
  app.get('/matters', async (_request: FastifyRequest, reply: FastifyReply) => {
    const result = await pool().query(
      `SELECT id, matter_ref, display_name, client_name, practice_area, status, clio_matter_id, aliases, created_at
       FROM matter_registry ORDER BY display_name`,
    );
    return reply.send({ items: result.rows, total: result.rows.length });
  });

  /** POST /api/v1/matters — Create a matter */
  app.post('/matters', async (request: FastifyRequest<{
    Body: { matter_ref: string; display_name: string; client_name?: string; practice_area?: string; clio_matter_id?: number; aliases?: string[] };
  }>, reply: FastifyReply) => {
    const { matter_ref, display_name, client_name, practice_area, clio_matter_id, aliases } = request.body;
    const result = await pool().query(
      `INSERT INTO matter_registry (matter_ref, display_name, client_name, practice_area, clio_matter_id, aliases)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [matter_ref, display_name, client_name ?? null, practice_area ?? null, clio_matter_id ?? null, aliases ?? []],
    );
    return reply.status(201).send(result.rows[0]);
  });

  /** PATCH /api/v1/matters/:id — Update a matter */
  app.patch('/matters/:id', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { display_name?: string; client_name?: string; practice_area?: string; status?: string; clio_matter_id?: number; aliases?: string[] };
  }>, reply: FastifyReply) => {
    const { sql, values } = buildUpdateQuery('matter_registry', request.params.id, request.body, MATTER_FIELDS);
    const result = await pool().query(sql, values);
    if (result.rows.length === 0) throw new NotFoundError('Matter', request.params.id);
    return reply.send(result.rows[0]);
  });

  // ── User Registry ──────────────────────────────────────────────────

  /** GET /api/v1/users — List all users */
  app.get('/users', async (_request: FastifyRequest, reply: FastifyReply) => {
    const result = await pool().query(
      `SELECT id, user_ref, display_name, email, role, department, clio_user_id, aliases, active, created_at
       FROM user_registry ORDER BY display_name`,
    );
    return reply.send({ items: result.rows, total: result.rows.length });
  });

  /** POST /api/v1/users — Create a user */
  app.post('/users', async (request: FastifyRequest<{
    Body: { user_ref: string; display_name: string; email?: string; role?: string; department?: string; clio_user_id?: number; aliases?: string[] };
  }>, reply: FastifyReply) => {
    const { user_ref, display_name, email, role, department, clio_user_id, aliases } = request.body;
    const result = await pool().query(
      `INSERT INTO user_registry (user_ref, display_name, email, role, department, clio_user_id, aliases)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [user_ref, display_name, email ?? null, role ?? null, department ?? null, clio_user_id ?? null, aliases ?? []],
    );
    return reply.status(201).send(result.rows[0]);
  });

  /** PATCH /api/v1/users/:id — Update a user */
  app.patch('/users/:id', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { display_name?: string; email?: string; role?: string; department?: string; active?: boolean; clio_user_id?: number; aliases?: string[] };
  }>, reply: FastifyReply) => {
    const { sql, values } = buildUpdateQuery('user_registry', request.params.id, request.body, USER_FIELDS);
    const result = await pool().query(sql, values);
    if (result.rows.length === 0) throw new NotFoundError('User', request.params.id);
    return reply.send(result.rows[0]);
  });
}
