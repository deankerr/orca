import { z } from 'zod'

import { isoDate } from '../../fields'

export const ExtractedModel = z
  .object({
    created_at: isoDate,
    id: z.string(),
    input_modalities: z.array(z.string()).transform((modalities) => modalities.toSorted()),
    output_modalities: z.array(z.string()).transform((modalities) => modalities.toSorted()),
    permaslug: z.string(),
    short_name: z.string(),
    slug: z.string(),
    variant: z.string(),
  })
  .catchall(z.json())

export const ExtractedProvider = z
  .object({ displayName: z.string(), provider_id: z.string() })
  .catchall(z.json())

export const ExtractedEndpoint = z
  .object({
    id: z.string(),
    input_modalities: z.array(z.string()),
    model_display_name: z.string(),
    model_id: z.string(),
    model_or_created_at: z.string(),
    model_permaslug: z.string(),
    model_variant_slug: z.string(),
    output_modalities: z.array(z.string()),
    provider_id: z.string(),
    provider_tag: z.string(),
    variant: z.string(),
  })
  .catchall(z.json())

export const ExtractedStats = z.object({
  endpoint_id: z.string(),
  sample: z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
  tier: z.string(),
})

export type ExtractedModel = z.infer<typeof ExtractedModel>
export type ExtractedProvider = z.infer<typeof ExtractedProvider>
export type ExtractedEndpoint = z.infer<typeof ExtractedEndpoint>
export type ExtractedStats = z.infer<typeof ExtractedStats>

/** Every model and provider has at least one endpoint, and every endpoint's parents are present. */
export type Scan = {
  scan_at: string
  models: ReadonlyMap<string, ExtractedModel>
  providers: ReadonlyMap<string, ExtractedProvider>
  endpoints: ReadonlyMap<string, ExtractedEndpoint>
  stats: readonly ExtractedStats[]
}
