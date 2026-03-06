import { api } from '../client';
import type { Matter, User } from '../types';

export const mattersApi = {
  list: () =>
    api.get<{ items: Matter[]; total: number }>('/matters'),

  create: (data: {
    matter_ref: string;
    display_name: string;
    client_name?: string;
    practice_area?: string;
    clio_matter_id?: number;
    aliases?: string[];
  }) =>
    api.post<Matter>('/matters', data),

  update: (id: string, data: Partial<Matter>) =>
    api.patch<Matter>(`/matters/${id}`, data),
};

export const usersApi = {
  list: () =>
    api.get<{ items: User[]; total: number }>('/users'),

  create: (data: {
    user_ref: string;
    display_name: string;
    email?: string;
    role?: string;
    department?: string;
    clio_user_id?: number;
    aliases?: string[];
  }) =>
    api.post<User>('/users', data),

  update: (id: string, data: Partial<User>) =>
    api.patch<User>(`/users/${id}`, data),
};
