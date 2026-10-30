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

/** An optional upstream timestamp; invalid values are unknown. */
export const isoDateOrNull = isoDate.nullable().catch(null)

/** Upstream deprecation dates from this year on are placeholders; 2098 has been seen. */
const PLACEHOLDER_YEAR = 2050

/** A scheduled deprecation; placeholder and invalid dates are unknown. */
export const deprecationDateOrNull = isoDateOrNull.transform((value) =>
  value !== null && new Date(value).getUTCFullYear() >= PLACEHOLDER_YEAR ? null : value,
)
