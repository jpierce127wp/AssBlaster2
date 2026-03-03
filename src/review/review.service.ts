import { getLogger } from '../kernel/logger.js';
import { AuditRepo } from '../observability/audit.repo.js';
import { ReviewRepo } from './review.repo.js';
import { NotFoundError } from '../kernel/errors.js';
import type { ReviewItem, ReviewDecision } from './review.types.js';
import type { PaginationParams, PaginatedResult, CandidateTaskId, ReviewReason } from '../kernel/types.js';

export class ReviewService {
  private repo = new ReviewRepo();
  private auditRepo = new AuditRepo();

  async createReviewItem(input: {
    candidateTaskId: CandidateTaskId;
    reason: ReviewReason;
    priority?: number;
  }): Promise<ReviewItem> {
    const logger = getLogger();

    const item = await this.repo.create(input);

    await this.auditRepo.log({
      entityType: 'review_item',
      entityId: item.id,
      action: 'created',
      summary: `Review item created: ${input.reason}`,
      metadata: { candidate_task_id: input.candidateTaskId, reason: input.reason },
    });

    logger.info({ reviewId: item.id, reason: input.reason }, 'Review item created');
    return item;
  }

  async getOpen(pagination: PaginationParams): Promise<PaginatedResult<ReviewItem>> {
    return this.repo.findOpen(pagination);
  }

  async findById(id: string): Promise<ReviewItem | null> {
    return this.repo.findById(id);
  }

  async decide(id: string, decision: ReviewDecision): Promise<ReviewItem> {
    const logger = getLogger();
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundError('ReviewItem', id);

    const updated = await this.repo.decide(id, decision);

    await this.auditRepo.log({
      entityType: 'review_item',
      entityId: id,
      action: 'reviewed',
      summary: `Review decided: ${decision.status}`,
      metadata: {
        decision: decision.status,
        decided_by: decision.decided_by,
      },
    });

    logger.info({ reviewId: id, decision: decision.status }, 'Review decision recorded');
    return updated;
  }
}
