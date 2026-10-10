import { z } from 'zod'

import type { RawScan } from './collected'
import { assembleProviders, extractProvider } from './provider'
import type { ProviderObservation } from './provider'

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

/** Apply product scope before assembling providers from embedded observations. */
function hasTextModalities(model: RawScan['entries'][number]['model']): boolean {
  return model.input_modalities.includes('text') && model.output_modalities.includes('text')
}

/** Assemble entities by identity, preserving source facts for downstream consumers. */
export function fromCollected({ scan_at, entries }: RawScan): Scan {
  const models: Scan['models'] = new Map()
  const providerObservations: ProviderObservation[] = []
  const endpoints: Scan['endpoints'] = new Map()

  for (const entry of entries) {
    // Lyria music models report text input/output because they also return lyrics.
    if (entry.model_id.startsWith('google/lyria') || !hasTextModalities(entry.model)) {
      continue
    }

    models.set(
      entry.model_id,
      ScannedModel.parse({ ...entry.model, id: entry.model_id, variant: entry.variant }),
    )

    // `status` is noisy and meaningless; dropping it here keeps it out of every consumer.
    for (const { provider_info, provider_slug, status: _status, ...body } of entry.endpoints ??
      []) {
      const provider = extractProvider(provider_info)
      providerObservations.push({ ...provider, endpoint_id: body.id })

      endpoints.set(
        body.id,
        ScannedEndpoint.parse({
          ...body,
          variant: entry.variant,
          model_id: entry.model_id,
          provider_id: provider.provider.provider_id,
          provider_tag: provider_slug,
        }),
      )
    }
  }

  return { scan_at, models, providers: assembleProviders(providerObservations), endpoints }
}
