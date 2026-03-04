import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig, resetConfig } from '../../src/app/config.js';

describe('loadConfig', () => {
  afterEach(() => {
    resetConfig();
  });

  it('should parse valid environment variables', () => {
    const config = loadConfig({
      PROCESS_ROLE: 'api',
      PORT: '4000',
      HOST: '127.0.0.1',
      LOG_LEVEL: 'debug',
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      ANTHROPIC_API_KEY: 'sk-ant-test',
      EMBEDDING_PROVIDER: 'voyage',
      VOYAGE_API_KEY: 'pa-test',
      EMBEDDING_MODEL: 'voyage-3',
      EMBEDDING_DIMENSIONS: '1536',
      API_KEY: 'test-key',
      DEFAULT_TENANT_ID: 'tenant1',
    });

    expect(config.processRole).toBe('api');
    expect(config.port).toBe(4000);
    expect(config.host).toBe('127.0.0.1');
    expect(config.logLevel).toBe('debug');
    expect(config.databaseUrl).toBe('postgres://test:test@localhost:5432/test');
    expect(config.anthropicApiKey).toBe('sk-ant-test');
    expect(config.apiKey).toBe('test-key');
  });

  it('should use defaults for optional fields', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      ANTHROPIC_API_KEY: 'sk-ant-test',
      API_KEY: 'test-key',
    });

    expect(config.processRole).toBe('both');
    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe('info');
    expect(config.defaultTenantId).toBe('default');
  });

  it('should throw on missing required fields', () => {
    expect(() => loadConfig({})).toThrow();
  });
});
