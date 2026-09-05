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

/** One validated model and its endpoints in a scan artifact. */
export const ScanArtifactEntry = z.object({
  scan_at: z.string(),
  model_id: z.string(),
  variant: z.string(),
  model: IdentifiedModel,
  endpoints: z.array(IdentifiedEndpoint).nullable(),
})

/** Parsed scan artifact entry. */
export type ScanArtifactEntry = z.infer<typeof ScanArtifactEntry>
