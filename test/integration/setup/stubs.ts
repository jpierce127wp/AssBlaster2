/**
 * Deterministic stubs for external APIs (Anthropic, embedding providers).
 * Used by integration tests to avoid real API calls while exercising real DB logic.
 */
import { vi } from 'vitest';
import type { EmbeddingProvider } from '../../../src/lib/infra/embedding.js';

// ── Pseudo-embedding ────────────────────────────────────────────────

/**
 * Generate a deterministic pseudo-embedding vector from text.
 * Same input always produces the same vector; different inputs produce different vectors.
 * Uses a simple LCG seeded from a hash of the text.
 */
export function pseudoEmbed(text: string, dims = 1536): number[] {
  let hash = 0;
  for (const ch of text) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  let s = Math.abs(hash);
  return Array.from({ length: dims }, () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return (s / 0x7fffffff) * 2 - 1;
  });
}

/**
 * Stub the embedding provider's `embed` method to return pseudo-embeddings.
 * Returns the spy for further assertions.
 */
export function stubEmbedding(provider: EmbeddingProvider) {
  return vi.spyOn(provider, 'embed').mockImplementation(async (texts: string[]) => {
    return texts.map((t) => pseudoEmbed(t));
  });
}

// ── Anthropic response builders ─────────────────────────────────────

/**
 * Build a canned Anthropic messages.create response with tool_use blocks.
 */
export function makeToolUseResponse(toolBlocks: Array<{ name: string; input: unknown }>) {
  return {
    id: 'msg-integration-test',
    type: 'message' as const,
    role: 'assistant' as const,
    content: toolBlocks.map((block, i) => ({
      type: 'tool_use' as const,
      id: `tu-${i}`,
      name: block.name,
      input: block.input,
    })),
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'end_turn' as const,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  };
}

/**
 * Build a canned Anthropic response with a text block (used for adjudication).
 */
export function makeTextResponse(text: string) {
  return {
    id: 'msg-integration-test',
    type: 'message' as const,
    role: 'assistant' as const,
    content: [{ type: 'text' as const, text }],
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'end_turn' as const,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  };
}

/**
 * Build a canned extraction response (1 or more extract_action_span tool_use blocks).
 */
export function makeExtractionResponse(
  spans: Array<{
    text: string;
    action: string;
    object: string;
    assignee?: string;
    due?: string;
    confidence?: number;
  }>,
) {
  let offset = 0;
  return makeToolUseResponse(
    spans.map((s) => {
      const start = offset;
      offset += s.text.length + 1;
      return {
        name: 'extract_action_span',
        input: {
          text: s.text,
          start_offset: start,
          end_offset: start + s.text.length,
          signal_type: 'task',
          extracted_action: s.action,
          extracted_object: s.object,
          extracted_assignee_name: s.assignee ?? null,
          extracted_due_text: s.due ?? null,
          confidence: s.confidence ?? 0.92,
        },
      };
    }),
  );
}

/**
 * Build a canned normalization response (1 or more normalize_task tool_use blocks).
 */
export function makeNormalizationResponse(
  tasks: Array<{
    summary: string;
    actionType?: string;
    targetObject?: string;
    desiredOutcome?: string;
    assigneeName?: string;
    dueStart?: string;
    dueKind?: string;
    matterRef?: string;
    priority?: string;
    confidenceExtraction?: number;
    confidenceNormalization?: number;
  }>,
) {
  return makeToolUseResponse(
    tasks.map((t) => ({
      name: 'normalize_task',
      input: {
        canonical_summary: t.summary,
        action_type: t.actionType ?? 'filing',
        target_object: t.targetObject ?? null,
        desired_outcome: t.desiredOutcome ?? null,
        assignee_name: t.assigneeName ?? null,
        due_date_kind: t.dueKind ?? 'exact',
        due_date_window_start: t.dueStart ?? null,
        due_date_window_end: null,
        due_date_source_text: t.dueStart ? 'next Friday' : null,
        priority: t.priority ?? 'high',
        matter_reference: t.matterRef ?? null,
        dependency_text: null,
        source_authority: 'direct',
        confidence_extraction: t.confidenceExtraction ?? 0.92,
        confidence_normalization: t.confidenceNormalization ?? 0.88,
      },
    })),
  );
}

/**
 * Build a canned adjudication response (text block with JSON).
 */
export function makeAdjudicationResponse(
  decision: string,
  targetIndex: number | null,
  confidence: number,
  reasoning: string,
) {
  return makeTextResponse(
    JSON.stringify({ decision, target_index: targetIndex, confidence, reasoning }),
  );
}

/**
 * Stub an Anthropic service's client.messages.create method.
 * Usage: stubAnthropic(extractionService, () => makeExtractionResponse([...]))
 */
export function stubAnthropic(service: unknown, responseFactory: () => unknown) {
  const svc = service as { client: { messages: { create: (...args: unknown[]) => unknown } } };
  return vi.spyOn(svc.client.messages, 'create').mockImplementation(async () => responseFactory());
}
