import { api } from '../client';
import type {
  PaginatedResult,
  ReviewContext,
  ReviewDecision,
  ReviewItem,
} from '../types';

export const reviewsApi = {
  list: (limit = 20, offset = 0) =>
    api.get<PaginatedResult<ReviewItem>>(`/reviews?limit=${limit}&offset=${offset}`),

  get: (id: string) =>
    api.get<ReviewItem>(`/reviews/${id}`),

  getContext: (id: string) =>
    api.get<ReviewContext>(`/reviews/${id}/context`),

  decide: (id: string, decision: ReviewDecision) =>
    api.post<ReviewItem>(`/reviews/${id}/decide`, decision),
};
