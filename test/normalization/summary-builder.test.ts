import { describe, it, expect } from 'vitest';
import { SummaryBuilder } from '../../src/normalization/summary-builder.js';

describe('SummaryBuilder', () => {
  const builder = new SummaryBuilder();

  describe('refine', () => {
    it('collapses whitespace', () => {
      expect(builder.refine('File   motion   to   compel')).toBe('File motion to compel');
    });

    it('trims leading and trailing whitespace', () => {
      expect(builder.refine('  File motion  ')).toBe('File motion');
    });

    it('removes trailing periods', () => {
      expect(builder.refine('File motion to compel.')).toBe('File motion to compel');
    });

    it('removes multiple trailing periods', () => {
      expect(builder.refine('File motion to compel...')).toBe('File motion to compel');
    });

    it('truncates at 80 characters', () => {
      const long = 'File ' + 'a'.repeat(100);
      const result = builder.refine(long);
      expect(result.length).toBeLessThanOrEqual(80);
    });

    it('cuts at word boundary when possible', () => {
      // Build a string that's over 80 chars with words
      const long = 'File motion to compel in Johnson matter for all documents and records by the deadline date set';
      const result = builder.refine(long);
      expect(result.length).toBeLessThanOrEqual(80);
      // Should not end mid-word (last char should be end of a word)
      expect(result.length).toBeGreaterThan(48); // > 60% of 80
      // The result should end cleanly at a word boundary
      expect(result.endsWith(' ')).toBe(false);
    });

    it('handles empty string', () => {
      expect(builder.refine('')).toBe('');
    });

    it('returns short strings unchanged (after whitespace normalization)', () => {
      expect(builder.refine('File motion')).toBe('File motion');
    });
  });

  describe('validate', () => {
    it('accepts valid imperative summary', () => {
      const result = builder.validate('File motion to compel in Johnson matter');
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('rejects empty string', () => {
      const result = builder.validate('');
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Summary is empty');
    });

    it('rejects whitespace-only string', () => {
      const result = builder.validate('   ');
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Summary is empty');
    });

    it('flags summary exceeding 80 characters', () => {
      const long = 'File ' + 'a'.repeat(80);
      const result = builder.validate(long);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('exceeds 80 characters'))).toBe(true);
    });

    it('flags single word summary', () => {
      const result = builder.validate('File');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('verb and object'))).toBe(true);
    });

    it('flags non-imperative verb start', () => {
      const result = builder.validate('The motion should be filed');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('imperative verb'))).toBe(true);
    });

    it('detects SSN pattern', () => {
      const result = builder.validate('File documents for 123-45-6789 matter');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('PII'))).toBe(true);
    });

    it('detects email pattern', () => {
      const result = builder.validate('Send documents to user@example.com today');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('PII'))).toBe(true);
    });

    it('detects credit card pattern', () => {
      const result = builder.validate('Process payment 4111-1111-1111-1111 today');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('PII'))).toBe(true);
    });

    it('detects phone number pattern (10 digits)', () => {
      const result = builder.validate('Contact client at 5551234567 immediately');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('PII'))).toBe(true);
    });

    it('accepts various imperative verbs', () => {
      const verbs = ['Draft', 'Prepare', 'Review', 'Schedule', 'Send', 'Submit', 'Research'];
      for (const verb of verbs) {
        const result = builder.validate(`${verb} the document`);
        expect(result.valid).toBe(true);
      }
    });
  });
});
