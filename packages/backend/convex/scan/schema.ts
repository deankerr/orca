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

/** Loaded endpoint with explicit relationships; other source fields remain available to consumers. */
export const ScannedEndpoint = z
  .object({
    id: z.string(),
    variant: z.string(),
    model_id: z.string(),
    provider_id: z.string(),
    provider_tag: z.string(),
    model_variant_slug: z.string(),
  })
  .catchall(z.json())

export type ScannedModel = z.infer<typeof ScannedModel>
export type ScannedProvider = z.infer<typeof ScannedProvider>
export type ScannedEndpoint = z.infer<typeof ScannedEndpoint>

/** Models, providers and endpoints from one collection, within ORCA's product scope. */
export type Scan = {
  scan_at: string
  models: Map<string, ScannedModel>
  providers: Map<string, ScannedProvider>
  endpoints: Map<string, ScannedEndpoint>
}

export type ScanPair = { previous: Scan; next: Scan }
