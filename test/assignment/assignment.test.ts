import { describe, it, expect } from 'vitest';
import { AMBIGUOUS_ASSIGNEES } from '../../src/assignment/assignment.service.js';

describe('AMBIGUOUS_ASSIGNEES', () => {
  it('should contain "we"', () => {
    expect(AMBIGUOUS_ASSIGNEES.has('we')).toBe(true);
  });

  it('should contain "someone"', () => {
    expect(AMBIGUOUS_ASSIGNEES.has('someone')).toBe(true);
  });

  it('should contain "somebody"', () => {
    expect(AMBIGUOUS_ASSIGNEES.has('somebody')).toBe(true);
  });

  it('should contain "the team"', () => {
    expect(AMBIGUOUS_ASSIGNEES.has('the team')).toBe(true);
  });

  it('should contain "us"', () => {
    expect(AMBIGUOUS_ASSIGNEES.has('us')).toBe(true);
  });

  it('should contain "anyone"', () => {
    expect(AMBIGUOUS_ASSIGNEES.has('anyone')).toBe(true);
  });

  it('should have exactly 6 members', () => {
    expect(AMBIGUOUS_ASSIGNEES.size).toBe(6);
  });

  it('should not contain specific person names', () => {
    expect(AMBIGUOUS_ASSIGNEES.has('Attorney Jones')).toBe(false);
    expect(AMBIGUOUS_ASSIGNEES.has('Sarah')).toBe(false);
  });
});
