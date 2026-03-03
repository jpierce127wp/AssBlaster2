import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../kernel/config.js';
import { getLogger } from '../kernel/logger.js';
import { EvidenceRepo } from '../evidence/evidence.repo.js';
import { AuditRepo } from '../observability/audit.repo.js';
import { ActionSpanRepo } from './extraction.repo.js';
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_TOOL_DEFINITION } from './extraction.prompt.js';
import { actionSpanSchema, MIN_EXTRACTION_CONFIDENCE, type ActionSpan, type ExtractionResult } from './extraction.types.js';
import type { EvidenceEventId } from '../kernel/types.js';

export class ExtractionService {
  private client: Anthropic;
  private evidenceRepo = new EvidenceRepo();
  private actionSpanRepo = new ActionSpanRepo();
  private auditRepo = new AuditRepo();

  constructor() {
    const config = loadConfig();
    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
  }

  async extract(evidenceEventId: EvidenceEventId): Promise<ExtractionResult> {
    const logger = getLogger();
    const startTime = Date.now();

    // Get the evidence event
    const event = await this.evidenceRepo.findById(evidenceEventId);
    if (!event) throw new Error(`Evidence event not found: ${evidenceEventId}`);

    const text = event.cleaned_text ?? event.raw_text;

    // Call Claude with tool_use
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: EXTRACTION_SYSTEM_PROMPT,
      tools: [EXTRACTION_TOOL_DEFINITION],
      messages: [
        {
          role: 'user',
          content: `Extract all actionable tasks from this ${event.source_type} communication:\n\n${text}`,
        },
      ],
    });

    // Collect all tool_use calls
    const allSpans: ActionSpan[] = [];
    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'extract_action_span') {
        const parsed = actionSpanSchema.safeParse(block.input);
        if (parsed.success) {
          allSpans.push(parsed.data);
        } else {
          logger.warn({ error: parsed.error, input: block.input }, 'Failed to parse extracted span');
        }
      }
    }

    // Filter by confidence threshold
    const filteredSpans = allSpans.filter((s) => s.confidence >= MIN_EXTRACTION_CONFIDENCE);

    // Persist action spans to DB
    const actionSpanIds: string[] = [];
    for (const span of filteredSpans) {
      const id = await this.actionSpanRepo.insert({
        evidenceEventId,
        text: span.text,
        startOffset: span.start_offset,
        endOffset: span.end_offset,
        signalType: span.signal_type,
        extractedAction: span.extracted_action,
        extractedObject: span.extracted_object,
        extractedAssigneeName: span.extracted_assignee_name,
        extractedDueText: span.extracted_due_text,
        confidence: span.confidence,
      });
      actionSpanIds.push(id);
    }

    // Update status
    await this.evidenceRepo.updateState(evidenceEventId, 'extracted');

    const processingTimeMs = Date.now() - startTime;

    // Audit
    await this.auditRepo.log({
      entityType: 'evidence_event',
      entityId: evidenceEventId,
      action: 'updated',
      summary: `Extraction completed: ${filteredSpans.length} spans`,
      metadata: {
        total_spans: allSpans.length,
        filtered_spans: filteredSpans.length,
        processing_time_ms: processingTimeMs,
      },
    });

    logger.info({
      evidenceEventId,
      totalSpans: allSpans.length,
      filteredSpans: filteredSpans.length,
      processingTimeMs,
    }, 'Extraction complete');

    return {
      evidenceEventId,
      actionSpanIds,
      totalSpans: allSpans.length,
      filteredSpans: filteredSpans.length,
      processingTimeMs,
    };
  }
}
