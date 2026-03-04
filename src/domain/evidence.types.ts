import { z } from 'zod';
import type { SourceType, ProcessingState, EvidenceEventId } from './types.js';

/** Raw evidence event as stored in DB */
export interface EvidenceEvent {
  id: EvidenceEventId;
  idempotency_key: string;
  source_type: SourceType;
  raw_text: string;
  cleaned_text: string | null;
  source_metadata: Record<string, unknown>;
  participants: Array<{ name: string; role?: string }>;
  privilege_flags: Record<string, boolean>;
  matter_hints: string[];
  contact_hints: string[];
  processing_state: ProcessingState;
  schema_version: number;
  source_external_id: string | null;
  source_thread_id: string | null;
  language: string;
  received_at: Date;
  source_timestamp: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Ingest request schema */
export const ingestRequestSchema = z.object({
  idempotency_key: z.string().min(1).max(512),
  source_type: z.enum(['phone', 'email', 'meeting']),
  raw_text: z.string().min(1),
  source_metadata: z.record(z.unknown()).default({}),
  participants: z.array(z.object({
    name: z.string(),
    role: z.string().optional(),
  })).default([]),
  privilege_flags: z.record(z.boolean()).default({}),
  matter_hints: z.array(z.string()).default([]),
  contact_hints: z.array(z.string()).default([]),
  source_external_id: z.string().optional(),
  source_thread_id: z.string().optional(),
  language: z.string().default('en'),
  source_timestamp: z.string().datetime().optional(),
});

export type IngestRequest = z.infer<typeof ingestRequestSchema>;

/** Normalized output from source adapters */
export interface CleanedEvidence {
  cleaned_text: string;
  source_metadata: Record<string, unknown>;
  participants: Array<{ name: string; role?: string }>;
  matter_hints: string[];
  contact_hints: string[];
}
