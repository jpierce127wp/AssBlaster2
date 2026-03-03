import { describe, it, expect } from 'vitest';
import { HUMAN_SENSITIVE_FIELDS, HUMAN_SAFE_FIELDS } from '../registry.types.js';

describe('HUMAN_SENSITIVE_FIELDS', () => {
  const expectedFields = [
    'canonical_summary',
    'assignee_user_id',
    'assignee_role',
    'due_date_window_start',
    'due_date_window_end',
    'due_date_kind',
    'status',
    'priority',
  ];

  it('should contain exactly 8 fields', () => {
    expect(HUMAN_SENSITIVE_FIELDS.size).toBe(8);
  });

  for (const field of expectedFields) {
    it(`should contain "${field}"`, () => {
      expect(HUMAN_SENSITIVE_FIELDS.has(field)).toBe(true);
    });
  }

  it('should be a ReadonlySet', () => {
    // Verify it's iterable (Set-like) and has .has()
    expect(typeof HUMAN_SENSITIVE_FIELDS.has).toBe('function');
    expect(typeof HUMAN_SENSITIVE_FIELDS[Symbol.iterator]).toBe('function');
  });

  it('should not contain safe fields', () => {
    for (const field of HUMAN_SAFE_FIELDS) {
      expect(HUMAN_SENSITIVE_FIELDS.has(field)).toBe(false);
    }
  });
});

describe('HUMAN_SAFE_FIELDS', () => {
  it('should contain exactly 2 fields', () => {
    expect(HUMAN_SAFE_FIELDS.size).toBe(2);
  });

  it('should contain "open_evidence_count"', () => {
    expect(HUMAN_SAFE_FIELDS.has('open_evidence_count')).toBe(true);
  });

  it('should contain "last_evidence_at"', () => {
    expect(HUMAN_SAFE_FIELDS.has('last_evidence_at')).toBe(true);
  });

  it('should not contain sensitive fields', () => {
    for (const field of HUMAN_SENSITIVE_FIELDS) {
      expect(HUMAN_SAFE_FIELDS.has(field)).toBe(false);
    }
  });
});
