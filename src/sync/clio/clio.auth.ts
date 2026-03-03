import { loadConfig } from '../../kernel/config.js';
import { getRedis } from '../../kernel/redis.js';
import { getLogger } from '../../kernel/logger.js';
import { ExternalServiceError } from '../../kernel/errors.js';
import type { ClioTokens } from './clio.types.js';

const TOKEN_KEY = 'clio:oauth:tokens';

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: config.clioClientId,
        client_secret: config.clioClientSecret,
        redirect_uri: config.clioRedirectUri,
      }),
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

    // Store tokens in Redis
    const redis = getRedis();
    await redis.set(TOKEN_KEY, JSON.stringify(tokens));

    logger.info('Clio OAuth tokens stored');
    return tokens;
  }

  /** Refresh access token */
  private async refresh(refreshToken: string): Promise<string> {
    const config = loadConfig();
    const logger = getLogger();

    const response = await fetch('https://app.clio.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clioClientId,
        client_secret: config.clioClientSecret,
      }),
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
    await redis.set(TOKEN_KEY, JSON.stringify(tokens));

    logger.info('Clio OAuth tokens refreshed');
    return tokens.access_token;
  }

  /** Get the authorization URL */
  getAuthorizationUrl(): string {
    const config = loadConfig();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clioClientId ?? '',
      redirect_uri: config.clioRedirectUri ?? '',
    });
    return `https://app.clio.com/oauth/authorize?${params.toString()}`;
  }
}
