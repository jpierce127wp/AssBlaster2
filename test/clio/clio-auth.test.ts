import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis, config, logger
const mockRedis = { get: vi.fn(), set: vi.fn() };

vi.mock('../../src/lib/infra/redis.js', () => ({
  getRedis: () => mockRedis,
}));
vi.mock('../../src/app/config.js', () => ({
  loadConfig: () => ({
    clioClientId: 'client-id',
    clioClientSecret: 'client-secret',
    clioRedirectUri: 'http://localhost:3000/callback',
  }),
}));
vi.mock('../../src/observability/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() }),
}));

import { ClioAuth } from '../../src/clio/clio.auth.js';

describe('ClioAuth', () => {
  let auth: ClioAuth;

  beforeEach(() => {
    vi.clearAllMocks();
    auth = new ClioAuth();
  });

  describe('getAccessToken', () => {
    it('returns cached token when not expired', async () => {
      const tokens = {
        access_token: 'valid-token',
        refresh_token: 'refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        token_type: 'Bearer',
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(tokens));

      const token = await auth.getAccessToken();
      expect(token).toBe('valid-token');
    });

    it('refreshes token when near expiry', async () => {
      const tokens = {
        access_token: 'old-token',
        refresh_token: 'refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 100, // Expiring within 5 minutes
        token_type: 'Bearer',
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(tokens));
      mockRedis.set.mockResolvedValue('OK');

      const mockResponse = {
        ok: true,
        json: async () => ({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const token = await auth.getAccessToken();
      expect(token).toBe('new-token');
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('throws when no tokens stored', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(auth.getAccessToken()).rejects.toThrow('No OAuth tokens found');
    });

    it('throws when refresh fails', async () => {
      const tokens = {
        access_token: 'old-token',
        refresh_token: 'refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 100,
        token_type: 'Bearer',
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(tokens));

      const mockResponse = {
        ok: false,
        status: 400,
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      await expect(auth.getAccessToken()).rejects.toThrow('Token refresh failed');
    });
  });

  describe('exchangeCode', () => {
    it('calls Clio OAuth endpoint with correct parameters', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const mockResponse = {
        ok: true,
        json: async () => ({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const tokens = await auth.exchangeCode('auth-code-123');

      expect(fetch).toHaveBeenCalledWith(
        'https://app.clio.com/oauth/token',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('authorization_code'),
        }),
      );
      expect(tokens.access_token).toBe('new-access');
    });

    it('stores tokens in Redis', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const mockResponse = {
        ok: true,
        json: async () => ({
          access_token: 'stored-token',
          refresh_token: 'stored-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      await auth.exchangeCode('code');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'clio:oauth:tokens',
        expect.stringContaining('stored-token'),
        'EX',
        expect.any(Number),
      );
    });

    it('throws on failed token exchange', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        text: async () => 'Bad Request',
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      await expect(auth.exchangeCode('bad-code')).rejects.toThrow('Token exchange failed');
    });
  });

  describe('getAuthorizationUrl', () => {
    it('returns URL with client_id and redirect_uri', () => {
      const url = auth.getAuthorizationUrl();

      expect(url).toContain('https://app.clio.com/oauth/authorize');
      expect(url).toContain('client_id=client-id');
      expect(url).toContain('response_type=code');
      expect(url).toContain(encodeURIComponent('http://localhost:3000/callback'));
    });
  });
});
