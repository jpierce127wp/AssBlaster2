import { getLogger } from './logger.js';

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
}

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private apiKey: string,
    private model: string = 'voyage-3',
    public readonly dimensions: number = 1536,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Voyage API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map((d) => d.embedding);
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private apiKey: string,
    private model: string = 'text-embedding-3-small',
    public readonly dimensions: number = 1536,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data.map((d) => d.embedding);
  }
}

let _provider: EmbeddingProvider | null = null;

export function createEmbeddingProvider(config: {
  provider: 'voyage' | 'openai';
  voyageApiKey?: string;
  openaiApiKey?: string;
  model?: string;
  dimensions?: number;
}): EmbeddingProvider {
  if (_provider) return _provider;

  if (config.provider === 'voyage') {
    if (!config.voyageApiKey) throw new Error('VOYAGE_API_KEY required');
    _provider = new VoyageEmbeddingProvider(config.voyageApiKey, config.model, config.dimensions);
  } else {
    if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY required');
    _provider = new OpenAIEmbeddingProvider(config.openaiApiKey, config.model, config.dimensions);
  }

  getLogger().info({ provider: config.provider, model: config.model }, 'Embedding provider created');
  return _provider;
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!_provider) throw new Error('Embedding provider not initialized');
  return _provider;
}
