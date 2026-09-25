import type { ScanArtifactEntry } from '../../scan/schema'
import { Endpoint, Model, ProviderBody } from './entities'
import type { Provider } from './entities'

/** Neutral entity bodies, assembled from one text-scoped scan. */
export type ExtractedScan = {
  scan_at: string
  models: Map<string, Model>
  providers: Map<string, Provider>
  endpoints: Map<string, Endpoint>
}

/** Apply product scope before assembling providers from embedded observations. */
export function hasTextModalities(model: ScanArtifactEntry['model']): boolean {
  return model.input_modalities.includes('text') && model.output_modalities.includes('text')
}

/** Assemble entities by identity, preserving source facts for downstream consumers. */
export function extractScan(scanAt: string, entries: readonly ScanArtifactEntry[]): ExtractedScan {
  const models: ExtractedScan['models'] = new Map()
  const providers: ExtractedScan['providers'] = new Map()
  const endpoints: ExtractedScan['endpoints'] = new Map()

  for (const entry of entries) {
    // Lyria music models report text input/output because they also return lyrics.
    if (entry.model_id.startsWith('google/lyria') || !hasTextModalities(entry.model)) {
      continue
    }

    models.set(
      entry.model_id,
      Model.parse({ ...entry.model, id: entry.model_id, variant: entry.variant }),
    )

    // `status` is noisy and meaningless; dropping it here keeps it out of every consumer.
    for (const { provider_info, provider_slug, status: _status, ...body } of entry.endpoints ??
      []) {
      const { slug: provider_id, ...provider } = ProviderBody.parse(provider_info)
      providers.set(provider_id, { ...provider, provider_id })

      endpoints.set(
        body.id,
        Endpoint.parse({
          ...body,
          variant: entry.variant,
          model_id: entry.model_id,
          provider_id,
          provider_tag: provider_slug,
        }),
      )
    }
  }

  return { scan_at: scanAt, models, providers, endpoints }
}
