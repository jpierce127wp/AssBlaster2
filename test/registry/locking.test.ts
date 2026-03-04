import { describe, it, expect } from 'vitest';
import { lockKey } from '../../src/registry/locking.js';

describe('lockKey', () => {
  it('should produce format lock:matter:{matterId}', () => {
    expect(lockKey('johnson-001')).toBe('lock:matter:johnson-001');
  });

  it('should be deterministic for the same input', () => {
    expect(lockKey('m-123')).toBe(lockKey('m-123'));
  });

  it('should produce different keys for different matter IDs', () => {
    expect(lockKey('matter-a')).not.toBe(lockKey('matter-b'));
  });
});
