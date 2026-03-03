import { z } from 'zod';
import type { CandidateTaskId, EvidenceEventId, ActionSpanId } from '../kernel/types.js';

/** Normalized candidate task ready for identity resolution and dedup */
export const candidateTaskSchema = z.object({
  canonical_summary: z.string().min(1).describe('Normalized task summary in imperative form'),
  action_type: z.enum(['filing', 'discovery', 'deposition', 'correspondence', 'research', 'meeting', 'review', 'drafting', 'other']),
  target_object: z.string().nullable().describe('Object/subject of the action'),
  desired_outcome: z.string().nullable().describe('Expected result of the action'),
  assignee_name: z.string().nullable().describe('Normalized assignee name'),
  due_date_kind: z.enum(['exact', 'window', 'relative', 'none']).default('none'),
  due_date_window_start: z.string().nullable().describe('ISO 8601 date (YYYY-MM-DD) or null'),
  due_date_window_end: z.string().nullable().describe('ISO 8601 date (YYYY-MM-DD) or null'),
  due_date_source_text: z.string().nullable().describe('Original due date text from source'),
  priority: z.enum(['critical', 'high', 'normal', 'low']),
  matter_reference: z.string().nullable().describe('Normalized matter name or number'),
  dependency_text: z.string().nullable().describe('Dependencies or conditions'),
  source_authority: z.enum(['direct', 'inferred', 'derived']).default('derived'),
  confidence_extraction: z.number().min(0).max(1),
  confidence_normalization: z.number().min(0).max(1),
});

export type CandidateTask = z.infer<typeof candidateTaskSchema>;

/** Candidate task as stored in DB */
export interface CandidateTaskRow {
  id: CandidateTaskId;
  evidence_event_id: EvidenceEventId;
  action_span_id: ActionSpanId | null;
  canonical_summary: string;
  matter_id: string | null;
  contact_id: string | null;
  client_id: string | null;
  action_type: string;
  target_object: string | null;
  desired_outcome: string | null;
  assignee_name: string | null;
  assignee_user_id: string | null;
  assignee_resolution_kind: string | null;
  due_date_kind: string | null;
  due_date_window_start: string | null;
  due_date_window_end: string | null;
  due_date_source_text: string | null;
  priority: string;
  dependency_text: string | null;
  source_authority: string;
  confidence_extraction: number;
  confidence_normalization: number;
  confidence_resolution: number;
  schema_version: number;
  created_at: Date;
  updated_at: Date;
}

/** Result of normalization for a set of action spans */
export interface NormalizationResult {
  evidenceEventId: string;
  candidateTaskIds: string[];
  processingTimeMs: number;
}
