import { describe, it, expect } from 'vitest';
import { mapPriority, mapStatus, CLIO_FIELD_MAP } from '../../src/clio/clio.field-map.js';
import { SyncReconciler } from '../../src/sync/sync.reconciler.js';
import { makeCanonicalTask } from '../helpers/fixtures.js';

describe('mapPriority', () => {
  it('should map critical to High', () => {
    expect(mapPriority('critical')).toBe('High');
  });

  it('should map high to High', () => {
    expect(mapPriority('high')).toBe('High');
  });

  it('should map normal to Normal', () => {
    expect(mapPriority('normal')).toBe('Normal');
  });

  it('should map low to Low', () => {
    expect(mapPriority('low')).toBe('Low');
  });

  it('should default unknown priority to Normal', () => {
    expect(mapPriority('urgent')).toBe('Normal');
    expect(mapPriority('')).toBe('Normal');
  });
});

describe('mapStatus', () => {
  it('should map proposed to Pending', () => {
    expect(mapStatus('proposed')).toBe('Pending');
  });

  it('should map active to In Progress', () => {
    expect(mapStatus('active')).toBe('In Progress');
  });

  it('should map blocked to Pending', () => {
    expect(mapStatus('blocked')).toBe('Pending');
  });

  it('should map review_pending to Pending', () => {
    expect(mapStatus('review_pending')).toBe('Pending');
  });

  it('should map complete to Complete', () => {
    expect(mapStatus('complete')).toBe('Complete');
  });

  it('should map superseded to Complete', () => {
    expect(mapStatus('superseded')).toBe('Complete');
  });

  it('should map discarded to Complete', () => {
    expect(mapStatus('discarded')).toBe('Complete');
  });

  it('should default unknown status to Pending', () => {
    expect(mapStatus('unknown')).toBe('Pending');
  });
});

describe('CLIO_FIELD_MAP', () => {
  it('should map summary to name', () => {
    expect(CLIO_FIELD_MAP.summary).toBe('name');
  });

  it('should map description to description', () => {
    expect(CLIO_FIELD_MAP.description).toBe('description');
  });

  it('should map dueDate to due_at', () => {
    expect(CLIO_FIELD_MAP.dueDate).toBe('due_at');
  });

  it('should map assignee to assignee.id', () => {
    expect(CLIO_FIELD_MAP.assignee).toBe('assignee.id');
  });
});

describe('SyncReconciler.computeSyncHash', () => {
  it('should return a hex string', () => {
    const task = makeCanonicalTask();
    const hash = SyncReconciler.computeSyncHash(task);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should be deterministic for the same task', () => {
    const task = makeCanonicalTask();
    expect(SyncReconciler.computeSyncHash(task)).toBe(SyncReconciler.computeSyncHash(task));
  });

  it('should change when summary changes', () => {
    const task1 = makeCanonicalTask();
    const task2 = makeCanonicalTask({ canonical_summary: 'Different summary entirely' });
    expect(SyncReconciler.computeSyncHash(task1)).not.toBe(SyncReconciler.computeSyncHash(task2));
  });

  it('should change when priority changes', () => {
    const task1 = makeCanonicalTask({ priority: 'high' });
    const task2 = makeCanonicalTask({ priority: 'low' });
    expect(SyncReconciler.computeSyncHash(task1)).not.toBe(SyncReconciler.computeSyncHash(task2));
  });

  it('should change when due_date_window_start changes', () => {
    const task1 = makeCanonicalTask({ due_date_window_start: '2026-03-15' });
    const task2 = makeCanonicalTask({ due_date_window_start: '2026-04-01' });
    expect(SyncReconciler.computeSyncHash(task1)).not.toBe(SyncReconciler.computeSyncHash(task2));
  });

  it('should change when assignee_user_id changes', () => {
    const task1 = makeCanonicalTask({ assignee_user_id: 'user-a' });
    const task2 = makeCanonicalTask({ assignee_user_id: 'user-b' });
    expect(SyncReconciler.computeSyncHash(task1)).not.toBe(SyncReconciler.computeSyncHash(task2));
  });

  it('should change when status changes', () => {
    const task1 = makeCanonicalTask({ status: 'active' });
    const task2 = makeCanonicalTask({ status: 'complete' });
    expect(SyncReconciler.computeSyncHash(task1)).not.toBe(SyncReconciler.computeSyncHash(task2));
  });

  it('should NOT change when non-synced fields change', () => {
    const task1 = makeCanonicalTask({ open_evidence_count: 1 });
    const task2 = makeCanonicalTask({ open_evidence_count: 5 });
    expect(SyncReconciler.computeSyncHash(task1)).toBe(SyncReconciler.computeSyncHash(task2));
  });
});
