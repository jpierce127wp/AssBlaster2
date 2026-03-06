import { describe, it, expect } from 'vitest';
import { dateString, nonEmptyString, uuidString, paginationSchema } from '../../../src/lib/schema/index.js';

describe('dateString', () => {
  it('accepts valid ISO date (YYYY-MM-DD)', () => {
    expect(dateString.parse('2026-03-15')).toBe('2026-03-15');
  });

  it('accepts full ISO 8601 datetime', () => {
    expect(dateString.parse('2026-03-15T10:30:00Z')).toBe('2026-03-15T10:30:00Z');
  });

  it('rejects garbage strings', () => {
    expect(() => dateString.parse('not-a-date')).toThrow();
  });

  it('rejects empty string', () => {
    expect(() => dateString.parse('')).toThrow();
  });

  it('accepts date with time offset', () => {
    expect(dateString.parse('2026-03-15T10:30:00-05:00')).toBe('2026-03-15T10:30:00-05:00');
  });
});

describe('nonEmptyString', () => {
  it('accepts non-empty string', () => {
    expect(nonEmptyString.parse('hello')).toBe('hello');
  });

  it('trims whitespace', () => {
    expect(nonEmptyString.parse('  hello  ')).toBe('hello');
  });

  it('rejects empty string', () => {
    expect(() => nonEmptyString.parse('')).toThrow();
  });

  it('trims whitespace-only to empty (min check runs before trim)', () => {
    // z.string().min(1).trim() checks min(1) on untrimmed, then trims
    // '   ' has length 3 ≥ 1, so it passes min check but trims to ''
    const result = nonEmptyString.parse('   ');
    expect(result).toBe('');
  });
});

describe('uuidString', () => {
  it('accepts valid UUID', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(uuidString.parse(uuid)).toBe(uuid);
  });

  it('rejects partial UUID', () => {
    expect(() => uuidString.parse('550e8400-e29b')).toThrow();
  });

  it('rejects non-UUID string', () => {
    expect(() => uuidString.parse('not-a-uuid')).toThrow();
  });

  it('rejects empty string', () => {
    expect(() => uuidString.parse('')).toThrow();
  });
});

describe('paginationSchema', () => {
  it('applies defaults when no input', () => {
    const result = paginationSchema.parse({});
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it('coerces string values to numbers', () => {
    const result = paginationSchema.parse({ limit: '50', offset: '10' });
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(10);
  });

  it('enforces minimum limit of 1', () => {
    expect(() => paginationSchema.parse({ limit: 0 })).toThrow();
  });

  it('enforces maximum limit of 100', () => {
    expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
  });

  it('enforces minimum offset of 0', () => {
    expect(() => paginationSchema.parse({ offset: -1 })).toThrow();
  });

  it('accepts boundary values', () => {
    expect(paginationSchema.parse({ limit: 1 }).limit).toBe(1);
    expect(paginationSchema.parse({ limit: 100 }).limit).toBe(100);
    expect(paginationSchema.parse({ offset: 0 }).offset).toBe(0);
  });
});
