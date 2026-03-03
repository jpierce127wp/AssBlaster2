export const NORMALIZATION_SYSTEM_PROMPT = `You are a legal task normalization system. You receive raw task extractions from law firm communications and normalize them into a canonical format.

Your goals:
1. Rewrite vague action descriptions into clear, imperative task summaries (e.g., "handle that thing" → "Prepare discovery response")
2. Classify each task with an action_type: filing, discovery, deposition, correspondence, research, meeting, review, drafting, other
3. Identify the target_object (what the action is performed on) and desired_outcome (expected result)
4. Standardize dates: set due_date_kind to "exact" if a specific date, "window" for a range, "relative" for relative references, "none" if no date mentioned
5. For exact dates, put the ISO 8601 date in both due_date_window_start and due_date_window_end
6. Normalize person names (consistent casing, remove titles like "Mr./Ms." unless needed for disambiguation)
7. Normalize matter references to a consistent format
8. Set source_authority: "direct" if explicitly stated, "inferred" if reasonably deduced, "derived" if combined from multiple signals
9. Adjust confidence_normalization based on how much inference was required (lower if highly inferred)

Call the normalize_task tool once for each task provided.`;

export const NORMALIZATION_TOOL_DEFINITION = {
  name: 'normalize_task',
  description: 'Output a normalized candidate task',
  input_schema: {
    type: 'object' as const,
    properties: {
      canonical_summary: {
        type: 'string',
        description: 'Normalized task summary in clear imperative form',
      },
      action_type: {
        type: 'string',
        enum: ['filing', 'discovery', 'deposition', 'correspondence', 'research', 'meeting', 'review', 'drafting', 'other'],
      },
      target_object: {
        type: ['string', 'null'] as const,
        description: 'Object or subject of the action',
      },
      desired_outcome: {
        type: ['string', 'null'] as const,
        description: 'Expected result of completing the action',
      },
      assignee_name: {
        type: ['string', 'null'] as const,
        description: 'Normalized assignee name or null',
      },
      due_date_kind: {
        type: 'string',
        enum: ['exact', 'window', 'relative', 'none'],
      },
      due_date_window_start: {
        type: ['string', 'null'] as const,
        description: 'ISO 8601 date (YYYY-MM-DD) or null',
      },
      due_date_window_end: {
        type: ['string', 'null'] as const,
        description: 'ISO 8601 date (YYYY-MM-DD) or null',
      },
      due_date_source_text: {
        type: ['string', 'null'] as const,
        description: 'Original due date text from source',
      },
      priority: {
        type: 'string',
        enum: ['critical', 'high', 'normal', 'low'],
      },
      matter_reference: {
        type: ['string', 'null'] as const,
        description: 'Normalized matter name/number or null',
      },
      dependency_text: {
        type: ['string', 'null'] as const,
        description: 'Dependencies or conditions text',
      },
      source_authority: {
        type: 'string',
        enum: ['direct', 'inferred', 'derived'],
      },
      confidence_extraction: {
        type: 'number',
        minimum: 0,
        maximum: 1,
      },
      confidence_normalization: {
        type: 'number',
        minimum: 0,
        maximum: 1,
      },
    },
    required: [
      'canonical_summary', 'action_type', 'target_object', 'desired_outcome',
      'assignee_name', 'due_date_kind', 'due_date_window_start', 'due_date_window_end',
      'due_date_source_text', 'priority', 'matter_reference', 'dependency_text',
      'source_authority', 'confidence_extraction', 'confidence_normalization',
    ],
  },
} as const;
