import { ConvexError } from 'convex/values'
import { z } from 'zod'

import type { RawScan, ScanEntry } from '#scan/collection'

import { isoDate } from '../fields'
import { ScannedEndpoint, ScannedModel } from './model'
import type { EndpointObservation, Scan, ScannedEndpointStats } from './model'
import { assembleProviders, extractProvider } from './provider'
import type { ProviderObservation } from './provider'
import { extractStats } from './stats'

/** Assemble identities and relationships before consumers apply their own projection lenses. */
export function fromCollected({ scan_at, entries }: RawScan): Scan {
  const models = new Map<string, ScannedModel>()
  const endpoints = new Map<string, z.infer<typeof EndpointInput>>()
  const stats = new Map<string, ScannedEndpointStats[]>()
  const providerObservations: ProviderObservation[] = []

  for (const entry of entries) {
    if (!inScope(entry)) {
      continue
    }

    models.set(entry.model_id, extractModel(entry))

    for (const source of entry.endpoints ?? []) {
      const provider = extractProvider(source.provider_info)
      providerObservations.push({ ...provider, endpoint_id: source.id })
      endpoints.set(source.id, extractEndpoint(source, entry, provider.provider.provider_id))
      stats.set(source.id, extractStats(source.id, source))
    }
  }

  const providers = assembleProviders(providerObservations)
  const resolved = new Map<string, EndpointObservation>()

  for (const [id, endpoint] of endpoints) {
    const model = models.get(endpoint.model_id)
    const provider = providers.get(endpoint.provider_id)

    if (model === undefined || provider === undefined) {
      throw new ConvexError({
        message: 'Endpoint is missing scan context',
        endpoint_id: id,
        model_id: endpoint.model_id,
        provider_id: endpoint.provider_id,
      })
    }

    resolved.set(id, { endpoint: { ...endpoint, ...modelContext(model) }, model, provider })
  }

  return { scan_at, models, providers, endpoints: resolved, stats: [...stats.values()].flat() }
}

function inScope(entry: ScanEntry): boolean {
  // Lyria reports text input/output for lyrics, but remains outside ORCA's model scope.
  return (
    !entry.model_id.startsWith('google/lyria') &&
    entry.model.input_modalities.includes('text') &&
    entry.model.output_modalities.includes('text')
  )
}

function extractModel(entry: ScanEntry): ScannedModel {
  return ScannedModel.parse({ ...entry.model, id: entry.model_id, variant: entry.variant })
}

const EndpointInput = ScannedEndpoint.omit({
  model_display_name: true,
  model_permaslug: true,
  model_or_created_at: true,
  input_modalities: true,
  output_modalities: true,
})

function extractEndpoint(
  source: NonNullable<ScanEntry['endpoints']>[number],
  entry: ScanEntry,
  provider_id: string,
): z.infer<typeof EndpointInput> {
  // Providers and stats are separate observations; noisy status has no retained meaning.
  const {
    provider_info: _provider,
    provider_slug,
    status: _status,
    stats: _stats,
    statsByTier: _statsByTier,
    ...body
  } = source

  return EndpointInput.parse({
    ...body,
    variant: entry.variant,
    model_id: entry.model_id,
    provider_id,
    provider_tag: provider_slug,
  })
}

const ModelContext = z.object({
  short_name: z.string(),
  permaslug: z.string(),
  created_at: isoDate,
  input_modalities: z.array(z.string()),
  output_modalities: z.array(z.string()),
})

function modelContext(model: ScannedModel) {
  const context = ModelContext.parse(model)

  return {
    model_display_name: context.short_name,
    model_permaslug: context.permaslug,
    model_or_created_at: context.created_at,
    input_modalities: context.input_modalities.toSorted(),
    output_modalities: context.output_modalities.toSorted(),
  }
}
