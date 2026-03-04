import { describe, it, expect } from 'vitest';
import { candidateTaskSchema } from '../../src/domain/normalization.types.js';

describe('CandidateTask schema', () => {
  it('should validate a complete candidate task', () => {
    const task = {
      canonical_summary: 'File motion to compel',
      action_type: 'filing',
      target_object: 'motion to compel',
      desired_outcome: 'Court grants motion',
      assignee_name: 'Sarah Johnson',
      due_date_kind: 'exact',
      due_date_window_start: '2026-03-15',
      due_date_window_end: '2026-03-15',
      due_date_source_text: 'by March 15th',
      priority: 'high',
      matter_reference: 'Johnson v. Smith',
      dependency_text: null,
      source_authority: 'direct',
      confidence_extraction: 0.92,
      confidence_normalization: 0.88,
    };

    const result = candidateTaskSchema.safeParse(task);
    expect(result.success).toBe(true);
  });

  it('should allow null optional fields', () => {
    const task = {
      canonical_summary: 'Review documents',
      action_type: 'discovery',
      target_object: null,
      desired_outcome: null,
      assignee_name: null,
      due_date_kind: 'none',
      due_date_window_start: null,
      due_date_window_end: null,
      due_date_source_text: null,
      priority: 'normal',
      matter_reference: null,
      dependency_text: null,
      source_authority: 'derived',
      confidence_extraction: 0.75,
      confidence_normalization: 0.70,
    };

    const result = candidateTaskSchema.safeParse(task);
    expect(result.success).toBe(true);
  });

  it('should reject empty canonical_summary', () => {
    const task = {
      canonical_summary: '',
      action_type: 'other',
      target_object: null,
      desired_outcome: null,
      assignee_name: null,
      due_date_kind: 'none',
      due_date_window_start: null,
      due_date_window_end: null,
      due_date_source_text: null,
      priority: 'normal',
      matter_reference: null,
      dependency_text: null,
      source_authority: 'derived',
      confidence_extraction: 0.5,
      confidence_normalization: 0.5,
    };

    const result = candidateTaskSchema.safeParse(task);
    expect(result.success).toBe(false);
  });

  it('should validate all action types', () => {
    const actionTypes = ['filing', 'discovery', 'deposition', 'correspondence', 'research', 'meeting', 'review', 'drafting', 'other'];
    for (const actionType of actionTypes) {
      const task = {
        canonical_summary: 'Some task',
        action_type: actionType,
        target_object: null,
        desired_outcome: null,
        assignee_name: null,
        due_date_kind: 'none',
        due_date_window_start: null,
        due_date_window_end: null,
        due_date_source_text: null,
        priority: 'normal',
        matter_reference: null,
        dependency_text: null,
        source_authority: 'derived',
        confidence_extraction: 0.5,
        confidence_normalization: 0.5,
      };
      const result = candidateTaskSchema.safeParse(task);
      expect(result.success).toBe(true);
    }
  });
});
