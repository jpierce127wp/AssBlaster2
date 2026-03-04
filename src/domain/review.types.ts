import type { CandidateTaskId, ReviewItemId, ReviewReason, ReviewStatus } from './types.js';

/** Review queue item as stored in DB */
export interface ReviewItem {
  id: ReviewItemId;
  candidate_task_id: CandidateTaskId;
  reason: ReviewReason;
  priority: number;
  status: ReviewStatus;
  decided_by: string | null;
  decided_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Decision input from a human reviewer */
export interface ReviewDecision {
  status: 'resolved' | 'dismissed';
  decided_by: string;
}
