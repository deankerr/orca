import * as R from 'remeda'
import { z } from 'zod'

export const SCAN_ARTIFACT_OBJECT_PATH = 'scans' as const

export const IdentifiedModel = z.looseObject({
  slug: z.string(),
  permaslug: z.string(),
  input_modalities: z.array(z.string()),
  output_modalities: z.array(z.string()),
})

export const IdentifiedEndpoint = z
  .looseObject({
    id: z.string(),
    model_variant_slug: z.string(),
    variant: z.string(),
  })
  .transform((endpoint) => R.omit(endpoint, ['model']))

export const ScanArtifactEntry = z.object({
  scan_at: z.string(),
  model_id: z.string(),
  variant: z.string(),
  model: IdentifiedModel,
  endpoints: z.array(IdentifiedEndpoint).nullable(),
})

export type ScanArtifactEntry = z.infer<typeof ScanArtifactEntry>
