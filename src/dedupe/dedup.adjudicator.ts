import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../app/config.js';
import { getLogger } from '../observability/logger.js';
import type { DuplicateAdjudicator } from '../domain/interfaces.js';
import type { DedupCandidate } from './dedup.types.js';
import { DEDUP_THRESHOLDS } from './dedup.types.js';
import type { CandidateTaskRow } from '../normalization/normalization.types.js';
import type { CanonicalTask } from '../registry/registry.types.js';
import type { CanonicalTaskId, AdjudicationLabel } from '../domain/types.js';

export interface AdjudicationResult {
  decision: AdjudicationLabel;
  targetTaskId?: CanonicalTaskId;
  confidence: number;
  reasoning: string;
}

export class DedupAdjudicator implements DuplicateAdjudicator {
  private client: Anthropic;

  constructor() {
    const config = loadConfig();
    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
  }

  async adjudicate(
    newSummary: string,
    newTargetObject: string | null,
    candidates: DedupCandidate[],
  ): Promise<AdjudicationResult> {
    const logger = getLogger();

    const candidatesList = candidates
      .map((c, i) => `${i + 1}. ID: ${c.taskId}\n   Summary: "${c.canonicalSummary}"\n   Status: ${c.status}\n   Similarity: ${(c.similarity * 100).toFixed(1)}%`)
      .join('\n');

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `You are a task deduplication adjudicator for a law firm. You compare a new task against existing candidates and classify the relationship.

## Decision Standards

### same_task_merge
Merge ONLY if ALL three are true:
1. Same matter or same low-risk client context
2. Same deliverable or operational outcome
3. Same current real-world work item (not just same topic)

### same_task_enrich
Use when the new evidence does NOT create a new task but instead:
- Fills a blank field on an existing task (e.g., adds a missing due date)
- Increases confidence in existing data
- Adds supporting detail, confirms assignment, or clarifies due date
This should NOT create a new task.

### related_followup
Create a follow-up task instead of merging when:
- The prior task is complete and the new action is a fresh cycle
- The new evidence changes the expected outcome materially
- The new action is downstream work, not the same deliverable
- The new evidence requests another step after completion

### distinct
The tasks are clearly different:
- Different actions on same matter
- Same action on different matters
- Unrelated work items

### needs_review
Route to human review when:
- The relationship is ambiguous
- Evidence is contradictory
- Confidence is too low to decide safely

## Response Format
Respond with a JSON object:
{
  "decision": "same_task_merge" | "same_task_enrich" | "related_followup" | "distinct" | "needs_review",
  "target_index": <1-based index of best match, or null if distinct/needs_review>,
  "confidence": <0-1>,
  "reasoning": "<brief explanation>"
}`,
      messages: [
        {
          role: 'user',
          content: `New task:\n  Summary: "${newSummary}"\n  Target: "${newTargetObject ?? 'unspecified'}"\n\nExisting candidates:\n${candidatesList}\n\nClassify the relationship. Pay attention to candidate status — if a candidate is "complete" and the new task is the same deliverable, consider "related_followup" rather than "same_task_merge".`,
        },
      ],
    });

    // Parse the response
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      logger.warn('No text in adjudication response');
      return { decision: 'needs_review', confidence: 0, reasoning: 'No response from adjudicator' };
    }

    try {
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');

      const parsed = JSON.parse(jsonMatch[0]) as {
        decision: string;
        target_index: number | null;
        confidence: number;
        reasoning: string;
      };

      // Route to review if confidence too low
      if (parsed.confidence < DEDUP_THRESHOLDS.ADJUDICATION_REVIEW) {
        return {
          decision: 'needs_review',
          confidence: parsed.confidence,
          reasoning: parsed.reasoning,
        };
      }

      const decision = parsed.decision as AdjudicationLabel;
      const validDecisions: AdjudicationLabel[] = [
        'same_task_merge', 'same_task_enrich', 'related_followup', 'distinct', 'needs_review',
      ];

      if (!validDecisions.includes(decision)) {
        logger.warn({ decision: parsed.decision }, 'Unknown adjudication decision, routing to review');
        return { decision: 'needs_review', confidence: parsed.confidence, reasoning: parsed.reasoning };
      }

      // For decisions that reference a target, resolve the index
      if (
        (decision === 'same_task_merge' || decision === 'same_task_enrich' || decision === 'related_followup')
        && parsed.target_index != null
      ) {
        const target = candidates[parsed.target_index - 1];
        if (target) {
          return {
            decision,
            targetTaskId: target.taskId,
            confidence: parsed.confidence,
            reasoning: parsed.reasoning,
          };
        }
        // Invalid index — fall through to review
        return { decision: 'needs_review', confidence: parsed.confidence, reasoning: `Invalid target_index: ${parsed.target_index}` };
      }

      return {
        decision,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
      };
    } catch (err) {
      logger.warn({ err, text: textBlock.text }, 'Failed to parse adjudication response');
      return { decision: 'needs_review', confidence: 0, reasoning: 'Failed to parse adjudicator response' };
    }
  }

  /** DuplicateAdjudicator interface — delegates to adjudicate() */
  async classify(input: {
    candidateTask: CandidateTaskRow;
    canonicalTask: CanonicalTask;
    supportingEvidence: string[];
  }): Promise<{
    label: AdjudicationLabel;
    rationale: string;
    confidence: number;
  }> {
    const candidate: DedupCandidate = {
      taskId: input.canonicalTask.id,
      canonicalSummary: input.canonicalTask.canonical_summary,
      similarity: 0,
      method: 'adjudication',
      status: input.canonicalTask.status,
    };

    const result = await this.adjudicate(
      input.candidateTask.canonical_summary,
      input.candidateTask.target_object,
      [candidate],
    );

    return {
      label: result.decision,
      rationale: result.reasoning,
      confidence: result.confidence,
    };
  }
}
