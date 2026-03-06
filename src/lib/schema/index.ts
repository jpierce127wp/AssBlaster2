/**
 * Zod schemas, validation helpers, and schema composition utilities.
 */

import { z } from 'zod';

/** ISO date string (YYYY-MM-DD or full ISO 8601) */
export const dateString = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  { message: 'Invalid date string' },
);

/** Non-empty trimmed string */
export const nonEmptyString = z.string().min(1).trim();

/** UUID string */
export const uuidString = z.string().uuid();

/** Pagination schema with defaults */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

import { ValidationError } from '../../domain/errors.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate a string looks like a UUID. Returns the string or throws ValidationError. */
export function validateId(id: string, label: string): string {
  if (!UUID_RE.test(id)) {
    throw new ValidationError(`Invalid ${label} format: expected UUID`);
  }
  return id;
}

/** Parse limit/offset query params safely (NaN → default). */
export function parsePagination(query: { limit?: string; offset?: string }): PaginationInput {
  return paginationSchema.parse(query);
}
