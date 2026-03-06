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
