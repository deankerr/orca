import { z } from 'zod'

/** Shared Catalog interpretation: invalid optional facts remain unknown. */
export const text = z.string().trim().min(1).nullable().catch(null)
export const flag = z.boolean().nullable().catch(null)
export const strings = z.array(z.string()).nullable().catch(null)
export const date = z
  .string()
  .pipe(z.coerce.date())
  .transform((value) => value.toISOString())

const Metadata = z.record(z.string(), z.json())
export const metadata = z.string().transform((json) => Metadata.parse(JSON.parse(json)))
