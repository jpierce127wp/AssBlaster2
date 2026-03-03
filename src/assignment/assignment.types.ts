/** Assignment result */
export interface AssignmentResult {
  assignee_user_id: string | null;
  assignee_role: string | null;
  method: 'explicit' | 'fallback';
}
