import * as R from 'remeda'
import { z } from 'zod'

/** Model fields required to identify and project a scan entry. */
export const IdentifiedModel = z.looseObject({
  slug: z.string(),
  permaslug: z.string(),
  input_modalities: z.array(z.string()),
  output_modalities: z.array(z.string()),
})

/** Endpoint fields required to identify and project a scan entry. */
export const IdentifiedEndpoint = z
  .looseObject({
    id: z.string(),
    model_variant_slug: z.string(),
    variant: z.string(),
  })
  .transform((endpoint) => R.omit(endpoint, ['model']))

/** One model and its endpoints collected from OpenRouter. */
export const ScanEntry = z.object({
  model_id: z.string(),
  variant: z.string(),
  model: IdentifiedModel,
  endpoints: z.array(IdentifiedEndpoint).nullable(),
})

export type ScanEntry = z.infer<typeof ScanEntry>

/** Collected entries before scan extraction; retained for the public API compatibility adapter. */
export type RawScan = {
  scan_at: string
  entries: ScanEntry[]
}
