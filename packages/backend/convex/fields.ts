import { z } from 'zod'

/** Shared field interpretation: invalid optional facts remain unknown. */
export const textOrNull = z.string().trim().min(1).nullable().catch(null)
export const flagOrNull = z.boolean().nullable().catch(null)
export const stringsOrNull = z.array(z.string()).nullable().catch(null)

/** Parse a valid date string into ISO format; invalid values throw. */
export const isoDate = z
  .string()
  .pipe(z.coerce.date())
  .transform((value) => value.toISOString())
