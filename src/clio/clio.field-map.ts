/**
 * Clio Field Mappings
 *
 * Maps internal canonical task fields to Clio Manage API v4 field names.
 * Field names follow Clio v4 conventions (name, description, due_at, assignee.id).
 * Verify against your Clio sandbox before first production sync.
 */

export const CLIO_FIELD_MAP = {
  summary: 'name',
  description: 'description',
  dueDate: 'due_at',
  assignee: 'assignee.id',
  priority: {
    critical: 'High',
    high: 'High',
    normal: 'Normal',
    low: 'Low',
  },
  status: {
    proposed: 'Pending',
    active: 'In Progress',
    blocked: 'Pending',
    review_pending: 'Pending',
    complete: 'Complete',
    superseded: 'Complete',
    discarded: 'Complete',
  },
} as const;

export function mapPriority(priority: string): string {
  return (CLIO_FIELD_MAP.priority as Record<string, string>)[priority] ?? 'Normal';
}

export function mapStatus(status: string): string {
  return (CLIO_FIELD_MAP.status as Record<string, string>)[status] ?? 'Pending';
}
