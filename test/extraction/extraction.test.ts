import { describe, it, expect } from 'vitest';
import { actionSpanSchema, MIN_EXTRACTION_CONFIDENCE } from '../../src/domain/extraction.types.js';

describe('ActionSpan schema', () => {
  it('should validate a complete action span', () => {
    const span = {
      text: 'We need to file the motion to compel by March 15th',
      start_offset: 50,
      end_offset: 100,
      signal_type: 'task',
      extracted_action: 'File motion to compel',
      extracted_object: 'motion to compel',
      extracted_assignee_name: 'Sarah',
      extracted_due_text: 'March 15th',
      confidence: 0.92,
    };

    const result = actionSpanSchema.safeParse(span);
    expect(result.success).toBe(true);
  });

  it('should allow null extracted fields', () => {
    const span = {
      text: 'We should review the discovery documents',
      start_offset: 0,
      end_offset: 42,
      signal_type: 'task',
      extracted_action: 'Review discovery documents',
      extracted_object: null,
      extracted_assignee_name: null,
      extracted_due_text: null,
      confidence: 0.75,
    };

    const result = actionSpanSchema.safeParse(span);
    expect(result.success).toBe(true);
  });

  it('should reject confidence below 0', () => {
    const span = {
      text: 'test',
      start_offset: 0,
      end_offset: 4,
      signal_type: 'task',
      extracted_action: 'Test',
      extracted_object: null,
      extracted_assignee_name: null,
      extracted_due_text: null,
      confidence: -0.1,
    };

    const result = actionSpanSchema.safeParse(span);
    expect(result.success).toBe(false);
  });

  it('should reject confidence above 1', () => {
    const span = {
      text: 'test',
      start_offset: 0,
      end_offset: 4,
      signal_type: 'task',
      extracted_action: 'Test',
      extracted_object: null,
      extracted_assignee_name: null,
      extracted_due_text: null,
      confidence: 1.5,
    };

    const result = actionSpanSchema.safeParse(span);
    expect(result.success).toBe(false);
  });

  it('should default signal_type to task', () => {
    const span = {
      text: 'Some task text',
      start_offset: 0,
      end_offset: 14,
      extracted_action: 'Some task',
      extracted_object: null,
      extracted_assignee_name: null,
      extracted_due_text: null,
      confidence: 0.8,
    };

    const result = actionSpanSchema.safeParse(span);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.signal_type).toBe('task');
    }
  });

  it('should validate all signal types', () => {
    const signalTypes = ['task', 'commitment', 'deadline', 'delegation', 'follow_up', 'conditional'];
    for (const signalType of signalTypes) {
      const span = {
        text: 'test',
        start_offset: 0,
        end_offset: 4,
        signal_type: signalType,
        extracted_action: 'Test',
        extracted_object: null,
        extracted_assignee_name: null,
        extracted_due_text: null,
        confidence: 0.8,
      };
      const result = actionSpanSchema.safeParse(span);
      expect(result.success).toBe(true);
    }
  });
});

describe('MIN_EXTRACTION_CONFIDENCE', () => {
  it('should filter low-confidence spans', () => {
    const spans = [
      { confidence: 0.3 },
      { confidence: 0.5 },
      { confidence: 0.8 },
      { confidence: 0.95 },
    ];

    const filtered = spans.filter((s) => s.confidence >= MIN_EXTRACTION_CONFIDENCE);
    expect(filtered).toHaveLength(3);
  });
});
