import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ClioAuth } from './clio.auth.js';
import { loadConfig } from '../app/config.js';
import { getLogger } from '../observability/logger.js';

const clioAuth = new ClioAuth();

/** Derive the frontend origin from the CLIO_REDIRECT_URI config */
function getFrontendOrigin(): string {
  const config = loadConfig();
  if (config.clioRedirectUri) {
    const url = new URL(config.clioRedirectUri);
    return url.origin;
  }
  return '';
}

export async function clioRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/v1/clio/authorize — Redirect user to Clio OAuth consent screen */
  app.get('/clio/authorize', async (_request: FastifyRequest, reply: FastifyReply) => {
    const { url } = await clioAuth.getAuthorizationUrl();
    return reply.redirect(url);
  });

  /** GET /api/v1/clio/callback — Handle OAuth callback from Clio */
  app.get('/clio/callback', async (request: FastifyRequest<{ Querystring: { code?: string; state?: string; error?: string; error_description?: string } }>, reply: FastifyReply) => {
    const logger = getLogger();
    const { code, state, error, error_description } = request.query;
    const origin = getFrontendOrigin();

    if (error) {
      logger.warn({ error, error_description }, 'Clio OAuth authorization denied');
      return reply.redirect(`${origin}/clio?error=${encodeURIComponent(error_description ?? 'Authorization was denied by the user')}`);
    }

    if (!code) {
      return reply.redirect(`${origin}/clio?error=` + encodeURIComponent('No authorization code received from Clio'));
    }

    // Validate CSRF state
    if (!state || !(await clioAuth.validateState(state))) {
      logger.warn('Clio OAuth callback received with invalid or missing state parameter');
      return reply.redirect(`${origin}/clio?error=` + encodeURIComponent('Invalid OAuth state. Please try connecting again.'));
    }

    try {
      await clioAuth.exchangeCode(code);
      logger.info('Clio OAuth flow completed successfully');
      return reply.redirect(`${origin}/clio?connected=true`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Token exchange failed';
      logger.error({ err }, 'Clio OAuth token exchange failed');
      return reply.redirect(`${origin}/clio?error=` + encodeURIComponent(message));
    }
  });

  /** GET /api/v1/clio/status — Check OAuth connection status */
  app.get('/clio/status', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      await clioAuth.getAccessToken();
      return reply.send({ connected: true });
    } catch {
      return reply.send({ connected: false });
    }
  });
}
