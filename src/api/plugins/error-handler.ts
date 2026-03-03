import type { FastifyInstance } from 'fastify';
import { DomainError, PipelineError } from '../../kernel/errors.js';
import { getLogger } from '../../kernel/logger.js';

export async function errorHandlerPlugin(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error, request, reply) => {
    const logger = getLogger();

    if (error instanceof PipelineError) {
      logger.warn(
        { code: error.code, statusCode: error.statusCode, stage: error.stage, entityId: error.entityId, path: request.url },
        error.message,
      );
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
        retryable: error.retryable,
        entityId: error.entityId,
        stage: error.stage,
        metadata: error.metadata,
      });
    }

    if (error instanceof DomainError) {
      logger.warn(
        { code: error.code, statusCode: error.statusCode, path: request.url },
        error.message,
      );
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
        details: error.details,
      });
    }

    // Fastify validation errors
    const fastifyError = error as { validation?: unknown; message?: string };
    if (fastifyError.validation) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: fastifyError.message,
        details: fastifyError.validation,
      });
    }

    logger.error({ err: error, path: request.url }, 'Unhandled error');
    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'An internal error occurred',
    });
  });
}
