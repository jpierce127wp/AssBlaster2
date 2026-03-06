import { api } from '../client';
import type { ActionType, RoutingRule, TaskPriority } from '../types';

export const routingApi = {
  list: () =>
    api.get<{ items: RoutingRule[]; total: number }>('/routing-rules'),

  create: (data: {
    practice_area: string;
    action_type?: ActionType;
    assignee_user_id?: string;
    assignee_role?: string;
    priority?: TaskPriority;
  }) =>
    api.post<RoutingRule>('/routing-rules', data),

  delete: (id: string) =>
    api.delete<void>(`/routing-rules/${id}`),
};
