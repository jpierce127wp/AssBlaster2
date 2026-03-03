import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../kernel/config.js';
import { getLogger } from '../kernel/logger.js';
import { EvidenceRepo } from '../evidence/evidence.repo.js';
import { AuditRepo } from '../observability/audit.repo.js';
import { ActionSpanRepo } from '../extraction/extraction.repo.js';
import { CandidateTaskRepo } from './normalization.repo.js';
import { NORMALIZATION_SYSTEM_PROMPT, NORMALIZATION_TOOL_DEFINITION } from './normalization.prompt.js';
import { candidateTaskSchema, type CandidateTask, type NormalizationResult } from './normalization.types.js';
import type { ActionSpanRow } from '../extraction/extraction.types.js';
import type { EvidenceEventId, ActionSpanId } from '../kernel/types.js';
import { getClock } from '../kernel/clock.js';

export class NormalizationService {
  private client: Anthropic;
  private evidenceRepo = new EvidenceRepo();
  private actionSpanRepo = new ActionSpanRepo();
  private candidateTaskRepo = new CandidateTaskRepo();
  private auditRepo = new AuditRepo();

  constructor() {
    const config = loadConfig();
    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
  }

  async normalize(evidenceEventId: EvidenceEventId, actionSpanIds: string[]): Promise<NormalizationResult> {
    const logger = getLogger();
    const startTime = Date.now();

    const event = await this.evidenceRepo.findById(evidenceEventId);
    const currentDate = getClock().now().toISOString().split('T')[0];

    // Load action spans from DB
    const actionSpans: ActionSpanRow[] = [];
    for (const id of actionSpanIds) {
      const span = await this.actionSpanRepo.findById(id as ActionSpanId);
      if (span) actionSpans.push(span);
    }

    // Build the input for Claude
    const spansText = actionSpans
      .map((s, i) => `Task ${i + 1}:\n  Signal type: ${s.signal_type}\n  Action: ${s.extracted_action ?? 'unspecified'}\n  Object: ${s.extracted_object ?? 'unspecified'}\n  Assignee: ${s.extracted_assignee_name ?? 'unspecified'}\n  Due text: ${s.extracted_due_text ?? 'unspecified'}\n  Confidence: ${s.confidence}\n  Source: "${s.text}"`)
      .join('\n\n');

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: NORMALIZATION_SYSTEM_PROMPT,
      tools: [NORMALIZATION_TOOL_DEFINITION],
      messages: [
        {
          role: 'user',
          content: `Current date: ${currentDate}\n\nNormalize these ${actionSpans.length} extracted tasks:\n\n${spansText}`,
        },
      ],
    });

    // Collect normalized tasks
    const candidateTasks: CandidateTask[] = [];
    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'normalize_task') {
        const parsed = candidateTaskSchema.safeParse(block.input);
        if (parsed.success) {
          candidateTasks.push(parsed.data);
        } else {
          logger.warn({ error: parsed.error, input: block.input }, 'Failed to parse normalized task');
        }
      }
    }

    // Persist candidate tasks to DB
    const candidateTaskIds: string[] = [];
    for (let i = 0; i < candidateTasks.length; i++) {
      const ct = candidateTasks[i]!;
      const actionSpanId = i < actionSpans.length ? actionSpans[i]!.id : null;

      const id = await this.candidateTaskRepo.insert({
        evidenceEventId,
        actionSpanId,
        canonicalSummary: ct.canonical_summary,
        matterId: ct.matter_reference,
        contactId: null,
        clientId: null,
        actionType: ct.action_type,
        targetObject: ct.target_object,
        desiredOutcome: ct.desired_outcome,
        assigneeName: ct.assignee_name,
        assigneeUserId: null,
        assigneeResolutionKind: ct.assignee_name ? 'extracted' : null,
        dueDateKind: ct.due_date_kind,
        dueDateWindowStart: ct.due_date_window_start,
        dueDateWindowEnd: ct.due_date_window_end,
        dueDateSourceText: ct.due_date_source_text,
        priority: ct.priority,
        dependencyText: ct.dependency_text,
        sourceAuthority: ct.source_authority,
        confidenceExtraction: ct.confidence_extraction,
        confidenceNormalization: ct.confidence_normalization,
        confidenceResolution: 0,
      });
      candidateTaskIds.push(id);
    }

    await this.evidenceRepo.updateState(evidenceEventId, 'normalized');

    const processingTimeMs = Date.now() - startTime;

    await this.auditRepo.log({
      entityType: 'evidence_event',
      entityId: evidenceEventId,
      action: 'updated',
      summary: `Normalization completed: ${candidateTasks.length} candidate tasks`,
      metadata: {
        input_spans: actionSpans.length,
        output_tasks: candidateTasks.length,
        processing_time_ms: processingTimeMs,
      },
    });

    logger.info({
      evidenceEventId,
      inputSpans: actionSpans.length,
      outputTasks: candidateTasks.length,
      processingTimeMs,
    }, 'Normalization complete');

    return { evidenceEventId, candidateTaskIds, processingTimeMs };
  }
}
