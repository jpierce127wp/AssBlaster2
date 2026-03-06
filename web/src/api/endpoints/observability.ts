import { api } from '../client';
import type { AuditAction, AuditEntry, Metrics } from '../types';

export const observabilityApi = {
  metrics: () =>
    api.get<Metrics>('/metrics'),

  audit: (params?: {
    entity_type?: string;
    entity_id?: string;
    action?: AuditAction;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.entity_type) qs.set('entity_type', params.entity_type);
    if (params?.entity_id) qs.set('entity_id', params.entity_id);
    if (params?.action) qs.set('action', params.action);
    if (params?.limit) qs.set('limit', String(params.limit));
    return api.get<{ entries: AuditEntry[] }>(`/audit?${qs}`);
  },
};
