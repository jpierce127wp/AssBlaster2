import { randomBytes } from 'node:crypto';
import { loadConfig } from '../app/config.js';
import { getRedis } from '../lib/infra/redis.js';
import { getLogger } from '../observability/logger.js';
import { ExternalServiceError } from '../domain/errors.js';
import type { ClioTokens } from './clio.types.js';

const TOKEN_KEY = 'clio:oauth:tokens';
const STATE_KEY_PREFIX = 'clio:oauth:state:';
const STATE_TTL_SECONDS = 600; // 10 minutes

export class ClioAuth {
  /** Get current valid access token, refreshing if needed */
  async getAccessToken(): Promise<string> {
    const redis = getRedis();
    const tokensJson = await redis.get(TOKEN_KEY);

    if (!tokensJson) {
      throw new ExternalServiceError('Clio', 'No OAuth tokens found. Complete OAuth flow first.');
    }

    const tokens: ClioTokens = JSON.parse(tokensJson);

    // Refresh if expiring within 5 minutes
    if (Date.now() / 1000 > tokens.expires_at - 300) {
      return this.refresh(tokens.refresh_token);
    }

    return tokens.access_token;
  }

  /** Exchange authorization code for tokens */
  async exchangeCode(code: string): Promise<ClioTokens> {
    const config = loadConfig();
    const logger = getLogger();

    const response = await fetch('https://app.clio.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.clioClientId ?? '',
        client_secret: config.clioClientSecret ?? '',
        redirect_uri: config.clioRedirectUri ?? '',
      }).toString(),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new ExternalServiceError('Clio', `Token exchange failed: ${response.status} ${body}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    };

    const tokens: ClioTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
      token_type: data.token_type,
    };

    // Store tokens in Redis with TTL (token lifetime + 1 hour buffer for refresh)
    const redis = getRedis();
    const ttl = data.expires_in + 3600;
    await redis.set(TOKEN_KEY, JSON.stringify(tokens), 'EX', ttl);

    logger.info('Clio OAuth tokens stored');
    return tokens;
  }

  /** Refresh access token */
  private async refresh(refreshToken: string): Promise<string> {
    const config = loadConfig();
    const logger = getLogger();

    const response = await fetch('https://app.clio.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clioClientId ?? '',
        client_secret: config.clioClientSecret ?? '',
      }).toString(),
    });

    if (!response.ok) {
      throw new ExternalServiceError('Clio', `Token refresh failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      token_type: string;
    };

    const tokens: ClioTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
      token_type: data.token_type,
    };

    const redis = getRedis();
    const ttl = data.expires_in + 3600;
    await redis.set(TOKEN_KEY, JSON.stringify(tokens), 'EX', ttl);

    logger.info('Clio OAuth tokens refreshed');
    return tokens.access_token;
  }

  /** Generate a random OAuth state and store in Redis */
  async generateState(): Promise<string> {
    const state = randomBytes(32).toString('hex');
    const redis = getRedis();
    await redis.set(`${STATE_KEY_PREFIX}${state}`, '1', 'EX', STATE_TTL_SECONDS);
    return state;
  }

  /** Validate an OAuth state param against Redis (single-use) */
  async validateState(state: string): Promise<boolean> {
    const redis = getRedis();
    const key = `${STATE_KEY_PREFIX}${state}`;
    const exists = await redis.del(key);
    return exists === 1;
  }

  /** Get the authorization URL with CSRF state */
  async getAuthorizationUrl(): Promise<{ url: string; state: string }> {
    const config = loadConfig();
    const state = await this.generateState();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clioClientId ?? '',
      redirect_uri: config.clioRedirectUri ?? '',
      state,
    });
    return {
      url: `https://app.clio.com/oauth/authorize?${params.toString()}`,
      state,
    };
  }
}
