import { describe, it, expect } from 'vitest';
import {
  SENSITIVE_FIELDS,
  SENSITIVE_FIELD_MIN_CONFIDENCE,
  HUMAN_PROTECTED_FIELDS,
  MATTER_CONFIDENCE_MIN,
} from '../../src/domain/policy.js';

describe('Policy constants', () => {
  describe('SENSITIVE_FIELDS (D11)', () => {
    it('has exactly 3 members', () => {
      expect(SENSITIVE_FIELDS.size).toBe(3);
    });

    it('contains the correct field names', () => {
      expect(SENSITIVE_FIELDS.has('assignee_user_id')).toBe(true);
      expect(SENSITIVE_FIELDS.has('due_date_window_start')).toBe(true);
      expect(SENSITIVE_FIELDS.has('status')).toBe(true);
    });

    it('is a subset of HUMAN_PROTECTED_FIELDS', () => {
      for (const field of SENSITIVE_FIELDS) {
        expect(HUMAN_PROTECTED_FIELDS.has(field)).toBe(true);
      }
    });
  });

  describe('SENSITIVE_FIELD_MIN_CONFIDENCE (D11)', () => {
    it('equals 0.80', () => {
      expect(SENSITIVE_FIELD_MIN_CONFIDENCE).toBe(0.80);
    });
  });

  describe('HUMAN_PROTECTED_FIELDS (D6)', () => {
    it('has exactly 4 members', () => {
      expect(HUMAN_PROTECTED_FIELDS.size).toBe(4);
    });
  });

  describe('MATTER_CONFIDENCE_MIN (D4)', () => {
    it('equals 0.75', () => {
      expect(MATTER_CONFIDENCE_MIN).toBe(0.75);
    });
  });
});
