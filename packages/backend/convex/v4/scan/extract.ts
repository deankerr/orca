import { omit } from 'convex-helpers'
import { ConvexError } from 'convex/values'
import { isDeepEqual, isPlainObject } from 'remeda'

import type { ScanArtifactEntry } from '../../scan/schema'
import { EndpointValue, SourceProvider, StoredModel } from './entities'

type Sample = Record<string, number | string | null>

/** One extracted model or provider value. */
export type ExtractedEntity = {
  entity_id: string
  raw: unknown
}

/** One in-scope endpoint, with relationships required by record storage. */
export type ExtractedEndpoint = ExtractedEntity & {
  model_id: string
  provider_id: string
  raw: EndpointValue
}

/** Scoped extraction of one loaded artifact. Readings are exact samples, not carried state. */
export type ExtractedScan = {
  scan_at: string
  models: Map<string, ExtractedEntity>
  providers: Map<string, ExtractedEntity>
  endpoints: Map<string, ExtractedEndpoint>
  readings: Array<{ endpoint_id: string; tier: string; sample: Sample }>
}

/** Text input and text output are the shared product scope. Apply this before provider selection. */
export function hasTextModalities(model: {
  input_modalities: readonly string[]
  output_modalities: readonly string[]
}): boolean {
  return model.input_modalities.includes('text') && model.output_modalities.includes('text')
}

/**
 * Extract text-scoped entity values and supplied readings from a captured scan.
 * The last admitted provider occurrence wins. Endpoint-local fields stay on the endpoint.
 */
export function extractScan(scanAt: string, entries: readonly ScanArtifactEntry[]): ExtractedScan {
  const models = new Map<string, ExtractedEntity>()
  const providers = new Map<string, ExtractedEntity>()
  const endpoints = new Map<string, ExtractedEndpoint>()
  const readings: ExtractedScan['readings'] = []

  for (const entry of entries) {
    if (!hasTextModalities(entry.model)) {
      continue
    }

    const stored = StoredModel.parse({
      model_id: entry.model_id,
      variant: entry.variant,
      model: entry.model,
    })
    const previous = models.get(entry.model_id)

    if (previous !== undefined && !isDeepEqual(previous.raw, stored)) {
      throw new ConvexError(`Scan repeats model ${entry.model_id} with conflicting values`)
    }

    models.set(entry.model_id, { entity_id: entry.model_id, raw: stored })

    for (const rawEndpoint of entry.endpoints ?? []) {
      const source = asRecord(rawEndpoint, 'endpoint')
      const provider = SourceProvider.parse(source.provider_info)
      const extracted = extractEndpoint(entry.model_id, provider.slug, source)
      const existing = endpoints.get(extracted.entity_id)

      if (existing !== undefined) {
        throw new ConvexError(`Scan repeats endpoint ${extracted.entity_id}`)
      }

      endpoints.set(extracted.entity_id, extracted)
      // Last text-eligible occurrence in encounter order selects the provider record.
      providers.set(extracted.provider_id, {
        entity_id: extracted.provider_id,
        raw: provider,
      })
      readings.push(...extractReadings(extracted.entity_id, source))
    }
  }

  return { scan_at: scanAt, models, providers, endpoints, readings }
}

function extractEndpoint(
  modelId: string,
  providerId: string,
  endpoint: Record<string, unknown>,
): ExtractedEndpoint {
  const raw = EndpointValue.parse({
    ...omit(endpoint, ['provider_info', 'model', 'provider_slug', 'stats', 'statsByTier']),
    provider_tag: endpoint.provider_slug,
  })
  const rawModelId = endpoint.model_variant_slug

  if (typeof rawModelId === 'string' && rawModelId !== modelId) {
    throw new ConvexError(
      `Endpoint ${raw.id} model ${rawModelId} does not match scan entry ${modelId}`,
    )
  }

  return {
    entity_id: raw.id,
    model_id: modelId,
    provider_id: providerId,
    raw,
  }
}

function extractReadings(
  endpointId: string,
  endpoint: Record<string, unknown>,
): ExtractedScan['readings'] {
  const samples = new Map<string, Sample>()

  if (endpoint.stats !== undefined) {
    samples.set('default', flatSample(endpoint.stats, endpointId, 'default'))
  }

  if (endpoint.statsByTier !== undefined) {
    const tiers = asRecord(endpoint.statsByTier, `endpoint ${endpointId} statsByTier`)

    for (const [tier, value] of Object.entries(tiers)) {
      if (value === undefined) {
        continue
      }

      const sample = flatSample(value, endpointId, tier)
      const existing = samples.get(tier)

      if (existing !== undefined && !isDeepEqual(existing, sample)) {
        throw new ConvexError(`Endpoint ${endpointId} has conflicting ${tier} samples`)
      }

      samples.set(tier, sample)
    }
  }

  return [...samples.entries()].map(([tier, sample]) => ({ endpoint_id: endpointId, tier, sample }))
}

function flatSample(value: unknown, endpointId: string, tier: string): Sample {
  const record = asRecord(value, `endpoint ${endpointId} ${tier} sample`)
  const sample: Sample = {}

  for (const [key, nested] of Object.entries(record)) {
    if (key === 'endpoint_id') {
      continue
    }

    if (!isStorageKey(key) || !isSampleValue(nested)) {
      throw new ConvexError(
        `Endpoint ${endpointId} tier ${tier} has an unsupported sample field ${key}`,
      )
    }

    sample[key] = nested
  }

  return sample
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new ConvexError(`${label} must be an object`)
  }

  return value
}

function isSampleValue(value: unknown): value is number | string | null {
  return value === null || typeof value === 'number' || typeof value === 'string'
}

function isStorageKey(key: string): boolean {
  return key.length > 0 && !key.startsWith('$') && !key.startsWith('_')
}
