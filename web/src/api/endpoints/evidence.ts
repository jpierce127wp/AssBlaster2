import { api } from '../client';
import type { EvidenceEvent, IngestRequest, IngestResponse, PaginatedResult } from '../types';

export const evidenceApi = {
  list: (limit = 20, offset = 0) =>
    api.get<PaginatedResult<EvidenceEvent>>(`/evidence?limit=${limit}&offset=${offset}`),

  get: (id: string) =>
    api.get<EvidenceEvent>(`/evidence/${id}`),

  ingest: (body: IngestRequest) =>
    api.post<IngestResponse>('/evidence', body),

  replay: (id: string) =>
    api.post<{ message: string }>(`/replay/${id}`),

  replayFromStage: (id: string, stage: string) =>
    api.post<{ message: string }>(`/replay/${id}/${stage}`),
};
