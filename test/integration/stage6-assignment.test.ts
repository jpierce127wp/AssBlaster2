/**
 * Integration tests for Stage 6: Assignment.
 * Tests AssignmentService.assign() against real Postgres.
 * No external API stubs — pure DB lookups.
 */
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// ── Module-level mocks ─────────────────────────────────────────────
vi.mock('../../src/lib/infra/queue.js', () => ({
  getQueue: () => ({ add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }) }),
  QUEUE_NAMES: {
    EVIDENCE_INGEST: 'evidence.ingest',
    EXTRACTION_EXTRACT: 'extraction.extract',
    NORMALIZATION_NORMALIZE: 'normalization.normalize',
    IDENTITY_RESOLVE: 'identity.resolve',
    DEDUP_CHECK: 'dedup.check',
    ASSIGNMENT_ASSIGN: 'assignment.assign',
    SYNC_PUSH: 'sync.push',
  },
}));

vi.mock('../../src/observability/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    trace: vi.fn(), fatal: vi.fn(), child: vi.fn().mockReturnThis(),
  }),
}));

// ── Imports ─────────────────────────────────────────────────────────
import { AssignmentService } from '../../src/assignment/assignment.service.js';
import { PipelineError } from '../../src/domain/errors.js';
import { getPool } from '../../src/lib/infra/db.js';
import {
  initInfra, truncateAll, clearRedisKeys, teardownInfra,
  insertEvidence, insertRoutingRule, countRows,
} from './setup/helpers.js';
import type { CanonicalTaskId } from '../../src/domain/types.js';

// ── Test suite ──────────────────────────────────────────────────────
describe('Stage 6: Assignment', () => {
  let assignmentService: AssignmentService;

  beforeAll(async () => {
    await initInfra();
    assignmentService = new AssignmentService();
  });

  afterAll(async () => {
    await teardownInfra();
  });

  beforeEach(async () => {
    await truncateAll();
    await clearRedisKeys();
    vi.clearAllMocks();
  });

  /**
   * Helper: directly insert a canonical task with specific fields.
   * Returns the canonical task ID.
   */
  async function insertCanonicalTask(fields: Record<string, unknown> = {}): Promise<string> {
    const pool = getPool();
    const defaults: Record<string, unknown> = {
      canonical_summary: 'File motion to compel',
      action_type: 'filing',
      status: 'proposed',
      priority: 'high',
      matter_id: null,
      assignee_user_id: null,
      assignee_role: null,
    };
    const merged = { ...defaults, ...fields };

    const result = await pool.query(
      `INSERT INTO canonical_tasks
         (canonical_summary, action_type, status, priority, matter_id,
          assignee_user_id, assignee_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        merged.canonical_summary,
        merged.action_type,
        merged.status,
        merged.priority,
        merged.matter_id,
        merged.assignee_user_id,
        merged.assignee_role,
      ],
    );

    return result.rows[0].id as string;
  }

  it('Tier 1: returns explicit when task has assignee_user_id', async () => {
    const taskId = await insertCanonicalTask({
      assignee_user_id: 'user-jones-001',
      assignee_role: 'Attorney Jones',
    });

    const result = await assignmentService.assign(taskId as CanonicalTaskId);

    expect(result.method).toBe('explicit');
    expect(result.assignee_user_id).toBe('user-jones-001');
    expect(result.assignee_role).toBe('Attorney Jones');
  });

  it('Tier 2: returns role when task has assignee_role but no user_id', async () => {
    const taskId = await insertCanonicalTask({
      assignee_role: 'Senior Associate',
    });

    const result = await assignmentService.assign(taskId as CanonicalTaskId);

    expect(result.method).toBe('role');
    expect(result.assignee_user_id).toBeNull();
    expect(result.assignee_role).toBe('Senior Associate');
  });

  it('Tier 5: falls through to routing rule match', async () => {
    // Insert a routing rule for filing tasks
    await insertRoutingRule({
      practice_area: '*',
      action_type: 'filing',
      assignee_user_id: 'user-paralegal-001',
      assignee_role: 'Paralegal',
      priority: 10,
    });

    const taskId = await insertCanonicalTask({
      matter_id: 'some-matter',
      action_type: 'filing',
      // No assignee_user_id, no assignee_role
    });

    const result = await assignmentService.assign(taskId as CanonicalTaskId);

    expect(result.method).toBe('rule');
    expect(result.assignee_user_id).toBe('user-paralegal-001');
    expect(result.assignee_role).toBe('Paralegal');
  });

  it('Tier 6: routes to triage when no match at any tier', async () => {
    const taskId = await insertCanonicalTask({
      action_type: 'research', // No routing rule for this
      matter_id: 'unknown-matter',
    });

    const result = await assignmentService.assign(taskId as CanonicalTaskId);

    expect(result.method).toBe('triage');
    expect(result.assignee_user_id).toBeNull();
    expect(result.assignee_role).toBeNull();
  });

  it('routes ambiguous assignee to triage', async () => {
    const taskId = await insertCanonicalTask({
      assignee_role: 'the team', // In AMBIGUOUS_ASSIGNEES set
    });

    const result = await assignmentService.assign(taskId as CanonicalTaskId);

    expect(result.method).toBe('triage');
  });

  it('creates audit log entry with assignment method', async () => {
    const taskId = await insertCanonicalTask({
      assignee_user_id: 'user-jones-001',
    });

    await assignmentService.assign(taskId as CanonicalTaskId);

    const count = await countRows(
      'audit_log',
      "entity_type = 'canonical_task' AND entity_id = $1 AND action = 'updated'",
      [taskId],
    );
    expect(count).toBe(1);
  });

  it('throws PipelineError for non-existent canonical task', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000' as CanonicalTaskId;

    await expect(assignmentService.assign(fakeId))
      .rejects.toThrow(PipelineError);
  });

  it('Tier 3: matches existing owner with same matter + action type', async () => {
    const pool = getPool();

    // Create an existing canonical task with an assignee for the same matter + action type
    await pool.query(
      `INSERT INTO canonical_tasks
         (canonical_summary, action_type, status, priority, matter_id, assignee_user_id, assignee_role)
       VALUES ('Existing filing task', 'filing', 'active', 'normal', 'matter-abc', 'user-existing-001', 'Senior Associate')`,
    );

    // Now create a new task with same matter + action type but no assignee
    const taskId = await insertCanonicalTask({
      action_type: 'filing',
      matter_id: 'matter-abc',
    });

    const result = await assignmentService.assign(taskId as CanonicalTaskId);

    expect(result.method).toBe('existing_owner');
    expect(result.assignee_user_id).toBe('user-existing-001');
  });
});
