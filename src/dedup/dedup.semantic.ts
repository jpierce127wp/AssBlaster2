import { RegistryRepo } from '../registry/registry.repo.js';
import { getEmbeddingProvider } from '../kernel/embedding.js';
import type { DedupCandidate } from './dedup.types.js';
import { DEDUP_THRESHOLDS } from './dedup.types.js';

export class SemanticDedup {
  private registryRepo = new RegistryRepo();

  /** Embed a summary and find similar tasks via pgvector */
  async findSimilar(
    canonicalSummary: string,
    targetObject: string | null,
    matterId: string | null,
  ): Promise<{ embedding: number[]; candidates: DedupCandidate[] }> {
    const embeddingProvider = getEmbeddingProvider();
    const textToEmbed = targetObject ? `${canonicalSummary}. ${targetObject}` : canonicalSummary;
    const [embedding] = await embeddingProvider.embed([textToEmbed]);

    if (!embedding) {
      return { embedding: [], candidates: [] };
    }

    const similar = await this.registryRepo.findSimilarByEmbedding(
      embedding,
      matterId,
      5,
      DEDUP_THRESHOLDS.CREATE_NEW,
    );

    const candidates: DedupCandidate[] = similar.map((task) => ({
      taskId: task.id,
      canonicalSummary: task.canonical_summary,
      similarity: task.similarity,
      method: 'semantic' as const,
    }));

    return { embedding, candidates };
  }
}
