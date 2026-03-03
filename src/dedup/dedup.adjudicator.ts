import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../kernel/config.js';
import { getLogger } from '../kernel/logger.js';
import type { DedupCandidate } from './dedup.types.js';
import { DEDUP_THRESHOLDS } from './dedup.types.js';
import type { CanonicalTaskId } from '../kernel/types.js';

interface AdjudicationResult {
  decision: 'merge' | 'create_new' | 'review';
  targetTaskId?: CanonicalTaskId;
  confidence: number;
  reasoning: string;
}

export class DedupAdjudicator {
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
      .map((c, i) => `${i + 1}. ID: ${c.taskId}\n   Summary: "${c.canonicalSummary}"\n   Similarity: ${(c.similarity * 100).toFixed(1)}%`)
      .join('\n');

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `You are a task deduplication adjudicator for a law firm. You compare a new task against existing candidates and decide if the new task is a duplicate.

Respond with a JSON object:
{
  "decision": "merge" | "create_new",
  "target_index": <1-based index of best match, or null>,
  "confidence": <0-1>,
  "reasoning": "<brief explanation>"
}`,
      messages: [
        {
          role: 'user',
          content: `New task:\n  Summary: "${newSummary}"\n  Target: "${newTargetObject ?? 'unspecified'}"\n\nExisting candidates:\n${candidatesList}\n\nAre any of these the same task? Consider:\n- Same action on same matter = duplicate\n- Different actions on same matter = not duplicate\n- Same action on different matters = not duplicate`,
        },
      ],
    });

    // Parse the response
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      logger.warn('No text in adjudication response');
      return { decision: 'review', confidence: 0, reasoning: 'No response from adjudicator' };
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

      if (parsed.confidence < DEDUP_THRESHOLDS.ADJUDICATION_REVIEW) {
        return {
          decision: 'review',
          confidence: parsed.confidence,
          reasoning: parsed.reasoning,
        };
      }

      if (parsed.decision === 'merge' && parsed.target_index != null) {
        const target = candidates[parsed.target_index - 1];
        if (target) {
          return {
            decision: 'merge',
            targetTaskId: target.taskId,
            confidence: parsed.confidence,
            reasoning: parsed.reasoning,
          };
        }
      }

      return {
        decision: parsed.decision === 'merge' ? 'review' : 'create_new',
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
      };
    } catch (err) {
      logger.warn({ err, text: textBlock.text }, 'Failed to parse adjudication response');
      return { decision: 'review', confidence: 0, reasoning: 'Failed to parse adjudicator response' };
    }
  }
}
