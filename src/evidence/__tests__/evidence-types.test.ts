import { describe, it, expect } from 'vitest';
import { ingestRequestSchema } from '../evidence.types.js';

describe('ingestRequestSchema', () => {
  const validRequest = {
    idempotency_key: 'key-abc-123',
    source_type: 'phone' as const,
    raw_text: 'Attorney Jones discussed filing the motion.',
  };

  describe('required fields', () => {
    it('should accept a minimal valid request', () => {
      const result = ingestRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should reject missing idempotency_key', () => {
      const { idempotency_key, ...rest } = validRequest;
      const result = ingestRequestSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should reject missing source_type', () => {
      const { source_type, ...rest } = validRequest;
      const result = ingestRequestSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should reject missing raw_text', () => {
      const { raw_text, ...rest } = validRequest;
      const result = ingestRequestSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  describe('defaults', () => {
    it('should default source_metadata to empty object', () => {
      const result = ingestRequestSchema.parse(validRequest);
      expect(result.source_metadata).toEqual({});
    });

    it('should default participants to empty array', () => {
      const result = ingestRequestSchema.parse(validRequest);
      expect(result.participants).toEqual([]);
    });

    it('should default privilege_flags to empty object', () => {
      const result = ingestRequestSchema.parse(validRequest);
      expect(result.privilege_flags).toEqual({});
    });

    it('should default matter_hints to empty array', () => {
      const result = ingestRequestSchema.parse(validRequest);
      expect(result.matter_hints).toEqual([]);
    });

    it('should default contact_hints to empty array', () => {
      const result = ingestRequestSchema.parse(validRequest);
      expect(result.contact_hints).toEqual([]);
    });

    it('should default language to "en"', () => {
      const result = ingestRequestSchema.parse(validRequest);
      expect(result.language).toBe('en');
    });
  });

  describe('source_type enum', () => {
    it('should accept "phone"', () => {
      expect(ingestRequestSchema.safeParse({ ...validRequest, source_type: 'phone' }).success).toBe(true);
    });

    it('should accept "email"', () => {
      expect(ingestRequestSchema.safeParse({ ...validRequest, source_type: 'email' }).success).toBe(true);
    });

    it('should accept "meeting"', () => {
      expect(ingestRequestSchema.safeParse({ ...validRequest, source_type: 'meeting' }).success).toBe(true);
    });

    it('should reject invalid source_type', () => {
      expect(ingestRequestSchema.safeParse({ ...validRequest, source_type: 'chat' }).success).toBe(false);
    });
  });

  describe('idempotency_key constraints', () => {
    it('should reject empty string', () => {
      expect(ingestRequestSchema.safeParse({ ...validRequest, idempotency_key: '' }).success).toBe(false);
    });

    it('should reject key longer than 512 characters', () => {
      const longKey = 'a'.repeat(513);
      expect(ingestRequestSchema.safeParse({ ...validRequest, idempotency_key: longKey }).success).toBe(false);
    });

    it('should accept key at max length (512)', () => {
      const maxKey = 'a'.repeat(512);
      expect(ingestRequestSchema.safeParse({ ...validRequest, idempotency_key: maxKey }).success).toBe(true);
    });
  });

  describe('datetime validation', () => {
    it('should accept valid ISO 8601 source_timestamp', () => {
      const result = ingestRequestSchema.safeParse({
        ...validRequest,
        source_timestamp: '2026-03-01T10:00:00Z',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid datetime format', () => {
      const result = ingestRequestSchema.safeParse({
        ...validRequest,
        source_timestamp: 'not-a-date',
      });
      expect(result.success).toBe(false);
    });
  });
});
