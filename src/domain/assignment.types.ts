/** Assignment method — ordered by priority */
export type AssignmentMethod =
  | 'explicit'        // 1. explicit person named in evidence
  | 'role'            // 2. explicit role named, no user ID resolved
  | 'existing_owner'  // 3. existing owner of matching open canonical task
  | 'matter_owner'    // 4. matter owner / responsible attorney
  | 'rule'            // 5. practice area + action type rules
  | 'triage';         // 6. triage queue (unassigned)

/** Assignment result */
export interface AssignmentResult {
  assignee_user_id: string | null;
  assignee_role: string | null;
  method: AssignmentMethod;
}
