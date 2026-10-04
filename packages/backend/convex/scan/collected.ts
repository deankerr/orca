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
  .transform(({ model: _model, ...endpoint }) => endpoint)

/** One model and its endpoints collected from OpenRouter. */
export type ScanEntry = {
  model_id: string
  variant: string
  model: z.infer<typeof IdentifiedModel>
  endpoints: z.infer<typeof IdentifiedEndpoint>[] | null
}

/** Capture assembled from parsed OpenRouter responses; scan_at comes from Date.toISOString(). */
export type RawScan = {
  scan_at: string
  entries: ScanEntry[]
}
