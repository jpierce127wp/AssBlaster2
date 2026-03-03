import { z } from 'zod';
import type { ActionSpanId, EvidenceEventId, SignalType } from '../kernel/types.js';

/** A single action span extracted from evidence text */
export const actionSpanSchema = z.object({
  text: z.string().describe('The verbatim text span this was extracted from'),
  start_offset: z.number().describe('Character offset start in cleaned text'),
  end_offset: z.number().describe('Character offset end in cleaned text'),
  signal_type: z.enum(['task', 'commitment', 'deadline', 'delegation', 'follow_up', 'conditional']).default('task'),
  extracted_action: z.string().nullable().describe('The task or action to be performed'),
  extracted_object: z.string().nullable().describe('The object or subject of the action'),
  extracted_assignee_name: z.string().nullable().describe('Who should do it, if mentioned'),
  extracted_due_text: z.string().nullable().describe('Due date text as mentioned in source'),
  confidence: z.number().min(0).max(1).describe('Confidence this is a real task (0-1)'),
});

export type ActionSpan = z.infer<typeof actionSpanSchema>;

/** Action span as stored in DB */
export interface ActionSpanRow {
  id: ActionSpanId;
  evidence_event_id: EvidenceEventId;
  text: string;
  start_offset: number;
  end_offset: number;
  signal_type: SignalType;
  extracted_action: string | null;
  extracted_object: string | null;
  extracted_assignee_name: string | null;
  extracted_due_text: string | null;
  confidence: number;
  created_at: Date;
}

/** Result of extraction from a single evidence event */
export interface ExtractionResult {
  evidenceEventId: string;
  actionSpanIds: string[];
  totalSpans: number;
  filteredSpans: number;
  processingTimeMs: number;
}

/** Minimum confidence to keep an extracted span */
export const MIN_EXTRACTION_CONFIDENCE = 0.5;
