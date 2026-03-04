import { describe, it, expect } from 'vitest';
import { lockKey } from '../../src/registry/locking.js';
import { PipelineError } from '../../src/domain/errors.js';

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

describe('PipelineError for lock timeout', () => {
  it('should have LOCK_TIMEOUT code and be retryable', () => {
    const error = new PipelineError(
      'Failed to acquire matter lock for m-123 after 20 retries',
      { code: 'LOCK_TIMEOUT', retryable: true, entityId: 'm-123', stage: 'locking' },
    );

    expect(error).toBeInstanceOf(PipelineError);
    expect(error.code).toBe('LOCK_TIMEOUT');
    expect(error.retryable).toBe(true);
    expect(error.entityId).toBe('m-123');
    expect(error.stage).toBe('locking');
  });

  it('should be an instance of Error', () => {
    const error = new PipelineError(
      'lock timeout',
      { code: 'LOCK_TIMEOUT', retryable: true, entityId: 'x', stage: 'locking' },
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PipelineError');
  });
});
