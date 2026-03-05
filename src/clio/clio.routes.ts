import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ClioAuth } from './clio.auth.js';
import { getLogger } from '../observability/logger.js';

const clioAuth = new ClioAuth();

export async function clioRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/v1/clio/authorize — Redirect user to Clio OAuth consent screen */
  app.get('/clio/authorize', async (_request: FastifyRequest, reply: FastifyReply) => {
    const url = clioAuth.getAuthorizationUrl();
    return reply.redirect(url);
  });

  /** GET /api/v1/clio/callback — Handle OAuth callback from Clio */
  app.get('/clio/callback', async (request: FastifyRequest<{ Querystring: { code?: string; error?: string; error_description?: string } }>, reply: FastifyReply) => {
    const logger = getLogger();
    const { code, error, error_description } = request.query;

    if (error) {
      logger.warn({ error, error_description }, 'Clio OAuth authorization denied');
      return reply.status(400).send({
        error: 'oauth_denied',
        message: error_description ?? 'Authorization was denied by the user',
      });
    }

    if (!code) {
      return reply.status(400).send({
        error: 'missing_code',
        message: 'No authorization code received from Clio',
      });
    }

    const tokens = await clioAuth.exchangeCode(code);

    logger.info('Clio OAuth flow completed successfully');

    return reply.send({
      status: 'connected',
      token_type: tokens.token_type,
      expires_at: new Date(tokens.expires_at * 1000).toISOString(),
    });
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
