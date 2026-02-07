import { z } from "zod";

/** Max length for pagination cursor to prevent abuse. */
const CURSOR_MAX_LENGTH = 256;

/**
 * Validates an optional opaque pagination cursor.
 * - Absent/undefined: valid (no cursor).
 * - Non-empty string, max 256 chars, no leading/trailing whitespace: valid.
 * - Rejects: null, empty/whitespace-only, numbers, booleans, objects, mutated tokens.
 * No coercion or trim; invalid values fail explicitly so cursor is never mutated.
 */
const cursorSchema = z
  .union([z.string(), z.undefined()])
  .refine(
    (v) => {
      if (v === undefined) return true;
      const s = typeof v === "string" ? v : "";
      return (
        s.length > 0 &&
        s.length <= CURSOR_MAX_LENGTH &&
        s === s.trim()
      );
    },
    {
      message: `cursor must be absent or a non-empty string of at most ${CURSOR_MAX_LENGTH} characters without leading/trailing whitespace`,
    }
  );

export const SearchQuerySchema = z.object({
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  radius: z.coerce.number().default(5),

  checkIn: z.union([z.date(), z.string()]).transform((v) => (v instanceof Date ? v : new Date(v))),
  checkOut: z.union([z.date(), z.string()]).transform((v) => (v instanceof Date ? v : new Date(v))),

  adults: z.coerce.number().min(1).default(1),
  children: z.coerce.number().min(0).default(0),

  pageSize: z.coerce.number().default(24),
  cursor: cursorSchema,
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;
