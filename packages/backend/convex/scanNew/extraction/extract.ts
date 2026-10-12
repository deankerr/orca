import * as R from 'remeda'

import type { RawScan, ScanEntry } from '#scan/collection'

import { assembleProviders, providerId, ProviderInput } from './providers'
import { ExtractedEndpoint, ExtractedModel } from './schema'
import type { ExtractedStats, Scan } from './schema'
import { extractStats } from './stats'

export function extractScan({ scan_at, entries }: RawScan): Scan {
  const models = new Map<string, ExtractedModel>()
  const endpoints = new Map<string, ExtractedEndpoint>()
  const stats = new Map<string, ExtractedStats[]>()
  const providers: ProviderInput[] = []

  for (const entry of R.sortBy(entries.filter(filterModelScope), R.prop('model_id'))) {
    const model = extractModel(entry)
    models.set(model.id, model)

    for (const source of R.sortBy(entry.endpoints ?? [], R.prop('id'))) {
      const provider = ProviderInput.parse(source.provider_info)
      const endpoint = extractEndpoint(source, model, providerId(provider.slug))

      endpoints.set(endpoint.id, endpoint)
      stats.set(endpoint.id, extractStats(endpoint.id, source))
      providers.push(provider)
    }
  }

  return {
    scan_at,
    models,
    providers: assembleProviders(providers),
    endpoints,
    stats: [...stats.values()].flat(),
  }
}

function filterModelScope(entry: ScanEntry): boolean {
  // Lyria reports text input/output for lyrics, but remains outside ORCA's model scope.
  return (
    !entry.model_id.startsWith('google/lyria') &&
    entry.model.input_modalities.includes('text') &&
    entry.model.output_modalities.includes('text')
  )
}

function extractModel(entry: ScanEntry): ExtractedModel {
  return ExtractedModel.parse({ ...entry.model, id: entry.model_id, variant: entry.variant })
}

function extractEndpoint(
  source: NonNullable<ScanEntry['endpoints']>[number],
  model: ExtractedModel,
  provider_id: string,
): ExtractedEndpoint {
  return ExtractedEndpoint.parse({
    ...R.omit(source, ['provider_info', 'provider_slug', 'status', 'stats', 'statsByTier']),
    variant: model.variant,
    model_id: model.id,
    provider_id,
    provider_tag: source.provider_slug,
    model_display_name: model.short_name,
    model_permaslug: model.permaslug,
    model_or_created_at: model.created_at,
    input_modalities: model.input_modalities,
    output_modalities: model.output_modalities,
  })
}
