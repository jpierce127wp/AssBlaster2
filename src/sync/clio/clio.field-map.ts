/**
 * Clio Field Mappings
 *
 * Maps internal canonical task fields to Clio API field names.
 * These are placeholders — validate against live Clio API docs before production use.
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
