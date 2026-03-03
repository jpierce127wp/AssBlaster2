import { AuditRepo } from './audit.repo.js';

const auditRepo = new AuditRepo();

export async function queryAuditLog(filters: {
  entityType?: string;
  entityId?: string;
  action?: string;
  limit?: number;
}) {
  if (filters.entityType && filters.entityId) {
    return auditRepo.findByEntity(filters.entityType, filters.entityId, filters.limit);
  }
  if (filters.action) {
    return auditRepo.findByAction(filters.action, filters.limit);
  }
  return [];
}
