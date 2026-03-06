import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReviewRepo = {
  create: vi.fn(),
  findById: vi.fn(),
  findOpen: vi.fn(),
  decide: vi.fn(),
};
const mockAuditRepo = { log: vi.fn() };

vi.mock('../../src/review/review.repo.js', () => ({
  ReviewRepo: vi.fn().mockImplementation(() => mockReviewRepo),
}));
vi.mock('../../src/observability/audit.repo.js', () => ({
  AuditRepo: vi.fn().mockImplementation(() => mockAuditRepo),
}));
vi.mock('../../src/observability/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

import { ReviewService } from '../../src/review/review.service.js';
import { NotFoundError } from '../../src/domain/errors.js';

describe('ReviewService', () => {
  let service: ReviewService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReviewService();
    mockAuditRepo.log.mockResolvedValue(undefined);
  });

  describe('createReviewItem', () => {
    it('delegates to repo and returns item', async () => {
      const item = { id: 'rev-001', reason: 'low_confidence' };
      mockReviewRepo.create.mockResolvedValue(item);

      const result = await service.createReviewItem({
        candidateTaskId: 'ct-001' as any,
        reason: 'low_confidence' as any,
      });

      expect(result).toEqual(item);
      expect(mockReviewRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'low_confidence' }),
      );
    });

    it('logs audit entry on creation', async () => {
      mockReviewRepo.create.mockResolvedValue({ id: 'rev-001', reason: 'conflict' });

      await service.createReviewItem({
        candidateTaskId: 'ct-001' as any,
        reason: 'conflict' as any,
      });

      expect(mockAuditRepo.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'review_item',
          entityId: 'rev-001',
          action: 'created',
        }),
      );
    });
  });

  describe('getOpen', () => {
    it('delegates to repo with pagination', async () => {
      const result = { data: [], total: 0 };
      mockReviewRepo.findOpen.mockResolvedValue(result);

      const open = await service.getOpen({ limit: 20, offset: 0 });
      expect(open).toEqual(result);
      expect(mockReviewRepo.findOpen).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    });
  });

  describe('findById', () => {
    it('delegates to repo', async () => {
      const item = { id: 'rev-001' };
      mockReviewRepo.findById.mockResolvedValue(item);

      const result = await service.findById('rev-001');
      expect(result).toEqual(item);
    });
  });

  describe('decide', () => {
    it('throws NotFoundError when review item is missing', async () => {
      mockReviewRepo.findById.mockResolvedValue(null);

      await expect(
        service.decide('rev-missing', { status: 'approved', decided_by: 'user-1' } as any),
      ).rejects.toThrow(NotFoundError);
    });

    it('delegates to repo and returns updated item', async () => {
      mockReviewRepo.findById.mockResolvedValue({ id: 'rev-001' });
      mockReviewRepo.decide.mockResolvedValue({ id: 'rev-001', status: 'approved' });

      const result = await service.decide('rev-001', { status: 'approved', decided_by: 'user-1' } as any);

      expect(result.status).toBe('approved');
      expect(mockReviewRepo.decide).toHaveBeenCalledWith('rev-001', { status: 'approved', decided_by: 'user-1' });
    });

    it('logs audit entry on decision', async () => {
      mockReviewRepo.findById.mockResolvedValue({ id: 'rev-001' });
      mockReviewRepo.decide.mockResolvedValue({ id: 'rev-001', status: 'rejected' });

      await service.decide('rev-001', { status: 'rejected', decided_by: 'user-1' } as any);

      expect(mockAuditRepo.log).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'review_item',
          entityId: 'rev-001',
          action: 'reviewed',
          metadata: expect.objectContaining({ decision: 'rejected', decided_by: 'user-1' }),
        }),
      );
    });
  });
});
