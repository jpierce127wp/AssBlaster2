/**
 * End-to-end API test script for TaskMaster2.
 *
 * Submits seed evidence payloads via the REST API, watches the pipeline
 * process them, and reports the resulting tasks, dedup outcomes, and audit trail.
 *
 * Usage: npx tsx scripts/test-api.ts
 *
 * Environment variables:
 *   API_URL            — Base URL (default: http://localhost:3000)
 *   API_KEY            — API key  (default: dev-api-key)
 *   POLL_INTERVAL_MS   — Poll interval in ms (default: 2000)
 *   MAX_POLL_ATTEMPTS  — Max poll attempts (default: 30)
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const API_KEY = process.env.API_KEY ?? 'dev-api-key';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '2000', 10);
const MAX_POLL_ATTEMPTS = parseInt(process.env.MAX_POLL_ATTEMPTS ?? '30', 10);

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAYLOADS_PATH = resolve(__dirname, '../fixtures/seed/payloads.json');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IngestPayload {
  idempotency_key: string;
  source_type: string;
  raw_text: string;
  source_metadata: Record<string, unknown>;
  participants: Array<{ name: string; role?: string }>;
  privilege_flags: Record<string, boolean>;
  matter_hints: string[];
  contact_hints: string[];
  source_external_id?: string;
  source_thread_id?: string;
  source_timestamp?: string;
  language: string;
}

interface IngestResponse {
  id: string;
  status: 'accepted' | 'duplicate';
  message: string;
}

interface EvidenceEvent {
  id: string;
  idempotency_key: string;
  processing_state: string;
  source_type: string;
  matter_hints: string[];
  [key: string]: unknown;
}

interface SubmittedEvidence {
  id: string;
  idempotency_key: string;
  status: string;
  finalState?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TERMINAL_STATES = new Set(['decided', 'failed']);

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-api-key': API_KEY, ...extra };
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function log(phase: string, msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [${phase}] ${msg}`);
}

function separator(title: string): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

// ---------------------------------------------------------------------------
// Phase 1: Health Check
// ---------------------------------------------------------------------------

async function healthCheck(): Promise<void> {
  separator('Phase 1: Health Check');

  try {
    const healthRes = await fetch(`${API_URL}/health`);
    log('health', `GET /health → ${healthRes.status}`);
    if (!healthRes.ok) throw new Error(`Health check failed: ${healthRes.status}`);

    const readyRes = await fetch(`${API_URL}/ready`);
    log('health', `GET /ready  → ${readyRes.status}`);
    if (!readyRes.ok) {
      log('health', 'WARNING: /ready returned non-200 — some services may be unavailable');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      console.error('\nServer is not running. To start:');
      console.error('  1. docker-compose up -d postgres redis');
      console.error('  2. cp .env.example .env  # set ANTHROPIC_API_KEY');
      console.error('  3. npx tsx scripts/migrate.ts');
      console.error('  4. npx tsx src/index.ts');
      process.exit(1);
    }
    throw err;
  }

  log('health', 'Server is healthy');
}

// ---------------------------------------------------------------------------
// Phase 2: Submit Evidence
// ---------------------------------------------------------------------------

async function submitEvidence(payloads: IngestPayload[]): Promise<SubmittedEvidence[]> {
  separator('Phase 2: Submit Evidence');

  const submitted: SubmittedEvidence[] = [];

  for (const payload of payloads) {
    const res = await fetch(`${API_URL}/api/v1/evidence`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(payload),
    });

    const body = await res.json() as IngestResponse;

    if (res.status === 201) {
      log('submit', `${payload.idempotency_key} → 201 accepted (id: ${body.id})`);
      submitted.push({ id: body.id, idempotency_key: payload.idempotency_key, status: 'accepted' });
    } else if (res.status === 200 && body.status === 'duplicate') {
      log('submit', `${payload.idempotency_key} → 200 duplicate (id: ${body.id})`);
      submitted.push({ id: body.id, idempotency_key: payload.idempotency_key, status: 'duplicate' });
    } else if (res.status === 400) {
      log('submit', `${payload.idempotency_key} → 400 VALIDATION ERROR`);
      console.error('  Zod error details:', JSON.stringify(body, null, 2));
      submitted.push({ id: '', idempotency_key: payload.idempotency_key, status: 'validation_error' });
    } else {
      log('submit', `${payload.idempotency_key} → ${res.status} UNEXPECTED`);
      console.error('  Response:', JSON.stringify(body, null, 2));
      submitted.push({ id: '', idempotency_key: payload.idempotency_key, status: `error_${res.status}` });
    }
  }

  // Idempotency check: re-submit the first payload
  log('submit', '--- Idempotency check: re-submitting first payload ---');
  const dupRes = await fetch(`${API_URL}/api/v1/evidence`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payloads[0]),
  });
  const dupBody = await dupRes.json() as IngestResponse;

  if (dupRes.status === 200 && dupBody.status === 'duplicate') {
    log('submit', `Idempotency OK: ${payloads[0].idempotency_key} → 200 duplicate`);
  } else {
    log('submit', `Idempotency UNEXPECTED: ${dupRes.status} ${dupBody.status}`);
  }

  const accepted = submitted.filter((s) => s.status === 'accepted').length;
  const errors = submitted.filter((s) => s.status.startsWith('error') || s.status === 'validation_error').length;
  log('submit', `Summary: ${accepted} accepted, ${submitted.length - accepted - errors} duplicates, ${errors} errors`);

  return submitted;
}

// ---------------------------------------------------------------------------
// Phase 3: Poll Pipeline
// ---------------------------------------------------------------------------

async function pollPipeline(submitted: SubmittedEvidence[]): Promise<SubmittedEvidence[]> {
  separator('Phase 3: Poll Pipeline');

  const trackable = submitted.filter((s) => s.id && s.status === 'accepted');
  if (trackable.length === 0) {
    log('poll', 'No accepted evidence to track');
    return submitted;
  }

  const stateMap = new Map<string, string>(); // id → last known state
  for (const item of trackable) {
    stateMap.set(item.id, 'received');
  }

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    let allTerminal = true;

    for (const item of trackable) {
      const currentState = stateMap.get(item.id)!;
      if (TERMINAL_STATES.has(currentState)) continue;

      try {
        const event = await apiGet<EvidenceEvent>(`/api/v1/evidence/${item.id}`);
        const newState = event.processing_state;

        if (newState !== currentState) {
          log('poll', `${item.idempotency_key}: ${currentState} → ${newState}`);
          stateMap.set(item.id, newState);
        }

        if (!TERMINAL_STATES.has(newState)) {
          allTerminal = false;
        }
      } catch {
        allTerminal = false;
      }
    }

    if (allTerminal) {
      log('poll', `All evidence reached terminal state after ${attempt} poll(s)`);
      break;
    }

    if (attempt === MAX_POLL_ATTEMPTS) {
      log('poll', 'WARNING: Max poll attempts reached. Some evidence may still be processing:');
      for (const item of trackable) {
        const state = stateMap.get(item.id)!;
        if (!TERMINAL_STATES.has(state)) {
          log('poll', `  STUCK: ${item.idempotency_key} (id: ${item.id}) — last state: ${state}`);
        }
      }
      break;
    }

    // Progress summary
    const states: Record<string, number> = {};
    for (const s of stateMap.values()) {
      states[s] = (states[s] ?? 0) + 1;
    }
    const summary = Object.entries(states).map(([k, v]) => `${k}:${v}`).join(', ');
    log('poll', `Poll ${attempt}/${MAX_POLL_ATTEMPTS} — ${summary}`);

    await sleep(POLL_INTERVAL_MS);
  }

  // Record final states
  for (const item of trackable) {
    item.finalState = stateMap.get(item.id);
  }

  return submitted;
}

// ---------------------------------------------------------------------------
// Phase 4: Query Results
// ---------------------------------------------------------------------------

interface QueryResults {
  tasks: { items: Array<Record<string, unknown>>; total: number };
  openTasks: { items: Array<Record<string, unknown>>; total: number };
  evidenceLinks: Map<string, { task_id: string; entries: Array<Record<string, unknown>> }>;
  metrics: Record<string, unknown>;
  audit: { entries: Array<Record<string, unknown>> };
}

async function queryResults(): Promise<QueryResults> {
  separator('Phase 4: Query Results');

  // Fetch canonical tasks
  log('query', 'Fetching canonical tasks...');
  const tasks = await apiGet<{ items: Array<Record<string, unknown>>; total: number }>(
    '/api/v1/tasks?limit=100'
  );
  log('query', `Found ${tasks.total} canonical task(s)`);

  // Fetch open tasks
  log('query', 'Fetching open canonical tasks...');
  const openTasks = await apiGet<{ items: Array<Record<string, unknown>>; total: number }>(
    '/api/v1/canonical-tasks/open?limit=100'
  );
  log('query', `Found ${openTasks.total} open task(s)`);

  // Fetch evidence links for each task
  log('query', 'Fetching evidence links...');
  const evidenceLinks = new Map<string, { task_id: string; entries: Array<Record<string, unknown>> }>();
  for (const task of tasks.items) {
    const taskId = task.id as string;
    try {
      const links = await apiGet<{ task_id: string; entries: Array<Record<string, unknown>> }>(
        `/api/v1/tasks/${taskId}/evidence`
      );
      evidenceLinks.set(taskId, links);
    } catch {
      log('query', `  Could not fetch evidence links for task ${taskId}`);
    }
  }

  // Fetch metrics
  log('query', 'Fetching metrics...');
  let metrics: Record<string, unknown> = {};
  try {
    metrics = await apiGet<Record<string, unknown>>('/api/v1/metrics');
    log('query', 'Metrics retrieved');
  } catch {
    log('query', 'WARNING: Could not fetch metrics');
  }

  // Fetch audit log
  log('query', 'Fetching audit log...');
  let audit: { entries: Array<Record<string, unknown>> } = { entries: [] };
  try {
    audit = await apiGet<{ entries: Array<Record<string, unknown>> }>('/api/v1/audit?limit=50');
    log('query', `Found ${audit.entries.length} audit log entries`);
  } catch {
    log('query', 'WARNING: Could not fetch audit log');
  }

  return { tasks, openTasks, evidenceLinks, metrics, audit };
}

// ---------------------------------------------------------------------------
// Phase 5: Report
// ---------------------------------------------------------------------------

function printReport(submitted: SubmittedEvidence[], results: QueryResults): void {
  separator('Phase 5: Report');

  // --- Evidence submission summary ---
  console.log('\n--- Evidence Submission ---');
  for (const item of submitted) {
    const stateStr = item.finalState ? ` → final: ${item.finalState}` : '';
    console.log(`  ${item.idempotency_key}: ${item.status}${stateStr}`);
  }

  const decided = submitted.filter((s) => s.finalState === 'decided').length;
  const failed = submitted.filter((s) => s.finalState === 'failed').length;
  const pending = submitted.filter((s) => s.finalState && !TERMINAL_STATES.has(s.finalState)).length;
  console.log(`\n  Pipeline results: ${decided} decided, ${failed} failed, ${pending} still processing`);

  // --- Tasks grouped by matter ---
  console.log('\n--- Canonical Tasks by Matter ---');
  const tasksByMatter = new Map<string, Array<Record<string, unknown>>>();
  for (const task of results.tasks.items) {
    const matter = (task.matter_id as string) ?? (task.matter as string) ?? 'unknown';
    if (!tasksByMatter.has(matter)) tasksByMatter.set(matter, []);
    tasksByMatter.get(matter)!.push(task);
  }

  if (tasksByMatter.size === 0) {
    console.log('  WARNING: No canonical tasks found');
  }

  for (const [matter, tasks] of tasksByMatter) {
    console.log(`\n  Matter: ${matter} (${tasks.length} task(s))`);
    for (const task of tasks) {
      const id = task.id as string;
      const summary = task.canonical_summary ?? task.summary ?? task.description ?? '(no summary)';
      const status = task.status ?? '?';
      const assignee = task.assignee_name ?? task.assigned_to ?? '(unassigned)';
      const dueDate = task.due_date_window_start ?? task.due_date ?? '';
      const priority = task.priority ?? '';
      const linkCount = results.evidenceLinks.get(id)?.entries.length ?? 0;

      console.log(`    [${status}] ${summary}`);
      console.log(`           assignee: ${assignee} | due: ${dueDate || 'none'} | priority: ${priority} | evidence links: ${linkCount}`);
    }
  }

  console.log(`\n  Total canonical tasks: ${results.tasks.total}`);
  console.log(`  Open tasks: ${results.openTasks.total}`);

  // --- Dedup / merge summary ---
  console.log('\n--- Dedup & Merge Summary ---');
  let totalLinks = 0;
  let multiLinkTasks = 0;
  for (const [taskId, linkData] of results.evidenceLinks) {
    const count = linkData.entries.length;
    totalLinks += count;
    if (count > 1) {
      multiLinkTasks++;
      const task = results.tasks.items.find((t) => t.id === taskId);
      const summary = task?.canonical_summary ?? task?.summary ?? taskId;
      console.log(`  MERGED: "${summary}" — ${count} evidence links`);
    }
  }
  console.log(`\n  Total evidence links: ${totalLinks}`);
  console.log(`  Tasks with multiple evidence sources (merges): ${multiLinkTasks}`);

  // --- Metrics snapshot ---
  console.log('\n--- Metrics Snapshot ---');
  if (Object.keys(results.metrics).length > 0) {
    for (const [key, value] of Object.entries(results.metrics)) {
      if (typeof value === 'object' && value !== null) {
        console.log(`  ${key}:`);
        for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
          console.log(`    ${subKey}: ${subValue}`);
        }
      } else {
        console.log(`  ${key}: ${value}`);
      }
    }
  } else {
    console.log('  (no metrics available)');
  }

  // --- Audit log summary ---
  console.log('\n--- Audit Log (recent) ---');
  if (results.audit.entries.length > 0) {
    const actionCounts: Record<string, number> = {};
    for (const entry of results.audit.entries) {
      const action = (entry.action as string) ?? 'unknown';
      actionCounts[action] = (actionCounts[action] ?? 0) + 1;
    }
    for (const [action, count] of Object.entries(actionCounts)) {
      console.log(`  ${action}: ${count}`);
    }
    console.log(`  Total audit entries: ${results.audit.entries.length}`);
  } else {
    console.log('  (no audit entries)');
  }

  // --- Review queue ---
  console.log('\n--- Review Queue ---');
  const reviewTasks = results.tasks.items.filter(
    (t) => t.status === 'review_pending' || t.review_status === 'open'
  );
  if (reviewTasks.length > 0) {
    for (const task of reviewTasks) {
      const summary = task.canonical_summary ?? task.summary ?? '(no summary)';
      const reason = task.review_reason ?? '(unknown reason)';
      console.log(`  [review] ${summary} — reason: ${reason}`);
    }
  } else {
    console.log('  No items in review queue');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('TaskMaster2 — API Test Script');
  console.log(`Target: ${API_URL}`);
  console.log(`Poll: ${POLL_INTERVAL_MS}ms interval, max ${MAX_POLL_ATTEMPTS} attempts\n`);

  // Load payloads
  const payloadsRaw = readFileSync(PAYLOADS_PATH, 'utf-8');
  const payloads: IngestPayload[] = JSON.parse(payloadsRaw);
  log('init', `Loaded ${payloads.length} seed payloads from ${PAYLOADS_PATH}`);

  // Phase 1
  await healthCheck();

  // Phase 2
  const submitted = await submitEvidence(payloads);
  const hasAccepted = submitted.some((s) => s.status === 'accepted');
  if (!hasAccepted) {
    log('main', 'No evidence was accepted — skipping pipeline polling');
    console.log('\nDone (no evidence processed).');
    return;
  }

  // Phase 3
  const tracked = await pollPipeline(submitted);

  // Phase 4
  const results = await queryResults();

  // Phase 5
  printReport(tracked, results);

  // Exit status
  const anyFailed = submitted.some((s) => s.finalState === 'failed');
  const anyErrors = submitted.some((s) => s.status.startsWith('error') || s.status === 'validation_error');

  if (anyErrors) {
    console.log('\nDone with submission errors (exit 1).');
    process.exit(1);
  } else if (anyFailed) {
    console.log('\nDone — some evidence failed pipeline processing (exit 1).');
    process.exit(1);
  } else {
    console.log('\nDone.');
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
