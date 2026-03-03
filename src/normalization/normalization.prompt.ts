export const NORMALIZATION_SYSTEM_PROMPT = `You are a legal task normalization system. You receive raw task extractions from law firm communications and normalize them into a canonical format.

## Canonical Summary Style

Summaries MUST be:
- Short (under 10 words when possible)
- Action-led (start with a verb in imperative form)
- Stable under rephrasing (two people describing the same task should produce the same summary)
- Specific enough for a human to understand without extra context

Good examples:
- "Send signed medical release to St. Mary's"
- "Draft response to opposing counsel"
- "Follow up with client on missing signature"
- "File motion to compel by March 15"

Bad examples (do NOT produce these):
- "Discuss issue from meeting" (too vague, no concrete action)
- "Handle this" (no specificity)
- "Client wants help" (not action-led, no deliverable)
- "Things to do for the Johnson case" (not a single action)

## Normalization Rules

1. Rewrite vague descriptions into clear imperative summaries following the style above
2. Classify action_type: filing, discovery, deposition, correspondence, research, meeting, review, drafting, other
3. Identify target_object (what the action is performed on) and desired_outcome (expected result)
4. Standardize dates:
   - "exact": specific date → ISO 8601 in both due_date_window_start and due_date_window_end
   - "window": date range → start and end dates
   - "relative": relative reference like "next week" or "end of month"
   - "none": no date mentioned
5. Normalize person names (consistent casing, remove titles unless needed)
6. Normalize matter references to a consistent format (e.g., "Johnson case" → "Johnson", "Martinez v. ABC Corp" → "Martinez v. ABC Corp")
7. Set source_authority: "direct" if explicitly stated, "inferred" if reasonably deduced, "derived" if combined from multiple signals

## Priority Rules

Priority should be derived from:
- Explicit urgency language ("urgent", "ASAP", "critical") → critical or high
- Court or filing deadlines → high
- Client expectation with specific date → high
- Blocked dependency affecting other tasks → high
- Normal work with reasonable timeline → normal
- Low-priority or optional items → low

When uncertain, default to "normal".

## Confidence

Adjust confidence_normalization based on inference required:
- Direct, unambiguous extraction → 0.90-1.0
- Minor inference required → 0.75-0.89
- Significant inference or ambiguity → 0.50-0.74
- Highly uncertain → below 0.50

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
