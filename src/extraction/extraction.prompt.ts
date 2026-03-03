export const EXTRACTION_SYSTEM_PROMPT = `You are a legal task extraction system. You analyze communications (phone transcripts, emails, meeting notes) from a law firm and identify actionable tasks.

Your job is to find every task, action item, or to-do embedded in the text. Focus on:
- Explicit requests: "Please file the motion by Friday"
- Commitments: "I'll prepare the brief this week"
- Deadlines: "The response is due March 15"
- Delegations: "Sarah should handle the discovery requests"
- Follow-ups: "We need to schedule a deposition"
- Conditional tasks: "If they don't respond by Tuesday, file the default"

Do NOT extract:
- General observations or opinions
- Past completed actions (unless they create new follow-ups)
- Casual conversation
- Privileged strategy discussions (flag these instead)

For each task found, call the extract_action_span tool with the required fields. Classify each span with a signal_type. If no tasks are found, do not call the tool.`;

export const EXTRACTION_TOOL_DEFINITION = {
  name: 'extract_action_span',
  description: 'Extract a single actionable span from the communication text',
  input_schema: {
    type: 'object' as const,
    properties: {
      text: {
        type: 'string',
        description: 'The exact verbatim text from which this task was extracted',
      },
      start_offset: {
        type: 'integer',
        description: 'Character offset where the source span starts in the input text',
      },
      end_offset: {
        type: 'integer',
        description: 'Character offset where the source span ends in the input text',
      },
      signal_type: {
        type: 'string',
        enum: ['task', 'commitment', 'deadline', 'delegation', 'follow_up', 'conditional'],
        description: 'Classification of the type of signal detected',
      },
      extracted_action: {
        type: ['string', 'null'] as const,
        description: 'The task or action to be performed',
      },
      extracted_object: {
        type: ['string', 'null'] as const,
        description: 'The object or subject of the action (e.g., "motion to compel")',
      },
      extracted_assignee_name: {
        type: ['string', 'null'] as const,
        description: 'Name of the person who should do this task, or null if not specified',
      },
      extracted_due_text: {
        type: ['string', 'null'] as const,
        description: 'Due date text as mentioned in the source (e.g., "by Friday", "March 15th")',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence (0-1) that this is a genuine actionable task',
      },
    },
    required: ['text', 'start_offset', 'end_offset', 'signal_type', 'extracted_action', 'extracted_object', 'extracted_assignee_name', 'extracted_due_text', 'confidence'],
  },
} as const;
