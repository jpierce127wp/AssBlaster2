/**
 * Lightweight pipeline tracing using Redis sorted sets.
 * No OpenTelemetry dependency — uses existing Redis infrastructure.
 */

import { getRedis } from '../lib/infra/redis.js';
import { getLogger } from './logger.js';

const TRACE_TTL_SECONDS = 3600; // 1 hour

export interface TraceEntry {
  stage: string;
  entityId: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: 'started' | 'completed' | 'failed';
  metadata?: Record<string, unknown>;
}

function traceKey(entityId: string): string {
  return `trace:${entityId}`;
}

/** Wrap an async function with timing and trace metadata */
export async function traceStage<T>(
  stage: string,
  entityId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const logger = getLogger();
  const redis = getRedis();
  const key = traceKey(entityId);
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  // Record start
  const startEntry: TraceEntry = {
    stage,
    entityId,
    startedAt,
    endedAt: null,
    durationMs: null,
    status: 'started',
  };

  await redis.zadd(key, startMs, JSON.stringify(startEntry));
  await redis.expire(key, TRACE_TTL_SECONDS);

  logger.info({ stage, entityId }, `Trace: ${stage} started`);

  try {
    const result = await fn();

    const endedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    const completedEntry: TraceEntry = {
      stage,
      entityId,
      startedAt,
      endedAt,
      durationMs,
      status: 'completed',
    };

    await redis.zadd(key, Date.now(), JSON.stringify(completedEntry));
    await redis.expire(key, TRACE_TTL_SECONDS);

    logger.info({ stage, entityId, durationMs }, `Trace: ${stage} completed`);

    return result;
  } catch (err) {
    const endedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    const failedEntry: TraceEntry = {
      stage,
      entityId,
      startedAt,
      endedAt,
      durationMs,
      status: 'failed',
      metadata: { error: String(err) },
    };

    await redis.zadd(key, Date.now(), JSON.stringify(failedEntry));
    await redis.expire(key, TRACE_TTL_SECONDS);

    logger.error({ stage, entityId, durationMs, err }, `Trace: ${stage} failed`);

    throw err;
  }
}

/** Retrieve all trace entries for an entity, ordered by time */
export async function getTrace(entityId: string): Promise<TraceEntry[]> {
  const redis = getRedis();
  const key = traceKey(entityId);

  const entries = await redis.zrange(key, 0, -1);
  return entries.map((raw) => JSON.parse(raw) as TraceEntry);
}
