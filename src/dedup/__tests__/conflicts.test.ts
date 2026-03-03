import { describe, it, expect } from 'vitest';
import {
  resolveDueDateConflict,
  resolveAssignmentConflict,
  resolveScopeConflict,
} from '../dedup.conflicts.js';

describe('resolveDueDateConflict', () => {
  const base = { updatedAt: new Date('2026-03-01') };

  it('should pick candidate when existing date is null', () => {
    const result = resolveDueDateConflict(
      { value: null, authority: 'direct', ...base },
      { value: '2026-04-01', authority: 'inferred' },
    );
    expect(result).toEqual({ outcome: 'winner', value: '2026-04-01', reason: 'Existing date was empty' });
  });

  it('should pick existing when candidate date is null', () => {
    const result = resolveDueDateConflict(
      { value: '2026-04-01', authority: 'direct', ...base },
      { value: null, authority: 'inferred' },
    );
    expect(result).toEqual({ outcome: 'winner', value: '2026-04-01', reason: 'Candidate date was empty' });
  });

  it('should pick existing when dates match', () => {
    const result = resolveDueDateConflict(
      { value: '2026-04-01', authority: 'direct', ...base },
      { value: '2026-04-01', authority: 'inferred' },
    );
    expect(result.outcome).toBe('winner');
    expect(result).toHaveProperty('value', '2026-04-01');
  });

  it('should pick candidate when candidate has higher authority (direct vs inferred)', () => {
    const result = resolveDueDateConflict(
      { value: '2026-04-01', authority: 'inferred', ...base },
      { value: '2026-05-01', authority: 'direct' },
    );
    expect(result.outcome).toBe('winner');
    expect(result).toHaveProperty('value', '2026-05-01');
  });

  it('should pick existing when existing has higher authority', () => {
    const result = resolveDueDateConflict(
      { value: '2026-04-01', authority: 'direct', ...base },
      { value: '2026-05-01', authority: 'derived' },
    );
    expect(result.outcome).toBe('winner');
    expect(result).toHaveProperty('value', '2026-04-01');
  });

  it('should route to review when both are high-authority (direct) and disagree', () => {
    const result = resolveDueDateConflict(
      { value: '2026-04-01', authority: 'direct', ...base },
      { value: '2026-05-01', authority: 'direct' },
    );
    expect(result.outcome).toBe('review');
  });

  it('should prefer candidate for same lower authority (more recent evidence)', () => {
    const result = resolveDueDateConflict(
      { value: '2026-04-01', authority: 'inferred', ...base },
      { value: '2026-05-01', authority: 'inferred' },
    );
    expect(result.outcome).toBe('winner');
    expect(result).toHaveProperty('value', '2026-05-01');
  });

  it('should handle null authority as lowest rank', () => {
    const result = resolveDueDateConflict(
      { value: '2026-04-01', authority: null, ...base },
      { value: '2026-05-01', authority: 'derived' },
    );
    expect(result.outcome).toBe('winner');
    expect(result).toHaveProperty('value', '2026-05-01');
  });

  it('should prefer candidate when both have null authority (same rank, more recent)', () => {
    const result = resolveDueDateConflict(
      { value: '2026-04-01', authority: null, ...base },
      { value: '2026-05-01', authority: null },
    );
    expect(result.outcome).toBe('winner');
    expect(result).toHaveProperty('value', '2026-05-01');
  });
});

describe('resolveAssignmentConflict', () => {
  it('should pick candidate when existing is null', () => {
    const result = resolveAssignmentConflict(
      { userId: null, authority: 'direct' },
      { userId: 'user-2', authority: 'inferred' },
    );
    expect(result.outcome).toBe('winner');
    expect(result).toHaveProperty('value', 'user-2');
  });

  it('should pick existing when candidate is null', () => {
    const result = resolveAssignmentConflict(
      { userId: 'user-1', authority: 'direct' },
      { userId: null, authority: 'inferred' },
    );
    expect(result.outcome).toBe('winner');
    expect(result).toHaveProperty('value', 'user-1');
  });

  it('should pick existing when assignees match', () => {
    const result = resolveAssignmentConflict(
      { userId: 'user-1', authority: 'direct' },
      { userId: 'user-1', authority: 'inferred' },
    );
    expect(result.outcome).toBe('winner');
    expect(result).toHaveProperty('value', 'user-1');
  });

  it('should pick candidate with higher authority', () => {
    const result = resolveAssignmentConflict(
      { userId: 'user-1', authority: 'derived' },
      { userId: 'user-2', authority: 'direct' },
    );
    expect(result.outcome).toBe('winner');
    expect(result).toHaveProperty('value', 'user-2');
  });

  it('should route to review when both direct authority and different users', () => {
    const result = resolveAssignmentConflict(
      { userId: 'user-1', authority: 'direct' },
      { userId: 'user-2', authority: 'direct' },
    );
    expect(result.outcome).toBe('review');
  });

  it('should prefer candidate for same lower authority', () => {
    const result = resolveAssignmentConflict(
      { userId: 'user-1', authority: 'inferred' },
      { userId: 'user-2', authority: 'inferred' },
    );
    expect(result.outcome).toBe('winner');
    expect(result).toHaveProperty('value', 'user-2');
  });
});

describe('resolveScopeConflict', () => {
  it('should prefer candidate when it is more specific (shorter)', () => {
    const result = resolveScopeConflict(
      'Draft and review the comprehensive motion to compel discovery responses',
      'File motion to compel',
    );
    expect(result.outcome).toBe('winner');
    expect(result).toHaveProperty('value', 'use_candidate');
  });

  it('should prefer existing when it is more specific (shorter)', () => {
    const result = resolveScopeConflict(
      'File motion',
      'Draft and review the comprehensive motion to compel discovery responses',
    );
    expect(result.outcome).toBe('winner');
    expect(result).toHaveProperty('value', 'keep_existing');
  });

  it('should route to review when same word count', () => {
    const result = resolveScopeConflict(
      'File the motion',
      'Draft a motion',
    );
    expect(result.outcome).toBe('review');
  });

  it('should handle single-word summaries', () => {
    const result = resolveScopeConflict('File', 'Draft and finalize everything');
    expect(result.outcome).toBe('winner');
    expect(result).toHaveProperty('value', 'keep_existing');
  });

  it('should route to review when both summaries are identical', () => {
    const result = resolveScopeConflict('File motion to compel', 'File motion to compel');
    expect(result.outcome).toBe('review');
  });
});
