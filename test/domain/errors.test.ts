import { describe, it, expect } from 'vitest';
import {
  DomainError,
  NotFoundError,
  ConflictError,
  ValidationError,
  IdempotencyConflictError,
  ExternalServiceError,
  AuthenticationError,
  PipelineError,
} from '../../src/domain/errors.js';

describe('DomainError', () => {
  it('should set message, code, and statusCode', () => {
    const err = new DomainError('test message', 'TEST_CODE', 422, { extra: true });
    expect(err.message).toBe('test message');
    expect(err.code).toBe('TEST_CODE');
    expect(err.statusCode).toBe(422);
    expect(err.details).toEqual({ extra: true });
  });

  it('should default statusCode to 500', () => {
    const err = new DomainError('msg', 'CODE');
    expect(err.statusCode).toBe(500);
  });

  it('should be an instance of Error', () => {
    const err = new DomainError('msg', 'CODE');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DomainError);
  });
});

describe('NotFoundError', () => {
  it('should format message with entity and id', () => {
    const err = new NotFoundError('Task', 'task-123');
    expect(err.message).toBe('Task not found: task-123');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.name).toBe('NotFoundError');
  });

  it('should be an instance of DomainError', () => {
    expect(new NotFoundError('X', '1')).toBeInstanceOf(DomainError);
  });
});

describe('ConflictError', () => {
  it('should set 409 status', () => {
    const err = new ConflictError('already exists');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err.name).toBe('ConflictError');
  });
});

describe('ValidationError', () => {
  it('should set 400 status and pass details', () => {
    const details = [{ field: 'name', issue: 'required' }];
    const err = new ValidationError('Invalid input', details);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toEqual(details);
  });
});

describe('IdempotencyConflictError', () => {
  it('should format message with key', () => {
    const err = new IdempotencyConflictError('key-abc');
    expect(err.message).toBe('Duplicate idempotency key: key-abc');
    expect(err.name).toBe('IdempotencyConflictError');
  });

  it('should be instance of ConflictError and DomainError', () => {
    const err = new IdempotencyConflictError('k');
    expect(err).toBeInstanceOf(ConflictError);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.statusCode).toBe(409);
  });
});

describe('ExternalServiceError', () => {
  it('should format message with service name', () => {
    const err = new ExternalServiceError('Clio', 'timeout');
    expect(err.message).toBe('Clio: timeout');
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe('EXTERNAL_SERVICE_ERROR');
  });
});

describe('AuthenticationError', () => {
  it('should use default message', () => {
    const err = new AuthenticationError();
    expect(err.message).toBe('Authentication required');
    expect(err.statusCode).toBe(401);
  });

  it('should accept custom message', () => {
    const err = new AuthenticationError('Token expired');
    expect(err.message).toBe('Token expired');
  });
});

describe('PipelineError', () => {
  it('should set retryable, entityId, stage, and metadata', () => {
    const err = new PipelineError('extraction failed', {
      retryable: true,
      entityId: 'ev-001',
      stage: 'extraction',
      metadata: { attempt: 3 },
    });
    expect(err.retryable).toBe(true);
    expect(err.entityId).toBe('ev-001');
    expect(err.stage).toBe('extraction');
    expect(err.metadata).toEqual({ attempt: 3 });
    expect(err.code).toBe('PIPELINE_ERROR');
    expect(err.name).toBe('PipelineError');
  });

  it('should default retryable to false and metadata to empty', () => {
    const err = new PipelineError('fail', { entityId: 'e1', stage: 'dedup' });
    expect(err.retryable).toBe(false);
    expect(err.metadata).toEqual({});
  });

  it('should accept custom code and statusCode', () => {
    const err = new PipelineError('not found', {
      code: 'TASK_NOT_FOUND',
      statusCode: 404,
      entityId: 'ct-1',
      stage: 'assignment',
    });
    expect(err.code).toBe('TASK_NOT_FOUND');
    expect(err.statusCode).toBe(404);
  });

  it('should be instance of DomainError and Error', () => {
    const err = new PipelineError('x', { entityId: 'e', stage: 's' });
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
  });
});
