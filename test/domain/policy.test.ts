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

  describe('assignee confidence values vs policy thresholds', () => {
    // These values correspond to the three-way logic in identity.service.ts
    const ASSIGNEE_NO_NAME = 1.0;
    const ASSIGNEE_RESOLVED = 0.9;
    const ASSIGNEE_FAILED = 0.3;

    it('no-name confidence (1.0) exceeds SENSITIVE_FIELD_MIN_CONFIDENCE', () => {
      expect(ASSIGNEE_NO_NAME).toBeGreaterThanOrEqual(SENSITIVE_FIELD_MIN_CONFIDENCE);
    });

    it('resolved confidence (0.9) exceeds SENSITIVE_FIELD_MIN_CONFIDENCE', () => {
      expect(ASSIGNEE_RESOLVED).toBeGreaterThanOrEqual(SENSITIVE_FIELD_MIN_CONFIDENCE);
    });

    it('failed confidence (0.3) falls below MATTER_CONFIDENCE_MIN', () => {
      expect(ASSIGNEE_FAILED).toBeLessThan(MATTER_CONFIDENCE_MIN);
    });
  });
});
