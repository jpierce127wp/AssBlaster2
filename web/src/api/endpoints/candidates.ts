import { api } from '../client';
import type { CandidateTaskRow } from '../types';

export const candidatesApi = {
  get: (id: string) =>
    api.get<CandidateTaskRow>(`/candidate-tasks/${id}`),
};
