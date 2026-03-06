import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies
vi.mock('../../src/observability/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

const mockSyncRepo = { findByTaskId: vi.fn(), upsert: vi.fn() };
const mockRegistryRepo = { findById: vi.fn() };
const mockClioClient = { getTask: vi.fn(), updateTask: vi.fn() };
const mockReviewService = { createReviewItem: vi.fn() };
const mockAuditRepo = { log: vi.fn() };

vi.mock('../../src/sync/sync.repo.js', () => ({
  SyncRepo: vi.fn().mockImplementation(() => mockSyncRepo),
}));
vi.mock('../../src/registry/registry.repo.js', () => ({
  RegistryRepo: vi.fn().mockImplementation(() => mockRegistryRepo),
}));
vi.mock('../../src/clio/clio.client.js', () => ({
  ClioClient: vi.fn().mockImplementation(() => mockClioClient),
}));
vi.mock('../../src/review/review.service.js', () => ({
  ReviewService: vi.fn().mockImplementation(() => mockReviewService),
}));
vi.mock('../../src/observability/audit.repo.js', () => ({
  AuditRepo: vi.fn().mockImplementation(() => mockAuditRepo),
}));
vi.mock('../../src/clio/clio.field-map.js', () => ({
  mapPriority: (p: string) => p,
  mapStatus: (s: string) => s,
}));

import { ConflictHandler } from '../../src/clio/conflict-handler.js';

describe('ConflictHandler', () => {
  let handler: ConflictHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new ConflictHandler();
    mockAuditRepo.log.mockResolvedValue(undefined);
  });

  it('throws when no sync link found', async () => {
    mockSyncRepo.findByTaskId.mockResolvedValue(null);

    await expect(handler.resolve('can-001' as any)).rejects.toThrow('No sync link found');
  });

  it('throws when canonical task not found', async () => {
    mockSyncRepo.findByTaskId.mockResolvedValue({ clio_task_id: 'clio-1' });
    mockClioClient.getTask.mockResolvedValue({ task: { name: 'Test' }, etag: 'etag-1' });
    mockRegistryRepo.findById.mockResolvedValue(null);

    await expect(handler.resolve('can-001' as any)).rejects.toThrow('Canonical task not found');
  });

  it('force-pushes local when human_edited_at is set', async () => {
    mockSyncRepo.findByTaskId.mockResolvedValue({ clio_task_id: 'clio-1' });
    mockClioClient.getTask.mockResolvedValue({
      task: { name: 'Old name', description: 'Old desc' },
      etag: 'etag-1',
    });
    mockRegistryRepo.findById.mockResolvedValue({
      canonical_summary: 'File motion',
      desired_outcome: 'Granted',
      priority: 'high',
      status: 'active',
      due_date_window_start: '2026-03-15',
      assignee_user_id: null,
      human_edited_at: new Date('2026-03-01'),
    });
    mockClioClient.updateTask.mockResolvedValue({ task: {}, etag: 'etag-2' });
    mockSyncRepo.upsert = vi.fn().mockResolvedValue(undefined);

    const result = await handler.resolve('can-001' as any);

    expect(result.action).toBe('overwritten');
    expect(mockClioClient.updateTask).toHaveBeenCalledWith('clio-1', expect.any(Object), 'etag-1');
    expect(mockSyncRepo.upsert).toHaveBeenCalled();
    expect(mockAuditRepo.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'updated',
        metadata: expect.objectContaining({ resolution: 'overwritten' }),
      }),
    );
  });

  it('creates review item when no human edit', async () => {
    mockSyncRepo.findByTaskId.mockResolvedValue({ clio_task_id: 'clio-1' });
    mockClioClient.getTask.mockResolvedValue({
      task: { name: 'Changed name' },
      etag: 'etag-1',
    });
    mockRegistryRepo.findById.mockResolvedValue({
      canonical_summary: 'File motion',
      desired_outcome: null,
      priority: 'high',
      status: 'active',
      human_edited_at: null,
    });
    mockReviewService.createReviewItem.mockResolvedValue({ id: 'rev-001' });

    const result = await handler.resolve('can-001' as any);

    expect(result.action).toBe('review_created');
    expect(result.details).toContain('rev-001');
    expect(mockReviewService.createReviewItem).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'conflict', priority: 5 }),
    );
    expect(mockAuditRepo.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ resolution: 'review_created' }),
      }),
    );
  });

  it('includes assignee in payload when set', async () => {
    mockSyncRepo.findByTaskId.mockResolvedValue({ clio_task_id: 'clio-1' });
    mockClioClient.getTask.mockResolvedValue({
      task: { name: 'Test' },
      etag: 'etag-1',
    });
    mockRegistryRepo.findById.mockResolvedValue({
      canonical_summary: 'File motion',
      desired_outcome: null,
      priority: 'high',
      status: 'active',
      due_date_window_start: null,
      assignee_user_id: '42',
      human_edited_at: new Date('2026-03-01'),
    });
    mockClioClient.updateTask.mockResolvedValue({ task: {}, etag: 'etag-2' });
    mockSyncRepo.upsert = vi.fn().mockResolvedValue(undefined);

    await handler.resolve('can-001' as any);

    const payload = mockClioClient.updateTask.mock.calls[0]![1];
    expect(payload.data.assignee).toEqual({ id: 42 });
  });

  it('detects changed fields', async () => {
    mockSyncRepo.findByTaskId.mockResolvedValue({ clio_task_id: 'clio-1' });
    mockClioClient.getTask.mockResolvedValue({
      task: { name: 'Different name', description: 'Same' },
      etag: 'etag-1',
    });
    mockRegistryRepo.findById.mockResolvedValue({
      canonical_summary: 'File motion',
      desired_outcome: 'Same',
      priority: 'high',
      status: 'active',
      human_edited_at: null,
    });
    mockReviewService.createReviewItem.mockResolvedValue({ id: 'rev-001' });

    const result = await handler.resolve('can-001' as any);
    expect(result.details).toContain('canonical_summary');
  });
});
