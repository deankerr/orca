import { z } from 'zod'

/** Parse external ISO datetimes into the UTC representation used for chronological string ordering. */
export const IsoDateTime = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString())
