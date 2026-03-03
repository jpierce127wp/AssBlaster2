import { z } from 'zod';

const configSchema = z.object({
  processRole: z.enum(['api', 'worker', 'both', 'migrator']).default('both'),
  port: z.coerce.number().default(3000),
  host: z.string().default('0.0.0.0'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  databaseUrl: z.string().min(1),
  redisUrl: z.string().default('redis://localhost:6379'),
  anthropicApiKey: z.string().min(1),
  embeddingProvider: z.enum(['voyage', 'openai']).default('voyage'),
  voyageApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
  embeddingModel: z.string().default('voyage-3'),
  embeddingDimensions: z.coerce.number().default(1536),
  clioClientId: z.string().optional(),
  clioClientSecret: z.string().optional(),
  clioRedirectUri: z.string().optional(),
  clioApiBase: z.string().default('https://app.clio.com/api/v4'),
  apiKey: z.string().min(1),
  defaultTenantId: z.string().default('default'),
});

export type Config = z.infer<typeof configSchema>;

let _config: Config | null = null;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  if (_config) return _config;

  _config = configSchema.parse({
    processRole: env.PROCESS_ROLE,
    port: env.PORT,
    host: env.HOST,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    embeddingProvider: env.EMBEDDING_PROVIDER,
    voyageApiKey: env.VOYAGE_API_KEY,
    openaiApiKey: env.OPENAI_API_KEY,
    embeddingModel: env.EMBEDDING_MODEL,
    embeddingDimensions: env.EMBEDDING_DIMENSIONS,
    clioClientId: env.CLIO_CLIENT_ID,
    clioClientSecret: env.CLIO_CLIENT_SECRET,
    clioRedirectUri: env.CLIO_REDIRECT_URI,
    clioApiBase: env.CLIO_API_BASE,
    apiKey: env.API_KEY,
    defaultTenantId: env.DEFAULT_TENANT_ID,
  });

  return _config;
}

export function resetConfig(): void {
  _config = null;
}
