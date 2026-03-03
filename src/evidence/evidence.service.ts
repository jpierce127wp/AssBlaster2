import { EvidenceRepo } from './evidence.repo.js';
import { AuditRepo } from '../observability/audit.repo.js';
import { getQueue, QUEUE_NAMES } from '../kernel/queue.js';
import { getLogger } from '../kernel/logger.js';
import { PipelineError } from '../kernel/errors.js';
import type { IngestRequest, EvidenceEvent, CleanedEvidence } from './evidence.types.js';
import type { EvidenceEventId, PaginationParams, PaginatedResult } from '../kernel/types.js';
import type { SourceAdapter } from './adapters/adapter.interface.js';
import { PhoneTranscriptAdapter } from './adapters/phone-transcript.adapter.js';
import { EmailAdapter } from './adapters/email.adapter.js';
import { MeetingTranscriptAdapter } from './adapters/meeting-transcript.adapter.js';

export class EvidenceService {
  private repo = new EvidenceRepo();
  private auditRepo = new AuditRepo();
  private adapters: Record<string, SourceAdapter> = {
    phone: new PhoneTranscriptAdapter(),
    email: new EmailAdapter(),
    meeting: new MeetingTranscriptAdapter(),
  };

  async ingest(request: IngestRequest): Promise<{ id: EvidenceEventId; isNew: boolean }> {
    const logger = getLogger();

    const { id, isNew } = await this.repo.insert(request);

    if (!isNew) {
      logger.info({ id, idempotencyKey: request.idempotency_key }, 'Duplicate evidence rejected');
      return { id, isNew: false };
    }

    // Audit the ingestion
    await this.auditRepo.log({
      entityType: 'evidence_event',
      entityId: id,
      action: 'created',
      summary: `Evidence ingested: ${request.source_type}`,
      metadata: { source_type: request.source_type, idempotency_key: request.idempotency_key },
    });

    // Enqueue for processing with event contract
    const queue = getQueue(QUEUE_NAMES.EVIDENCE_INGEST);
    await queue.add('ingest', {
      eventType: 'evidence.received',
      schemaVersion: 1,
      evidenceEventId: id,
    }, {
      jobId: `ingest-${id}`,
    });

    logger.info({ id, sourceType: request.source_type }, 'Evidence ingested and queued');
    return { id, isNew: true };
  }

  async cleanEvidence(evidenceEventId: EvidenceEventId): Promise<CleanedEvidence> {
    const event = await this.repo.findById(evidenceEventId);
    if (!event) throw new PipelineError(`Evidence event not found: ${evidenceEventId}`, {
      code: 'EVIDENCE_NOT_FOUND', retryable: false, entityId: evidenceEventId, stage: 'evidence',
    });

    const adapter = this.adapters[event.source_type];
    if (!adapter) throw new PipelineError(`No adapter for source type: ${event.source_type}`, {
      code: 'ADAPTER_NOT_FOUND', retryable: false, entityId: evidenceEventId, stage: 'evidence',
      metadata: { sourceType: event.source_type },
    });

    const cleaned = adapter.clean(event.raw_text, event.source_metadata);

    await this.repo.updateCleanedText(
      evidenceEventId,
      cleaned.cleaned_text,
      cleaned.source_metadata,
      cleaned.participants,
      cleaned.matter_hints,
      cleaned.contact_hints,
    );

    await this.auditRepo.log({
      entityType: 'evidence_event',
      entityId: evidenceEventId,
      action: 'updated',
      summary: `Evidence cleaned via ${event.source_type} adapter`,
      metadata: { adapter: event.source_type },
    });

    return cleaned;
  }

  async findById(id: EvidenceEventId): Promise<EvidenceEvent | null> {
    return this.repo.findById(id);
  }

  async findAll(pagination: PaginationParams): Promise<PaginatedResult<EvidenceEvent>> {
    return this.repo.findAll(pagination);
  }
}
