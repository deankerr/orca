import { z } from 'zod'

/** Loaded model with an assembled identity; other source fields remain unnormalized JSON. */
export const ScannedModel = z
  .object({
    id: z.string(),
    variant: z.string(),
    slug: z.string(),
    permaslug: z.string(),
    input_modalities: z.array(z.string()),
    output_modalities: z.array(z.string()),
  })
  .catchall(z.json())

/** Loaded provider with an assembled identity, retaining its other source fields. */
export const ScannedProvider = z.object({ provider_id: z.string() }).catchall(z.json())

/** Loaded endpoint with resolved identities and denormalized model context. */
export const ScannedEndpoint = z
  .object({
    id: z.string(),
    variant: z.string(),
    model_id: z.string(),
    provider_id: z.string(),
    provider_tag: z.string(),
    model_variant_slug: z.string(),
    model_display_name: z.string(),
    model_permaslug: z.string(),
    model_or_created_at: z.string(),
    input_modalities: z.array(z.string()),
    output_modalities: z.array(z.string()),
  })
  .catchall(z.json())

export type ScannedModel = z.infer<typeof ScannedModel>
export type ScannedProvider = z.infer<typeof ScannedProvider>
export type ScannedEndpoint = z.infer<typeof ScannedEndpoint>

/** One supplied reading, matching a stats-history row before its scan time is attached. */
export const ScannedEndpointStats = z.object({
  endpoint_id: z.string(),
  tier: z.string(),
  sample: z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
})

export type ScannedEndpointStats = z.infer<typeof ScannedEndpointStats>

/** Both relationships refer to the selected entities from this same scan. */
export type EndpointObservation = {
  endpoint: ScannedEndpoint
  model: ScannedModel
  provider: ScannedProvider
}

/** Scoped source facts; storage and product projections belong to consumers. */
export type Scan = {
  scan_at: string
  models: ReadonlyMap<string, ScannedModel>
  providers: ReadonlyMap<string, ScannedProvider>
  endpoints: ReadonlyMap<string, EndpointObservation>
  stats: readonly ScannedEndpointStats[]
}

export type ScanPair = { previous: Scan; next: Scan }
